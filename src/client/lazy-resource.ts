/** Reading an absent resource never allocates it; a failed factory can be retried. */
export function lazyResource<T extends object>(create: () => T) {
  let value: T | undefined;
  return { peek: () => value, get: () => value ??= create() };
}
