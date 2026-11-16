import type { Ctx } from '../../core/context';
import { paintReceptionSign } from '../../world/reception-sign';
import { receiveReception, receptionChanged, refreshReception } from './state';
export function installReceptionSign(ctx:Ctx) {
  receptionChanged(state=>{void paintReceptionSign(state);});
  ctx.messages.on('reception.sign',message=>receiveReception(message.state));
  ctx.messages.on('welcome',()=>{void refreshReception().then(paintReceptionSign).catch(()=>{});});
}
