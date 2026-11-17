import { t as uiText } from '../shared/i18n';
import { applyPreferences, type PersonalPreferences, type PreferencesPatch, type Settings } from '../shared/personal-settings';
import type { Me } from '../shared/protocol';
import { loadProfile, loadSettings, onPreferenceSave, saveProfile, saveSettings, setPreferenceAccount } from './state/persist';
import { toast } from './ui/dom';

const merge = (a: PreferencesPatch, b: PreferencesPatch): PreferencesPatch => ({
  ...(a.profile || b.profile ? { profile: { ...a.profile, ...b.profile } as NonNullable<PreferencesPatch['profile']> } : {}),
  ...(a.settings || b.settings ? { settings: { ...a.settings, ...b.settings } } : {}),
});
interface Mutation { patch: PreferencesPatch; sequence: number; device: string }

/** Cache belongs to one account. Unacknowledged writes retain their identity across reloads. */
export async function initializePersonalPreferences(account: Me['account']): Promise<void> {
  setPreferenceAccount();
  if (!account?.id) return;
  const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Storage may be blocked. */ } };
  const id = account.id, pendingKey = `agent-office.pending.${id}`, counterKey = `agent-office.sequence.${id}`;
  let device = read('agent-office.preference-device');
  if (!device || !/^[0-9a-f]{32}$/.test(device)) { device = Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join(''); write('agent-office.preference-device', device); }
  let counter = Number(read(counterKey)) || 0, pending: PreferencesPatch = {}, inFlight: Mutation | undefined;
  if (!Number.isSafeInteger(counter) || counter < 0) counter = 0;
  try {
    const saved = JSON.parse(read(pendingKey) ?? '{}');
    pending = saved.pending ?? {}; applyPreferences({}, pending);
    if (saved.inFlight && Number.isSafeInteger(saved.inFlight.sequence) && saved.inFlight.sequence > 0) { applyPreferences({}, saved.inFlight.patch); inFlight = { ...saved.inFlight, device: /^[0-9a-f]{32}$/.test(saved.inFlight.device) ? saved.inFlight.device : device }; counter = Math.max(counter, inFlight!.sequence); }
  } catch { pending = {}; inFlight = undefined; }
  const remember = () => { write(pendingKey, JSON.stringify({ pending, ...(inFlight ? { inFlight } : {}) })); write(counterKey, String(counter)); };
  const legacy = loadProfile(), legacySettings = loadSettings();
  const canMigrate = !read('agent-office.preference-owner') || read('agent-office.preference-owner') === id;
  setPreferenceAccount(id);
  const request = async (patch?: PreferencesPatch, onlyIfEmpty = false, sequence?: number, writer = device) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/preferences?device=' + writer, patch ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, ...(onlyIfEmpty ? { onlyIfEmpty: true } : {}), ...(sequence ? { device: writer, sequence } : {}) }), signal: controller.signal, keepalive: true } : { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Preferences unavailable');
      const state = await response.json() as { account: string; preferences: PersonalPreferences | null; sequence: number };
      if (state.account !== id) throw new Error('Preferences account changed');
      if (Number.isSafeInteger(state.sequence)) counter = Math.max(counter, state.sequence);
      return state.preferences;
    } finally { clearTimeout(timer); }
  };
  async function sendPending(): Promise<PersonalPreferences | null | undefined> {
    let canonical: PersonalPreferences | null | undefined;
    while (inFlight || Object.keys(pending).length) {
      if (!inFlight) { inFlight = { patch: pending, sequence: ++counter, device: device! }; pending = {}; remember(); }
      canonical = await request(inFlight.patch, false, inFlight.sequence, inFlight.device);
      inFlight = undefined; remember();
    }
    return canonical;
  }
  let remote: PersonalPreferences | null = null;
  try {
    remote = await request();
    if (!remote) {
      const cached = loadProfile() ?? (canMigrate ? legacy : null);
      remote = await request({ ...(cached ? { profile: { color: cached.color, ...(cached.look ? { look: cached.look } : {}) } } : {}), settings: canMigrate ? legacySettings : loadSettings() }, true);
    }
    // Recover before hydration: retrying an already applied write returns the latest account state.
    remote = await sendPending() ?? remote;
  } catch { /* Keep the scoped cache and the durable outbox usable offline. */ }
  const cached = loadProfile() ?? (canMigrate ? legacy : null);
  let preferences = remote ?? { ...(cached ? { profile: cached } : {}), settings: !read(`agent-office.settings.${id}`) && canMigrate ? legacySettings : loadSettings() };
  if (inFlight) preferences = applyPreferences(preferences, inFlight.patch);
  preferences = applyPreferences(preferences, pending);
  if (preferences.profile) saveProfile({ name: account.name, ...preferences.profile });
  if (preferences.settings) saveSettings(preferences.settings);
  write('agent-office.preference-owner', id); remember();
  let previousSettings = loadSettings(), timer: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined, busy = false, warned = false, delay = 1000;
  async function flush() {
    if (busy || (!inFlight && !Object.keys(pending).length)) return;
    busy = true; clearTimeout(retry);
    try { await sendPending(); warned = false; delay = 1000; }
    catch {
      if (!warned) toast(uiText('Preferences saved in this browser. Sync is pending.'), 'warn');
      warned = true; retry = setTimeout(() => void flush(), delay); delay = Math.min(30_000, delay * 2);
    } finally { busy = false; remember(); }
  }
  onPreferenceSave(patch => {
    const change: PreferencesPatch = { ...(patch.profile ? { profile: patch.profile } : {}) };
    if (patch.settings) {
      const settings: Partial<Settings> = {};
      for (const key of Object.keys(patch.settings) as (keyof Settings)[]) if (JSON.stringify(patch.settings[key]) !== JSON.stringify(previousSettings[key])) Object.assign(settings, { [key]: patch.settings[key] });
      if (Object.keys(settings).length) change.settings = settings;
      previousSettings = structuredClone(patch.settings);
    }
    pending = merge(pending, change); remember(); clearTimeout(timer); timer = setTimeout(() => void flush(), 250);
  });
  window.addEventListener('online', () => void flush());
  window.addEventListener('pagehide', () => { clearTimeout(timer); void flush(); });
  void flush();
}
