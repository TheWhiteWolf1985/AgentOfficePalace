import { ROOF } from '../../../shared/rooftop.js';
import type { PresentationClientMsg } from '../../../shared/protocol.js';
import type { Ctx } from '../../office/context.js';
import type { FeatureHooks, HandlerMap } from './types.js';

function publish(ctx: Ctx) {
  const state = ctx.conferencePresentation.state();
  for (const c of ctx.clients.values()) if (c.peer.floor === ROOF) ctx.sendTo(c, { t: 'conference.presentation', state });
}
export function releasePresentation(ctx: Ctx, id: string) {
  if (ctx.conferencePresentation.release(id)) publish(ctx);
}
export const presentationHandlers = {
  'conference.present'(ctx, c, msg) {
    if (c.peer.floor !== ROOF) return ctx.warn(c, 'Presentations are available in the shared meeting room');
    if (msg.mode !== 'presentation' && msg.mode !== 'whiteboard') return;
    if (msg.mode === 'presentation' && !c.peer.sharing) return ctx.warn(c, 'Share your screen first');
    ctx.conferencePresentation.select(msg.mode === 'presentation' ? c.id : undefined);
    publish(ctx);
  },
} satisfies HandlerMap<PresentationClientMsg>;
export const presentationHooks: FeatureHooks = {
  leaving: (ctx, c) => { releasePresentation(ctx, c.id); },
  closed: (ctx, c) => { releasePresentation(ctx, c.id); },
};
