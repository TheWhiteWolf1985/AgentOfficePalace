import type { Ctx } from '../core/context';
import type { Parts } from '../core/parts';
import { DESK_KEYS } from '../interaction';
import { isTyping } from '../player';
import { modalOpen } from '../ui/dom';

export function installKeyGuards(ctx: Ctx, parts: Pick<Parts, 'focus'>) {
  const { player } = ctx;
  // A window's open or you're typing somewhere, or it's a shortcut: the key isn't the office's.
  ctx.keys.add('guard', (e) => modalOpen() || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey);
  // Closing the last window didn't give you the mouse back: any key but Esc takes it (see backToGame).
  ctx.keys.add('guard', (e) => {
    if (parts.focus.relookOnKey() && e.key !== 'Escape' && player.canLock) player.lock();
    return false;
  });
  // Whatever you're in the middle of has first go (see each activity's key).
  ctx.keys.add('activity', (e) => ctx.activities.key(e));
}

export function installKeyboard(ctx: Ctx, parts: Pick<Parts, 'pointer'>) {
  const { player } = ctx;
  // Every key press goes down the chain in ctx.keys: the guards, what you're in the middle of, the
  window.addEventListener('keydown', (e) => {
    if (ctx.keys.handle(e) === 'bound') player.clearKeys();
  });
  // Keys that use what you're facing: at a desk, each does something else (see interact).
  ctx.keys.bind({
    code: Object.keys(DESK_KEYS),
    run: (e) => {
      const deskKey = DESK_KEYS[e.code as keyof typeof DESK_KEYS];
      const handled = parts.pointer.use(parts.pointer.target(), deskKey);
      // P and L open a text box, which the key mustn't land in.
      if (handled && (deskKey === 'P' || deskKey === 'L')) e.preventDefault();
      return handled;
    },
  });
}
