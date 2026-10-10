/*
 * Tell the browser's H.264 decoder that frames are never reordered.
 *
 * The device's encoder writes no B-frames, but its SPS does not say so: the VUI
 * is there (for the frame rate) with no bitstream_restriction in it. Without
 * max_num_reorder_frames = 0 a decoder has to assume frames may come out of
 * order and holds a few back before showing any. Chrome's hardware decoder
 * held about four - 174 ms at 1080p, measured, more than the whole device.
 * So the restriction is added here, to every SPS, before decoding.
 *
 * Only the layout this encoder writes is handled (Baseline, no HRD); anything
 * else is passed through untouched.
 */

class Bits {
  pos = 0;
  readonly b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  u(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos >> 3];
      if (byte === undefined) throw new Error("short");
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  ue(): number {
    let zeros = 0;
    while (this.u(1) === 0) {
      if (++zeros > 31) throw new Error("bad ue");
    }
    return zeros ? 2 ** zeros - 1 + this.u(zeros) : 0;
  }
  se(): number {
    const k = this.ue();
    return k & 1 ? (k + 1) / 2 : -k / 2;
  }
}

class Writer {
  bits: number[] = [];
  u(n: number, v: number) {
    for (let i = n - 1; i >= 0; i--) this.bits.push(Math.floor(v / 2 ** i) & 1);
  }
  ue(v: number) {
    const len = Math.floor(Math.log2(v + 1));
    this.u(len, 0);
    this.u(len + 1, v + 1);
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, i) => {
      if (bit) out[i >> 3] |= 0x80 >> (i & 7);
    });
    return out;
  }
}

function unescape(nal: Uint8Array): Uint8Array {
  const out: number[] = [];
  let zeros = 0;
  for (const x of nal) {
    if (zeros >= 2 && x === 3) {
      zeros = 0;
      continue;
    }
    out.push(x);
    zeros = x === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}

function escape(rbsp: Uint8Array): Uint8Array {
  const out: number[] = [];
  let zeros = 0;
  for (const x of rbsp) {
    if (zeros >= 2 && x <= 3) {
      out.push(3);
      zeros = 0;
    }
    out.push(x);
    zeros = x === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}

/**
 * The SPS NAL (header byte included, escaped as on the wire) with the reorder
 * restriction added, or null when it already has one or is a layout this does
 * not know.
 */
export function patchSps(nal: Uint8Array): Uint8Array | null {
  try {
    const rbsp = unescape(nal.subarray(1));
    const r = new Bits(rbsp);
    const profile = r.u(8);
    r.u(16); /* constraints, level */
    r.ue(); /* sps id */
    if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) return null;
    r.ue(); /* log2_max_frame_num - 4 */
    const poc = r.ue();
    if (poc === 0) r.ue();
    else if (poc === 1) {
      r.u(1);
      r.se();
      r.se();
      const n = r.ue();
      for (let i = 0; i < n; i++) r.se();
    }
    r.ue(); /* max_num_ref_frames */
    r.u(1);
    r.ue();
    r.ue(); /* size in macroblocks */
    if (!r.u(1)) r.u(1); /* frame_mbs_only, else mbaff */
    r.u(1); /* direct_8x8 */
    if (r.u(1)) {
      r.ue();
      r.ue();
      r.ue();
      r.ue();
    }
    if (!r.u(1)) return null; /* no VUI: not this encoder's layout */
    if (r.u(1) && r.u(8) === 255) r.u(32); /* aspect ratio */
    if (r.u(1)) r.u(1); /* overscan */
    if (r.u(1)) {
      r.u(4);
      if (r.u(1)) r.u(24);
    }
    if (r.u(1)) {
      r.ue();
      r.ue();
    }
    if (r.u(1)) r.u(65); /* timing */
    if (r.u(1) || r.u(1)) return null; /* HRD parameters: not handled */
    r.u(1); /* pic_struct_present */
    const flagAt = r.pos;
    if (r.u(1)) return null; /* already restricted */

    const w = new Writer();
    const copy = new Bits(rbsp);
    w.u(flagAt, 0);
    for (let i = 0; i < flagAt; i++) w.bits[i] = copy.u(1);
    w.u(1, 1); /* bitstream_restriction_flag */
    w.u(1, 1); /* motion_vectors_over_pic_boundaries */
    w.ue(0); /* max_bytes_per_pic_denom: no limit */
    w.ue(0); /* max_bits_per_mb_denom: no limit */
    w.ue(16); /* log2_max_mv_length_horizontal */
    w.ue(16); /* log2_max_mv_length_vertical */
    w.ue(0); /* max_num_reorder_frames */
    w.ue(1); /* max_dec_frame_buffering */
    w.u(1, 1); /* rbsp stop bit */
    const body = escape(w.bytes());
    const out = new Uint8Array(body.length + 1);
    out[0] = nal[0];
    out.set(body, 1);
    return out;
  } catch {
    return null;
  }
}

/** The access unit with its SPS patched, or the same array when there is none to patch. */
export function patchAnnexB(data: Uint8Array): Uint8Array {
  /* Find each start code and the NAL after it. */
  const starts: { at: number; len: number }[] = [];
  for (let i = 0; i + 3 <= data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 1) starts.push({ at: i + 3, len: 3 });
      else if (data[i + 2] === 0 && data[i + 3] === 1) {
        starts.push({ at: i + 4, len: 4 });
        i++;
      }
    }
  }
  for (let k = 0; k < starts.length; k++) {
    const begin = starts[k].at;
    if ((data[begin] & 0x1f) !== 7) continue;
    const end = k + 1 < starts.length ? starts[k + 1].at - starts[k + 1].len : data.length;
    const fixed = patchSps(data.subarray(begin, end));
    if (!fixed) return data;
    const out = new Uint8Array(data.length - (end - begin) + fixed.length);
    out.set(data.subarray(0, begin), 0);
    out.set(fixed, begin);
    out.set(data.subarray(end), begin + fixed.length);
    return out;
  }
  return data;
}
