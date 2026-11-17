import { store, loadProfile } from './state';
import { initializePersonalPreferences } from './personal-preferences';
import { configureSecureMedia } from './secure-media';

/** Personal preferences must be ready before choosing assets, constructing the avatar or starting media. */
export async function bootstrapProfile(login = '/login'): Promise<void> {
  try {
    const response = await fetch('/api/whoami', { cache: 'no-store' });
    if (response.status === 401) { location.replace(login); await new Promise<never>(() => {}); }
    if (response.ok) {
      const { me, securePort } = await response.json() as { me?: typeof store.me; securePort?: number };
      if (me) store.me = me;
      configureSecureMedia(securePort);
    }
  } catch { /* The reconnect path will check authentication again. */ }
  await initializePersonalPreferences(store.me.account);
  const saved = loadProfile();
  if (saved) store.profile = { ...store.profile, ...saved, look: saved.look ?? store.profile.look };
  if (store.me.account) store.profile.name = store.me.account.name;
}
