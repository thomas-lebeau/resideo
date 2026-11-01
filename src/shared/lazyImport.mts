/**
 * Defers a dynamic import until first use and memoizes it.
 *
 * Native modules are shipped next to the binary rather than bundled. Loading
 * them lazily means a missing or incompatible build only fails the plugin that
 * needs it, instead of crashing the whole process at startup.
 */
export function lazyImport<T>(load: () => Promise<{ default: T }>) {
  let promise: Promise<T> | undefined;

  return () => (promise ??= load().then((module) => module.default));
}
