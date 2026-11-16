import './ui.css';
import { t } from '../../../shared/i18n';
import { SIGN_LOGO_MAX, SIGN_TEXT_MAX, type ReceptionSignState, type SignMode } from '../../../shared/reception-sign';
import { store } from '../../state';
import { h, openModal, toast, type Modal } from '../../ui/dom';
import { drawReceptionSign } from '../../shared/reception-sign-draw';
import { receiveReception, receptionState, refreshReception } from './state';

let current:Modal|null=null,pending=false;
export async function openReceptionSign() {
  if(current || pending)return;
  if(!store.me.admin)return toast(t('Administrator access required'),'warn');
  pending=true;
  try {await refreshReception();}catch {pending=false;return toast(t('Could not load the reception sign'),'warn');}
  pending=false;
  const initial=receptionState();let mode:SignMode=initial.mode,imageData:string|null|undefined,image:HTMLImageElement|undefined,busy=false,loading=false,loadTicket=0;
  const canvas=h('canvas.sign-preview',{width:1024,height:234,'aria-label':t('Reception sign preview')}) as HTMLCanvasElement;
  const text=h('textarea',{rows:4,maxlength:SIGN_TEXT_MAX,'aria-label':t('Reception text'),placeholder:t('Company name or message')}) as HTMLTextAreaElement;text.value=initial.text;
  const file=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':t('Company logo')}) as HTMLInputElement;
  const modes=h('div.seg',{'role':'radiogroup','aria-label':t('Reception sign mode')});
  const status=h('p.setting-note'),save=h('button.btn.primary',{type:'button'},t('Save')),close=h('button.btn.close',{type:'button','aria-label':t('Close')},'✕');
  const remove=h('button.btn',{type:'button'},t('Remove logo'));
  const textSection=h('div',{},h('label',{},t('Reception text')),text,h('p.setting-note',{},t('Centered horizontally and vertically. Use Enter for a new line; the text fits the panel automatically.')));
  const logoSection=h('div',{},file,remove,h('p.setting-note',{},t('PNG, JPEG or WebP, up to 2 MB and 4096 × 4096 pixels. The logo keeps its proportions.')));
  function paint() {
    modes.replaceChildren(...([['blank',t('Empty')],['text',t('Text')],['logo',t('Logo')]] as const).map(([value,label])=>h('button.btn',{type:'button',role:'radio','aria-checked':String(mode===value),class:mode===value?'on':'',disabled:busy,onclick:()=>{mode=value;paint();}},label)));
    textSection.classList.toggle('hidden',mode!=='text');logoSection.classList.toggle('hidden',mode!=='logo');
    const hasLogo=imageData!==null && (!!image || !!initial.logo);
    remove.disabled=busy || !hasLogo;file.disabled=busy;text.disabled=busy;save.disabled=busy || loading || (mode==='logo' && !hasLogo) || (mode==='text' && !text.value.trim());
    drawReceptionSign(canvas,{mode,text:text.value.trim()},image);
  }
  async function load(url:string,data?:string,ticket=++loadTicket) {
    loading=true;status.textContent=t('Loading logo…');paint();
    const img=new Image();
    try {await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject();img.src=url;});if(ticket!==loadTicket)return;image=img;if(data!==undefined)imageData=data;status.textContent='';}
    catch {if(ticket===loadTicket){file.value='';status.textContent=t('Could not read the image');}}
    if(ticket===loadTicket){loading=false;paint();}
  }
  text.addEventListener('input',paint);
  file.addEventListener('change',async()=>{
    const selected=file.files?.[0];if(!selected)return;
    if(selected.size>SIGN_LOGO_MAX || !['image/png','image/jpeg','image/webp'].includes(selected.type)){file.value='';status.textContent=t('Choose a PNG, JPEG or WebP logo up to 2 MB');return;}
    const ticket=++loadTicket;loading=true;paint();const reader=new FileReader();reader.onload=()=>{if(ticket===loadTicket)void load(String(reader.result),String(reader.result),ticket);};reader.onerror=()=>{if(ticket===loadTicket){loading=false;status.textContent=t('Could not read the image');paint();}};reader.readAsDataURL(selected);
  });
  remove.addEventListener('click',()=>{++loadTicket;loading=false;imageData=null;image=undefined;file.value='';mode='blank';status.textContent='';paint();});
  save.addEventListener('click',async()=>{
    if(busy)return;busy=true;status.textContent=t('Saving…');paint();
    try {
      const response=await fetch('/api/reception-sign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,text:text.value,image:imageData})});
      const result=await response.json() as ReceptionSignState & {error?:string};if(!response.ok)throw new Error(result.error ?? 'Could not save the reception sign');
      receiveReception(result);if(current===modal)modal.close();toast(t('Reception sign saved'));
    }catch(error){status.textContent=t((error as Error).message);busy=false;paint();}
  });
  const el=h('div.modal.reception-sign',{role:'dialog','aria-label':t('Reception sign')},h('header',{},h('h2',{},t('Reception sign')),close),h('div.body',{},modes,canvas,textSection,logoSection,status),h('footer',{},h('span.grow',{},t('Visible to everyone in the building')),save));
  const modal=openModal(el,{doing:t('customizing the reception sign'),onClose:()=>{++loadTicket;if(current===modal)current=null;}});current=modal;
  close.addEventListener('click',()=>modal.close());paint();void document.fonts.ready.then(()=>{if(current===modal)paint();});
  if(initial.logo)void load('/api/reception-sign/logo?id='+encodeURIComponent(initial.logo.id));
}
