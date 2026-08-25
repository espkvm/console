/*
 * Let Node import the console's own sources.
 *
 * The console is bundled by Vite, so its imports have no file extension -
 * "./device", not "./device.ts". Node's resolver wants the extension, and
 * rewriting a few hundred imports to please a test runner would be the tail
 * wagging the dog. So the tests run with this hook, which tries the .ts file
 * when a relative import has no extension of its own.
 *
 * Everything else is left alone, so a real "cannot find module" still says so.
 */
const HAS_EXTENSION = /\.[cm]?[jt]s$|\.json$|\.vue$|\.css$/;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !HAS_EXTENSION.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      /* not a TypeScript module after all - fall through to the real answer */
    }
  }
  return next(specifier, context);
}
