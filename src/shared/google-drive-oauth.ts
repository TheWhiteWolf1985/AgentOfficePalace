/** Google accepts a loopback redirect for development and forbids other IP literals. */
export function googleDriveSignInOrigin(origin: string): string {
  const url = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const ip = url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
  return ip && !loopback ? 'http://127.0.0.1:4600' : url.origin;
}
