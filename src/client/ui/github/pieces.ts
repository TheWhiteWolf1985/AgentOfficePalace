import { languageTag as uiLocale } from '../../../shared/i18n';
import { t as uiText } from '../../../shared/i18n';
import type { GhComment } from '../../../shared/protocol';
import { AVATAR_COLORS } from '../../state';
import { h, timeAgo } from '../dom';
import { markdown } from '../markdown';

// ---- Small pieces ---------------------------------------------------------------------------------

export function avatar(name: string) {
  let x = 0;
  for (const ch of name) x = (x * 31 + ch.charCodeAt(0)) | 0;
  return h('span.gh-avatar', { style: `background:${AVATAR_COLORS[Math.abs(x) % AVATAR_COLORS.length]}`, 'aria-hidden': 'true' }, (name[0] ?? '?').toUpperCase());
}

export function when(iso: string, url?: string) {
  const title = iso ? new Date(iso).toLocaleString(uiLocale()) : '';
  return url ? h('a.when', { href: url, target: '_blank', rel: 'noopener noreferrer', title }, timeAgo(iso)) : h('span.when', { title }, timeAgo(iso));
}

export const REVIEW_BADGE: Record<string, [string, string]> = {
  APPROVED: [uiText('✅ approved'), 'ok'],
  CHANGES_REQUESTED: [uiText('🛠 requested changes'), 'bad'],
  COMMENTED: [uiText('💬 reviewed'), ''],
  DISMISSED: [uiText('review dismissed'), 'muted'],
};

export function commentCard(c: GhComment, itemUrl: string, verb: string, badge?: [string, string]) {
  return h(
    'article.gh-card',
    { class: badge?.[1] ? `is-${badge[1]}` : '' },
    h('header', {}, avatar(c.author), h('b', {}, c.author), h('span', {}, verb), when(c.createdAt, c.url), badge ? h('span.gh-badge', { class: badge[1] }, badge[0]) : null),
    c.body.trim() || !badge ? markdown(c.body, itemUrl) : null,
  );
}

/** Drops the nulls of optional pieces, for replaceChildren. */
export function nodes(...xs: (Node | string | null | undefined)[]): (Node | string)[] {
  return xs.filter((x): x is Node | string => x != null);
}

export function spinnerRow(text: string) {
  return h('div.gh-loading', {}, h('span.spinner'), text);
}

export function errorBox(text: string, retry?: () => void) {
  const message = text === 'Remote not configured yet' ? uiText('Remote not configured yet') : uiText('Remote temporarily unavailable');
  return h('div.gh-error', {}, message, retry ? h('button.btn', { type: 'button', onclick: retry }, uiText('Try again')) : null);
}

export function stateOf(it: { state: string; isDraft?: boolean }): [string, string] {
  if (it.state === 'MERGED') return [uiText('merged'), 'merged'];
  if (it.state === 'CLOSED') return [uiText('closed'), 'offline'];
  return it.isDraft ? [uiText('draft'), 'idle'] : [uiText('open'), 'working'];
}
