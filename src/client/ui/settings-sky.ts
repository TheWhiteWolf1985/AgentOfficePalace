import { t as uiText } from '../../shared/i18n';
// ⚙️ Settings' Outside, under Building: what the sky's doing, and which clock it keeps, for everyone
// (see server/sky.ts).
import type { Net } from '../net';
import { confirmSetting, settingsApply } from './settings-apply';
import { store } from '../state';
import { h } from './dom';
import { describeSky } from '../world/sky';

/**
 * The setting, made by `frame` from what goes in it: the sky now (`outside`, see describeSky), the
 * real time of day or a whole day and night every hour as buttons, and a note. Kept up to date until `off`.
 */
export function outsideSetting(net: Net, apply: ReturnType<typeof settingsApply>, outside: { now: string; live: boolean }, frame: (body: Node[]) => HTMLElement): { section: HTMLElement; off: () => void } {
  const row = h('div.seg', { role: 'radiogroup', 'aria-label': uiText('The sky’s clock') });
  const now = h('p.outside-now');
  const note = h('p.setting-note');
  let draft: boolean | undefined;
  const dirty = () => draft !== undefined && draft !== !!store.sky?.realTime;
  apply.add({ dirty, apply: async () => {
    const real = draft!;
    await confirmSetting(net, { t: 'sky.clock', real }, 'sky', () => !!store.sky?.realTime === real);
    draft = undefined;
  } });
  const paint = () => {
    if (draft === !!store.sky?.realTime) draft = undefined;
    const real = draft ?? !!store.sky?.realTime;
    now.textContent = store.sky ? describeSky(store.sky) : outside.now;
    row.replaceChildren(
      ...[true, false].map((r) =>
        h(
          'button.btn',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(real === r),
            class: real === r ? 'on' : '',
            onclick: () => { draft = r; paint(); apply.refresh(); },
          },
          r ? uiText('🕰️ Real time (24 h)') : uiText('⏩ A day every hour'),
        ),
      ),
    );
    note.textContent = uiText`Everyone sees the same sky: ${real ? uiText('the real time of day') : uiText('a whole day and night every hour')}, and ${outside.live ? uiText('the live weather where it is.') : uiText('weather that comes and goes. Start the office with --city to use a real city’s forecast.')}`;
  };
  paint();
  return { section: frame([now, row, note]), off: store.on('sky', () => { paint(); apply.sync(); }) };
}
