import { ROOF } from '../../shared/rooftop.js';
import type { Ctx } from './context.js';

/** Only known drawing spaces resolve. The meeting room has no project-floor lifecycle. */
export function whiteboardAt(ctx: Ctx, space: string | null | undefined) {
  return space === ROOF ? ctx.conferenceWhiteboard : space ? ctx.floors.get(space)?.whiteboard : undefined;
}
