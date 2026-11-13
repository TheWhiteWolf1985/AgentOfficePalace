import { t as uiText } from '../../shared/i18n';
import { fmtCost, fmtTokens, tokensOf, type AgentProvider, type Usage } from '../../shared/protocol';
import { store } from '../state';
import { $, h } from './dom';
import { providerUsageState, providerUsageTracked, resolvedProvider } from './provider';

export { fmtCost, fmtTokens, tokensOf };

function displayedCost(u: Usage): string {
  return u.costKnown === false ? uiText('cost unavailable') : fmtCost(u.cost);
}

/** e.g. "$0.42 · 38k tokens"; OpenCode's amount is explicitly an estimate. */
export function usageLabel(u: Usage, provider: AgentProvider = 'claude'): string {
  const money = provider === 'codex' && u.costKnown !== true
    ? uiText('cost unavailable')
    : u.costKnown === false
      ? uiText('cost unavailable')
      : `${fmtCost(u.cost)}${provider === 'opencode' ? uiText(' reported') : ''}`;
  // DeepSeek Harness reports what is in the context window, not a token split.
  if (provider === 'dsh') {
    const window = u.contextSize !== undefined ? ` / ${fmtTokens(u.contextSize)}` : '';
    const spend = u.costKnown === true ? `${fmtCost(u.cost)} · ` : '';
    return uiText`${u.incomplete ? uiText('Partial: ') : ''}${spend}${fmtTokens(tokensOf(u))}${window} context`;
  }
  return uiText`${u.incomplete ? uiText("Partial: ") : ""}${money} · ${fmtTokens(tokensOf(u))} tokens`;
}

/** The breakdown behind a figure, for a tooltip. */
export function usageTitle(u: Usage, provider: AgentProvider = 'claude'): string {
  const money = provider === 'codex' && u.costKnown !== true ? uiText('cost unavailable') : u.costKnown === false ? uiText('cost unavailable') : fmtCost(u.cost);
  const calls = provider === 'codex' || u.callsKnown === false
    ? uiText('API call count unavailable')
    : provider === 'opencode'
      ? uiText`${u.calls} reported call${u.calls === 1 ? '' : 's'}`
      : uiText`${u.calls} API call${u.calls === 1 ? '' : 's'}`;
  const dshContext = u.contextSize !== undefined ? uiText`${fmtTokens(tokensOf(u))} of ${fmtTokens(u.contextSize)} context tokens` : uiText`${fmtTokens(tokensOf(u))} context tokens`;
  return [
    ...(u.incomplete ? [uiText('Partial metrics: some session history is still loading or unavailable.')] : []),
    provider === 'codex'
      ? uiText`Codex root-session metrics; subagent usage is not included; ${money}; ${calls}`
      : provider === 'opencode'
        ? uiText`OpenCode reported estimate ${money}; model/provider estimate, not billing; ${calls}`
        : provider === 'dsh'
          ? uiText`DeepSeek Harness context usage from ACP: ${dshContext}; session cost ${u.costKnown === true ? money : 'unavailable'}; ${calls}`
          : uiText`${money} over ${calls}`,
    uiText`input ${fmtTokens(u.input)} · output ${fmtTokens(u.output)}`,
    uiText`reasoning ${fmtTokens(u.reasoning ?? 0)}`,
    uiText`cache write ${fmtTokens(u.cacheWrite)} · cache read ${fmtTokens(u.cacheRead)}`,
  ].join('\n');
}

export function overBudget(): boolean {
  const s = store.usage;
  return s.budget !== undefined && s.today.cost >= s.budget;
}

/** New hires are refused: the daily budget is spent and the office runs with --budget-pause. */
export const hiringPaused = () => store.usage.pauseHiring && overBudget();

/** The sidebar's spend lines: what the workers at their desks cost, today's total and the budget. */
export function renderUsage() {
  const s = store.usage;
  let now = 0;
  let currentOpenCodeCost = 0;
  let currentOpenCodeTokens = 0;
  let currentOpenCodeInput = 0;
  let currentOpenCodeOutput = 0;
  let currentOpenCodeReasoning = 0;
  let currentOpenCodeCacheWrite = 0;
  let currentOpenCodeCacheRead = 0;
  let currentOpenCodeReports = 0;
  let currentOpenCodeCostUnknown = false;
  let currentOpenCodeIncomplete = false;
  let openCodeWaiting = false;
  let currentCodexCost = 0;
  let currentCodexTokens = 0;
  let currentCodexInput = 0;
  let currentCodexOutput = 0;
  let currentCodexReasoning = 0;
  let currentCodexCacheWrite = 0;
  let currentCodexCacheRead = 0;
  let currentCodexReports = 0;
  let currentCodexCostUnknown = false;
  let currentCodexIncomplete = false;
  let codexWaiting = false;
  let currentDshTokens = 0;
  let currentDshContext = 0;
  let currentDshReports = 0;
  let currentDshCost = 0;
  let currentDshCostKnown = false;
  let dshWaiting = false;
  let untracked = false;
  for (const w of store.workers.values()) {
    if (w.kind !== 'agent') continue;
    const provider = resolvedProvider(w.provider, store.project);
    const state = providerUsageState(provider, store.project, w.usage);
    if (state === 'untracked') untracked = true;
    if (provider === 'opencode') {
      if (!w.usage) {
        openCodeWaiting = true;
        continue;
      }
      currentOpenCodeReports++;
      if (w.usage.incomplete) currentOpenCodeIncomplete = true;
      currentOpenCodeTokens += tokensOf(w.usage);
      currentOpenCodeInput += w.usage.input;
      currentOpenCodeOutput += w.usage.output;
      currentOpenCodeReasoning += w.usage.reasoning ?? 0;
      currentOpenCodeCacheWrite += w.usage.cacheWrite;
      currentOpenCodeCacheRead += w.usage.cacheRead;
      if (w.usage.costKnown === false) currentOpenCodeCostUnknown = true;
      else currentOpenCodeCost += w.usage.cost;
    }
    if (provider === 'codex') {
      if (!w.usage) {
        codexWaiting = true;
        continue;
      }
      currentCodexReports++;
      if (w.usage.incomplete) currentCodexIncomplete = true;
      currentCodexTokens += tokensOf(w.usage);
      currentCodexInput += w.usage.input;
      currentCodexOutput += w.usage.output;
      currentCodexReasoning += w.usage.reasoning ?? 0;
      currentCodexCacheWrite += w.usage.cacheWrite;
      currentCodexCacheRead += w.usage.cacheRead;
      if (w.usage.costKnown !== true) currentCodexCostUnknown = true;
      else currentCodexCost += w.usage.cost;
    }
    if (provider === 'dsh') {
      if (!w.usage) {
        dshWaiting = true;
        continue;
      }
      currentDshReports++;
      currentDshTokens += tokensOf(w.usage);
      if (w.usage.contextSize !== undefined) currentDshContext = Math.max(currentDshContext, w.usage.contextSize);
      if (w.usage.costKnown === true) {
        currentDshCost += w.usage.cost;
        currentDshCostKnown = true;
      }
    }
    if (providerUsageTracked(provider, store.project, w.usage) && w.usage?.costKnown !== false && !w.usage?.incomplete) now += w.usage?.cost ?? 0;
  }
  const head = $('workers-cost');
  head.textContent = now > 0 ? fmtCost(now) : '';
  head.title = uiText('Current desks: tracked Claude Code costs plus reported OpenCode and DeepSeek Harness estimates; Codex root-session tokens appear below; sessions with unavailable cost or partial history are excluded.');

  const el = $('usage');
  const any = s.total.calls > 0 || s.budget !== undefined || untracked || currentOpenCodeReports > 0 || openCodeWaiting || currentCodexReports > 0 || codexWaiting || currentDshReports > 0 || dshWaiting;
  el.classList.toggle('hidden', !any);
  if (!any) return;
  const over = overBudget();
  el.classList.toggle('over', over);
  const rows: HTMLElement[] = [];
  if (s.total.calls > 0 || s.budget !== undefined) {
    rows.push(
      h(
        'div.row',
        {},
        h('span', {}, uiText('💸 Claude Code today')),
        h('b', { title: usageTitle(s.today, 'claude') }, displayedCost(s.today)),
        s.budget !== undefined ? h('span.muted', {}, uiText`of ${fmtCost(s.budget)}`) : h('span.muted', {}, uiText`· ${fmtTokens(tokensOf(s.today))} tokens`),
      ),
    );
  }
  if (s.budget !== undefined) {
    const pct = Math.min(100, (s.today.cost / s.budget) * 100);
    const state = over ? (s.pauseHiring ? uiText('Budget spent — no new hires until tomorrow') : uiText('Budget spent')) : uiText`${Math.round(pct)}% of today's budget`;
    rows.push(h('div.budget', { class: over ? 'over' : pct >= 80 ? 'near' : '', title: state, role: 'progressbar', 'aria-valuenow': Math.round(pct) }, h('div.fill', { style: `width:${pct}%` })));
  }
  if (s.total.calls > 0 || s.budget !== undefined) rows.push(h('div.row.muted', { title: usageTitle(s.total, 'claude') }, uiText`Claude Code all time ${displayedCost(s.total)} · ${fmtTokens(tokensOf(s.total))} tokens`));
  if (currentOpenCodeReports > 0) {
    const amount = currentOpenCodeCostUnknown ? uiText('cost unavailable') : uiText`${fmtCost(currentOpenCodeCost)} reported`;
    rows.push(
      h(
        'div.row.muted',
        {
          title: [
            uiText('OpenCode current-desk metrics are model/provider estimates, not billing.'),
            uiText`input ${fmtTokens(currentOpenCodeInput)} · output ${fmtTokens(currentOpenCodeOutput)}`,
            uiText`reasoning ${fmtTokens(currentOpenCodeReasoning)}`,
            uiText`cache write ${fmtTokens(currentOpenCodeCacheWrite)} · cache read ${fmtTokens(currentOpenCodeCacheRead)}`,
          ].join('\n'),
        },
        uiText`OpenCode ${currentOpenCodeIncomplete ? "partial" : uiText("current desks")} ${amount} · ${fmtTokens(currentOpenCodeTokens)} tokens`,
      ),
    );
  }
  if (openCodeWaiting) rows.push(h('div.row.muted', { title: uiText('OpenCode usage appears after its first metrics report.') }, uiText('OpenCode metrics waiting for first report')));
  if (currentCodexReports > 0) {
    const amount = currentCodexCostUnknown ? uiText('cost unavailable') : fmtCost(currentCodexCost);
    rows.push(
      h(
        'div.row.muted',
        {
          title: [
            uiText('Codex current-desk metrics cover the root session only; subagent usage is not included; cost is unavailable.'),
            uiText`input ${fmtTokens(currentCodexInput)} · output ${fmtTokens(currentCodexOutput)}`,
            uiText`reasoning ${fmtTokens(currentCodexReasoning)}`,
            uiText`cache write ${fmtTokens(currentCodexCacheWrite)} · cache read ${fmtTokens(currentCodexCacheRead)}`,
          ].join('\n'),
        },
        uiText`Codex ${currentCodexIncomplete ? 'partial' : uiText('current desks')} ${amount} · ${fmtTokens(currentCodexTokens)} tokens`,
      ),
    );
  }
  if (codexWaiting) rows.push(h('div.row.muted', { title: uiText('Codex usage appears after its first root-session metrics report; subagent usage is not included.') }, uiText('Codex metrics waiting for first report')));
  if (currentDshReports > 0) {
    const context = currentDshContext > 0 ? ` / ${fmtTokens(currentDshContext)}` : '';
    const spend = currentDshCostKnown ? `${fmtCost(currentDshCost)} · ` : '';
    rows.push(
      h(
        'div.row.muted',
        {
          title: [
            uiText('DeepSeek Harness reports what is in each session\u2019s context window over ACP after a turn; cost appears only when the harness supplies it, and is never billing.'),
            uiText`${currentDshReports} worker${currentDshReports === 1 ? '' : 's'} · ${fmtTokens(currentDshTokens)}${context} context tokens`,
          ].join('\n'),
        },
        uiText`DeepSeek Harness current desks ${spend}${fmtTokens(currentDshTokens)}${context} context`,
      ),
    );
  }
  if (dshWaiting) rows.push(h('div.row.muted', { title: uiText('DeepSeek Harness usage appears after its first ACP usage update.') }, uiText('DeepSeek Harness metrics waiting for first report')));
  if (untracked) {
    rows.push(h('div.row.muted', { title: uiText('Custom provider usage is not reported by the office.') }, uiText('Custom usage untracked · budget and totals cover Claude Code only')));
  }
  el.replaceChildren(...rows);
}
