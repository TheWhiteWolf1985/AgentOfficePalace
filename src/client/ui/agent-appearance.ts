import { t } from '../../shared/i18n';
import { AGENT_COLOR_ROLES, randomAgentAppearance, type AgentAppearance, type AgentColorRole } from '../../shared/agent-appearance';
import { AVATAR_HAIRSTYLES, AVATAR_MODELS, type AvatarHairstyle, type AvatarModel } from '../../shared/avatar-variants';
import { characterPalette } from '../../shared/character-palette';
import { h, openModal } from './dom';
import './character.css';

const LABELS: Record<AgentColorRole, string> = {
  skin: 'Skin', hair: 'Hair', eyebrows: 'Eyebrows', iris: 'Eyes', clothing: 'Jacket',
  shirt: 'Dress shirt', tie: 'Tie', pants: 'Trousers', shoes: 'Shoes', accent: 'Trim', mouth: 'Smile', bow: 'Bow',
};

export function agentAppearancePicker(initial?: AgentAppearance) {
  let draft: AgentAppearance = initial ?? { model: 'male', hairstyle: 'short', colors: {} };
  let disposed = false;
  let preview: import('./agent-preview').AgentPreview | undefined;
  let loadingPreview = false;
  const mode = h('select', { 'aria-label': t('Agent appearance') },
    h('option', { value: 'random' }, t('Random at creation')),
    h('option', { value: 'manual' }, t('Customize'))) as HTMLSelectElement;
  const model = h('select', { 'aria-label': t('Avatar model') },
    ...AVATAR_MODELS.map(value => h('option', { value }, t(value === 'male' ? 'Male' : 'Female')))) as HTMLSelectElement;
  const names = { short: 'Short', long: 'Long', bun: 'Bun', spiky: 'Spiky', curly: 'Curly', ponytail: 'Ponytail', bald: 'No hair' };
  const hair = h('select', { 'aria-label': t('Hairstyle') },
    ...AVATAR_HAIRSTYLES.map(value => h('option', { value }, t(names[value])))) as HTMLSelectElement;
  const canvas = h('canvas.agent-avatar-preview', { 'aria-label': t('Agent avatar preview') }) as HTMLCanvasElement;
  const colors = h('div.avatar-colors');
  const refresh = () => {
    if (mode.value !== 'manual' || disposed) return;
    if (preview) { preview.show(draft); return; }
    if (loadingPreview) return;
    loadingPreview = true;
    void import('./agent-preview').then(({ AgentPreview }) => {
      if (disposed || mode.value !== 'manual') return;
      preview = new AgentPreview(canvas);
      preview.show(draft);
    }).catch(() => { canvas.hidden = true; }).finally(() => { loadingPreview = false; });
  };
  function paintColors() {
    colors.replaceChildren(...AGENT_COLOR_ROLES.filter(role => role !== 'bow' || draft.model === 'female').map(role => {
      const label = t(role === 'pants' && draft.model === 'female' ? 'Skirt' : LABELS[role]);
      const input = h('input', { type: 'color', value: draft.colors[role] ?? characterPalette.agent[role], 'aria-label': label }) as HTMLInputElement;
      input.addEventListener('input', () => {
        draft = { ...draft, colors: { ...draft.colors, [role]: input.value } };
        refresh();
      });
      return h('label.avatar-color', {}, label, input);
    }));
  }
  function paint() {
    model.value = draft.model;
    hair.value = draft.hairstyle;
    paintColors();
    refresh();
  }
  model.addEventListener('change', () => {
    draft = { ...draft, model: model.value as AvatarModel };
    paint();
  });
  hair.addEventListener('change', () => {
    draft = { ...draft, hairstyle: hair.value as AvatarHairstyle };
    refresh();
  });
  const reroll = h('button.btn', { type: 'button', onclick: () => { draft = randomAgentAppearance(); paint(); } }, t('Randomize appearance'));
  const reset = h('button.btn', { type: 'button', onclick: () => { draft = { ...draft, colors: {} }; paint(); } }, t('Original colors'));
  const manual = h('div', { hidden: !initial },
    h('div.agent-avatar-options', {}, canvas, h('div', {},
      h('label', {}, t('Avatar model'), model), h('label', {}, t('Hairstyle'), hair),
      h('div.seg', {}, reroll, reset))),
    colors);
  mode.addEventListener('change', () => { manual.hidden = mode.value !== 'manual'; paint(); });
  mode.value = initial ? 'manual' : 'random';
  paint();
  return {
    element: h('fieldset.agent-avatar-picker', {}, h('legend', {}, t('Agent appearance')), mode, manual),
    value: () => mode.value === 'manual' ? draft : undefined,
    dispose: () => { disposed = true; preview?.dispose(); },
  };
}

export function editAgentAppearance(initial: AgentAppearance | undefined, onApply: (appearance?: AgentAppearance) => void) {
  const picker = agentAppearancePicker(initial);
  const cancel = h('button.btn', { type: 'button' }, t('Cancel'));
  const apply = h('button.btn.primary', { type: 'button' }, t('Save'));
  const title = t('Agent appearance');
  const dialog = h('div.modal', { role: 'dialog', 'aria-label': title },
    h('header', {}, h('h2', {}, title)), h('div.body', {}, picker.element), h('footer', {}, cancel, apply));
  const modal = openModal(dialog, { onClose: () => picker.dispose() });
  cancel.addEventListener('click', () => modal.close());
  apply.addEventListener('click', () => {
    const appearance = picker.value();
    modal.close();
    onApply(appearance);
  });
}
