import { t } from '../../../shared/i18n';
import type { Ctx } from '../../core/context';
import { hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { paintReceptionSign } from '../../world/reception-sign';
import { receiveReception, receptionChanged, refreshReception } from './state';
import { openReceptionSign } from './ui';

declare module '../../world/types' {
  interface InteractKinds {
    reception: true;
  }
}
export function installReceptionSign(ctx:Ctx) {
  receptionChanged(state=>{void paintReceptionSign(state);});
  ctx.messages.on('reception.sign',message=>receiveReception(message.state));
  ctx.messages.on('welcome',()=>{void refreshReception().then(paintReceptionSign).catch(()=>{});});
  ctx.interactions.define('reception',{
    reach:10,
    hint:()=>({k:String(store.me.admin),parts:[hintTitle(t('Reception sign')),...(store.me.admin ? [key('E',t('Customize'))] : [])]}),
    use:onE(()=>{void openReceptionSign();}),
  });
}
