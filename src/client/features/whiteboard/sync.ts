import { newer, type WbElement } from '../../../shared/whiteboard';

/** Image initialization may replace the scene object without changing its version/nonce. */
export function freshPending<T extends WbElement>(queued: T, live: T | undefined): T {
  return live && !newer(queued, live) ? live : queued;
}

/** Excalidraw initializes new text/images asynchronously; an empty live placeholder is not a shared edit. */
export function readyToPublish(element: WbElement): boolean {
  if (element.isDeleted) return true;
  if (element.type === 'image') return !!element.fileId;
  if (element.type === 'text') return typeof element.text === 'string' && !!element.text.trim();
  return true;
}
