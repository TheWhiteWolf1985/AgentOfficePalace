import { t as uiText } from '../../../shared/i18n';
/** The whiteboard: it shows what everyone's drawn on it, and E draws on it with them. */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { ROOF } from '../../../shared/rooftop';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { clip } from '../../ui/dom';
import { mirrorWhiteboard, openWhiteboard } from './ui';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    whiteboard: true;
  }
}

export function installWhiteboard(ctx: Ctx, parts: Pick<Parts, 'rooftop'>) {
  const { office } = ctx;
  // The whiteboard shows what everyone's drawn on it.
  mirrorWhiteboard(() => store.floor === ROOF ? parts.rooftop.roof()?.whiteboard : store.project ? office.whiteboard : undefined);
  ctx.interactions.define('whiteboard', {
    reach: 7,
    hint: () => {
      const names = store.drawing.flatMap((id) => (id === store.you ? [] : (store.peers.get(id)?.name ?? []))).join(', ');
      return { k: names, parts: [hintTitle(uiText('📝 Whiteboard')), aside(names ? uiText`✏️ ${clip(names, 40)} drawing` : uiText('draw together, live')), key('E', names ? uiText('Join in') : uiText('Draw'))] };
    },
    use: onE(() => openWhiteboard(ctx.net)),
  });
}
