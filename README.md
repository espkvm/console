# ESP-KVM console

The web console for [ESP-KVM](https://github.com/espkvm/espkvm) - an open-source
IP-KVM on the ESP32-P4. A Vue 3 + TypeScript single-page app that talks to the
device over REST and WebSockets and ships embedded in the firmware as a single
gzipped file of about 50 KB, with no external fonts, scripts or requests.

This repository is used as a git submodule:

- by the firmware, [espkvm](https://github.com/espkvm/espkvm), where the build
  output is embedded in the image;
- by the project site, [espkvm.io](https://github.com/espkvm/espkvm.io), to build
  an interactive demo of the interface.

## Develop

```sh
npm ci
npm run dev:mock    # run against a simulated device - no hardware needed
npm run typecheck
```

`npm run dev` proxies to a real device instead of the mock; point it with
`ESPKVM_PROXY_TARGET` (default `http://10.42.0.151`).

## Build

```sh
npm run build       # production bundle for the firmware
```

The firmware build bundles everything into one file and writes the gzip blob into
`../components/kvm_web/assets/` of the firmware repo, so run it where this repo is
checked out as the firmware's `web/` submodule.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
