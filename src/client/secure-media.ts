import { store } from './state';

let httpsPort: number | undefined;
export function configureSecureMedia(port: unknown) {
  httpsPort = typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}
/** The server provides only a port; navigation always stays on the current company's host. */
export function secureMediaUrl(): string | undefined {
  if (window.isSecureContext || !httpsPort) return undefined;
  const url = new URL(location.href);
  url.protocol = 'https:'; url.port = String(httpsPort); url.hash = '';
  if (store.floor) url.searchParams.set('floor', store.floor);
  return url.href;
}
