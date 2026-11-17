/** One bounded piece of optional setup between user input/rendering tasks. */
export function backgroundTask(task: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => task(), { timeout: 1000 });
  else setTimeout(task, 0);
}
