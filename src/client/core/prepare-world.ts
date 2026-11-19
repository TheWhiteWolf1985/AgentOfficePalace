import { t as uiText } from '../../shared/i18n';
import type { ServerMsg } from '../../shared/protocol';
import { LOBBY, ROOF, SERVER_ROOM } from '../../shared/rooftop';
import { preloadModels } from '../world/models';
import { ensureOffice, officeLoaded } from '../world/deferred-office';
import { h, toast } from '../ui/dom';
import type { Parts } from './parts';
import type { CoreState } from './ctx';

export async function prepareWorld(parts: Parts, core: CoreState, message: ServerMsg): Promise<void> {
  if (message.t !== 'welcome' && message.t !== 'floor.enter') return;
  if (message.floor === SERVER_ROOM) {
    await preloadModels(['server_room']);
    return;
  }
  if (!message.floor || message.floor === LOBBY || message.floor === ROOF || !message.project || officeLoaded(parts.stage.office)) return;
  if (core.trip) clearTimeout(core.trip.timer);
  parts.player.enabled = false; parts.player.clearKeys();
  const loading = h('div.asset-loading', { role: 'status', 'aria-live': 'polite' }, uiText('Loading office…'));
  document.body.append(loading);
  try { await ensureOffice(parts.stage.office); }
  catch (error) {
    parts.travel.cancelTrip();
    toast(uiText('Could not load the office. Reconnecting…'), 'warn');
    throw error;
  } finally { loading.remove(); }
}
