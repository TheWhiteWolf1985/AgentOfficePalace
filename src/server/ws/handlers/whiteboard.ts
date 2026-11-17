// The whiteboard on every floor: who's drawing, and what they draw.
import { WebSocket } from 'ws';
import type { ServerMsg, WhiteboardClientMsg } from '../../../shared/protocol.js';
import type { Ctx } from '../../office/context.js';
import { throttle, type Client } from '../../office/client.js';
import { num } from '../../office/input.js';
import { whiteboardAt } from '../../office/whiteboards.js';
import type { FeatureHooks, HandlerMap, ViewPieces } from './types.js';

/** Everyone who has their floor's whiteboard open. */
const drawers = new WeakSet<Client>();

/** Who has a floor's whiteboard open. */
export const drawing = (ctx: Ctx, space: string): string[] => [...ctx.clients.values()].filter((c) => drawers.has(c) && c.peer.floor === space).map((c) => c.id);
export const whiteboardSpaceView = (ctx: Ctx, space: string | undefined) => ({ elements: whiteboardAt(ctx, space)?.scene() ?? [], people: space ? drawing(ctx, space) : [] });
export const whiteboardView: ViewPieces['whiteboard'] = (ctx, floor) => whiteboardSpaceView(ctx, floor?.id);
export const drawingChanged = (ctx: Ctx, space: string | undefined) => {
  if (!space || !whiteboardAt(ctx, space)) return;
  const msg: ServerMsg = { t: 'wb.people', board: space, people: drawing(ctx, space) };
  for (const c of ctx.clients.values()) if (c.peer.floor === space) ctx.sendTo(c, msg);
};

const inScope = (c: Client, msg: WhiteboardClientMsg) => msg.board === undefined || msg.board === c.peer.floor;

/** Opening the whiteboard, or closing it. */
function openOrClose(ctx: Ctx, c: Client, msg: Extract<WhiteboardClientMsg, { t: 'wb.open' | 'wb.close' }>) {
  if (!inScope(c, msg)) return;
  const space = c.peer.floor;
  const open = msg.t === 'wb.open' && !!whiteboardAt(ctx, space);
  if (open === drawers.has(c)) return;
  if (open) drawers.add(c);
  else drawers.delete(c);
  drawingChanged(ctx, space);
}

export const whiteboardHandlers = {
  'wb.open': openOrClose,
  'wb.close': openOrClose,
  'wb.update'(ctx, c, msg) {
    if (!inScope(c, msg)) return;
    const board = whiteboardAt(ctx, c.peer.floor);
    if (!board) return;
    const { accepted, error } = board.apply(msg.elements);
    if (accepted.length) ctx.toNeighbors(c, { t: 'wb.update', board: c.peer.floor, elements: accepted });
    ctx.warn(c, error);
  },
  'wb.pointer'(ctx, c, msg) {
    if (!inScope(c, msg) || !drawers.has(c) || !throttle(c, 'wb.pointer', 25)) return;
    const selected = Array.isArray(msg.selected) ? msg.selected.filter((s): s is string => typeof s === 'string').slice(0, 200).map((s) => s.slice(0, 100)) : undefined;
    const pointer: ServerMsg = { t: 'wb.pointer', board: c.peer.floor, id: c.id, x: num(msg.x), y: num(msg.y), tool: msg.tool === 'laser' ? 'laser' : 'pointer', button: msg.button === 'down' ? 'down' : 'up', selected };
    const json = JSON.stringify(pointer);
    for (const o of ctx.clients.values()) {
      if (o.id === c.id || !drawers.has(o) || o.peer.floor !== c.peer.floor || o.ws.readyState !== WebSocket.OPEN || o.ws.bufferedAmount > 1024 * 1024) continue;
      o.ws.send(json);
    }
  },
} satisfies HandlerMap<WhiteboardClientMsg>;

export const whiteboardHooks: FeatureHooks = {
  leaving(ctx, c) {
    // The whiteboard downstairs stays downstairs.
    const wasDrawing = drawers.has(c);
    const space = c.peer.floor;
    drawers.delete(c);
    if (wasDrawing) return () => drawingChanged(ctx, space);
  },
  closed(ctx, c) {
    const wasDrawing = drawers.has(c);
    drawers.delete(c);
    if (wasDrawing) drawingChanged(ctx, c.peer.floor);
  },
};
