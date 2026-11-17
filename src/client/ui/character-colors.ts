import { t } from '../../shared/i18n';
import { AVATAR_COLOR_ROLES, AVATAR_HEX, DEFAULT_AVATAR_COLORS, sanitizeAvatarColors, type AvatarColorRole, type AvatarColors } from '../../shared/avatar-colors';
import { h } from './dom';

/** A private draft: inputs affect the preview; the caller publishes only on Save. */
export function avatarColorFields(initial: AvatarColors | undefined, onChange: (colors: AvatarColors) => void): HTMLElement {
  let colors = sanitizeAvatarColors(initial);
  const labels: Record<AvatarColorRole, string> = {
    skin: t('Skin'), hair: t('Hair'), eyebrows: t('Eyebrows'), iris: t('Eyes'),
    clothing: t('Jacket'), shirt: t('Dress shirt'), tie: t('Tie'), pants: t('Trousers'), shoes: t('Shoes'),
  };
  const fields = AVATAR_COLOR_ROLES.map(role => {
    const id = `avatar-color-${role}`, label = labels[role];
    const picker = h('input', { id, type: 'color', value: colors[role] }) as HTMLInputElement;
    const hex = h('input', { type: 'text', value: colors[role], maxlength: 7, pattern: '#[0-9a-fA-F]{6}', required: true, 'aria-label': `${label} HEX`, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' }) as HTMLInputElement;
    const apply = (value: string) => {
      colors = { ...colors, [role]: value.toLowerCase() };
      picker.value = hex.value = colors[role];
      hex.setCustomValidity('');
      onChange({ ...colors });
    };
    picker.addEventListener('input', () => apply(picker.value));
    hex.addEventListener('input', () => {
      if (AVATAR_HEX.test(hex.value)) apply(hex.value);
      else hex.setCustomValidity(t('Use a color such as #123ABC.'));
    });
    return { role, picker, hex, row: h('div.avatar-color', {}, h('label', { for: id }, label), h('div.avatar-color-inputs', {}, picker, hex)) };
  });
  const reset = h('button.btn.avatar-color-reset', { type: 'button' }, t('Original colors'));
  reset.addEventListener('click', () => {
    colors = { ...DEFAULT_AVATAR_COLORS };
    for (const field of fields) {
      field.picker.value = field.hex.value = colors[field.role];
      field.hex.setCustomValidity('');
    }
    onChange({ ...colors });
  });
  return h('div.avatar-colors', {}, ...fields.map(field => field.row), reset);
}
