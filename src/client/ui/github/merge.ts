import { t as uiText } from '../../../shared/i18n';
import type { GhCheck, GhMergeMethod, GhPull, GhPullDetail } from '../../../shared/protocol';
import type { Net } from '../../net';
import { h, openModal } from '../dom';
import { mergeWaiters } from './api';
import { MERGE_KEY, mergePref, savePref } from './prefs';

// ---- Whether a PR can merge ---------------------------------------------------------------------

const CHECK_ICON: Record<GhCheck['state'], string> = { pass: '✅', fail: '❌', pending: '🟡', skip: '⚪' };

interface MergeStatus {
  icon: string;
  text: string;
  cls: 'ok' | 'warn' | 'bad' | 'muted';
  /** False when merging can't work at all (draft, conflicts, already merged). */
  can: boolean;
  /** GitHub could merge it on its own once the requirements pass. */
  auto: boolean;
}

/** An open PR whose branch can't merge until someone resolves conflicts with the base. */
export function conflicted(d: GhPullDetail) {
  return d.state === 'OPEN' && !d.isDraft && (d.mergeable === 'CONFLICTING' || d.mergeStateStatus === 'DIRTY');
}

export function mergeStatus(d: GhPullDetail): MergeStatus {
  const failing = d.checks.filter((c) => c.state === 'fail').length;
  const pending = d.checks.filter((c) => c.state === 'pending').length;
  if (d.state === 'MERGED') return { icon: '🎉', text: uiText('Merged.'), cls: 'ok', can: false, auto: false };
  if (d.state === 'CLOSED') return { icon: '🗑️', text: uiText('Closed without merging.'), cls: 'muted', can: false, auto: false };
  if (d.isDraft) return { icon: '📝', text: uiText('This is still a draft. Mark it ready for review on GitHub before merging.'), cls: 'muted', can: false, auto: false };
  if (conflicted(d))
    return { icon: '⚠️', text: uiText`This branch has conflicts with ${d.baseRefName} that must be resolved first.`, cls: 'bad', can: false, auto: false };
  if (d.mergeStateStatus === 'BEHIND') return { icon: '⤵️', text: uiText`The branch is behind ${d.baseRefName}, and this repo wants it up to date before merging.`, cls: 'warn', can: true, auto: true };
  if (d.mergeStateStatus === 'BLOCKED') {
    const why = d.reviewDecision === 'CHANGES_REQUESTED' ? uiText('changes were requested') : d.reviewDecision === 'REVIEW_REQUIRED' ? uiText('it needs an approving review') : failing ? uiText`${failing} check${failing > 1 ? uiText('s are') : uiText(' is')} failing` : pending ? uiText('required checks are still running') : uiText('a branch rule is not met yet');
    return { icon: '🚫', text: uiText`Merging is blocked: ${why}.`, cls: 'bad', can: true, auto: true };
  }
  if (failing) return { icon: '❌', text: uiText`${failing} check${failing > 1 ? 's' : ''} failing. It can still be merged.`, cls: 'warn', can: true, auto: false };
  if (pending || d.mergeStateStatus === 'UNSTABLE') return { icon: '🟡', text: uiText('Checks are still running. It can be merged now, or once they pass.'), cls: 'warn', can: true, auto: true };
  if (d.mergeStateStatus === 'UNKNOWN' || d.mergeable === 'UNKNOWN') return { icon: '⏳', text: uiText('GitHub is still working out whether this can merge. Refresh in a moment.'), cls: 'muted', can: true, auto: false };
  return { icon: '✅', text: uiText`Ready to merge: no conflicts with ${d.baseRefName}${d.checks.length ? uiText(' and all checks passed') : ''}.`, cls: 'ok', can: true, auto: false };
}

export function checksList(checks: GhCheck[]) {
  const order: GhCheck['state'][] = ['fail', 'pending', 'pass', 'skip'];
  const sorted = [...checks].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return h(
    'ul.gh-checks',
    {},
    ...sorted.map((c) => h('li', {}, h('span', { 'aria-label': c.state }, CHECK_ICON[c.state]), c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.name) : h('span', {}, c.name))),
  );
}

// ---- Merge dialog -------------------------------------------------------------------------------

const METHOD_LABEL: Record<GhMergeMethod, string> = { squash: uiText('Squash and merge'), merge: uiText('Create a merge commit'), rebase: uiText('Rebase and merge') };

export function openMerge(it: GhPull, d: GhPullDetail, net: Net, handToWorker: () => void, onMerged: () => void) {
  const st = mergeStatus(d);
  const methods = d.repo.methods;
  let { method, deleteBranch } = mergePref(methods);
  let busy = false;

  const methodBtns = h('div.seg');
  const go = h('button.btn.primary', { type: 'button' });
  const auto = h('input', { type: 'checkbox', id: 'merge-auto' }) as HTMLInputElement;
  auto.checked = st.auto && st.cls !== 'ok';
  const renderMethods = () => {
    methodBtns.replaceChildren(
      ...methods.map((m) =>
        h('button.btn', { type: 'button', class: m === method ? 'on' : '', onclick: () => ((method = m), savePref(MERGE_KEY, { method, deleteBranch }), renderMethods()) }, METHOD_LABEL[m]),
      ),
    );
    go.textContent = auto.checked ? uiText('⏱ Merge when ready') : `🔀 ${METHOD_LABEL[method]}`;
  };
  auto.addEventListener('change', renderMethods);
  const del = h('input', { type: 'checkbox', id: 'merge-del' }) as HTMLInputElement;
  del.checked = deleteBranch;
  del.addEventListener('change', () => {
    deleteBranch = del.checked;
    savePref(MERGE_KEY, { method, deleteBranch });
  });
  const result = h('div.gh-merge-result.hidden');
  const cancel = h('button.btn', { type: 'button' }, uiText('Cancel'));
  // Conflicts can't be merged from here, so fixing them is the main button.
  const worker = conflicted(d)
    ? h('button.btn.primary', { type: 'button', title: uiText('A new worker merges the base in, resolves the conflicts, then merges it the way picked above') }, uiText('✨ New worker: fix conflicts & merge'))
    : h('button.btn', { type: 'button', title: uiText('A worker fixes whatever is in the way, then merges') }, uiText('🤖 Hand to a worker'));

  const el = h(
    'div.modal.gh-merge',
    { role: 'dialog', 'aria-label': uiText`Merge PR #${it.number}` },
    h('header', {}, h('h2', {}, uiText`🔀 Merge #${it.number}`)),
    h(
      'div.body',
      {},
      h('p.gh-merge-title', {}, it.title, h('small', {}, `${it.headRefName} → ${it.baseRefName}`)),
      h('div.gh-status', { class: st.cls }, h('span', {}, st.icon), st.text),
      d.checks.length ? checksList(d.checks) : null,
      h('label', { style: 'margin-top:14px' }, uiText('How')),
      methodBtns,
      h('label.gh-check', { for: 'merge-del' }, del, uiText`Delete ${it.headRefName} after merging`),
      st.auto ? h('label.gh-check', { for: 'merge-auto', title: uiText('gh pr merge --auto (the repo must allow auto-merge)') }, auto, uiText('Merge automatically once the requirements pass')) : null,
      result,
    ),
    h('footer', {}, st.can || conflicted(d) ? null : worker, h('span.grow'), cancel, conflicted(d) ? worker : go),
  );
  renderMethods();
  if (!st.can) go.disabled = true;

  const modal = openModal(el, { onClose: () => mergeWaiters.delete(it.number) });
  cancel.addEventListener('click', () => modal.close());
  worker.addEventListener('click', () => {
    modal.close();
    handToWorker();
  });
  go.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    go.disabled = true;
    result.className = 'gh-merge-result';
    result.replaceChildren(h('span.spinner'), auto.checked && st.auto ? uiText('Asking GitHub to merge it when ready…') : uiText('Merging…'));
    mergeWaiters.set(it.number, (msg) => {
      mergeWaiters.delete(it.number);
      busy = false;
      if (msg.error) {
        go.disabled = false;
        result.className = 'gh-merge-result error';
        result.replaceChildren(msg.error);
        return;
      }
      modal.close();
      onMerged();
    });
    net.send({ t: 'gh.merge', number: it.number, method, deleteBranch, auto: auto.checked && st.auto });
  });
  setTimeout(() => (st.can ? go : cancel).focus(), 30);
}

/** Human-requested Forgejo merge; the separate service independently rechecks the displayed commit. */
export function openForgejoMerge(it: GhPull, d: GhPullDetail, net: Net, onMerged: () => void) {
  const result = h('div.gh-merge-result');
  const cancel = h('button.btn', {type: 'button'}, uiText("Cancel"));
  const go = h('button.btn.primary', {type: 'button'}, uiText("Check and merge"));
  const ready = !!d.gateRevisioni?.verde && !!d.headCommit && it.state === 'OPEN';
  go.disabled = !ready;
  const el = h('div.modal.gh-merge', {role: 'dialog', 'aria-label': uiText("Forgejo merge")},
    h('header', {}, h('h2', {}, uiText("Controlled merge"))),
    h('div.body', {}, h('p', {}, it.title), h('p', {}, d.gateRevisioni?.motivo ?? uiText("Check unavailable")),
      h('p', {}, uiText("The service rechecks the revision and deletes the branch after the merge.")), result),
    h('footer', {}, cancel, go));
  const modal = openModal(el, {onClose: () => mergeWaiters.delete(it.number)});
  cancel.addEventListener('click', () => modal.close());
  go.addEventListener('click', () => {
    go.disabled = true; result.replaceChildren(uiText("Checking…"));
    mergeWaiters.set(it.number, (msg) => {
      mergeWaiters.delete(it.number);
      if (msg.error) {result.replaceChildren(msg.error); go.disabled = false; return;}
      modal.close(); onMerged();
    });
    net.send({t: 'gh.merge', number: it.number, method: 'merge', deleteBranch: true, headCommit: d.headCommit});
  });
}
