import './ui.css';
import { t } from '../../../shared/i18n';
import { SIGN_LOGO_MAX, SIGN_TEXT_MAX, type ReceptionSignState, type SignMode } from '../../../shared/reception-sign';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import { drawReceptionSign } from '../../shared/reception-sign-draw';
import { receiveReception, receptionState, refreshReception } from './state';

/** Settings owns the editor lifetime; loading is deferred until its tab is selected. */
export function receptionSignPanel() {
  const element=h('div.reception-sign');
  let disposed=false,started=false,loadTicket=0;
  async function load() {
    if(started || disposed)return;
    started=true;
    if(!store.me.admin){element.replaceChildren(h('p',{},t('Administrator access required')));return;}
    element.replaceChildren(h('p',{},t('Loading…')));
    try {await refreshReception();}
    catch {if(!disposed){started=false;element.replaceChildren(h('p',{},t('Could not load the reception sign')));}return;}
    if(disposed)return;
    const initial=receptionState();let mode:SignMode=initial.mode,imageData:string|null|undefined,image:HTMLImageElement|undefined,busy=false,loading=false;
    const canvas=h('canvas.sign-preview',{width:1024,height:234,'aria-label':t('Reception sign preview')}) as HTMLCanvasElement;
    const text=h('textarea',{rows:4,maxlength:SIGN_TEXT_MAX,'aria-label':t('Reception text'),placeholder:t('Company name or message')}) as HTMLTextAreaElement;text.value=initial.text;
    const file=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':t('Company logo')}) as HTMLInputElement;
    const modes=h('div.seg',{'role':'radiogroup','aria-label':t('Reception sign mode')});
    const status=h('p.setting-note',{'role':'status'}),save=h('button.btn.primary',{type:'button'},t('Apply'));
    const remove=h('button.btn',{type:'button'},t('Remove logo'));
    const textSection=h('div',{},h('label',{},t('Reception text')),text,h('p.setting-note',{},t('Centered horizontally and vertically. Use Enter for a new line; the text fits the panel automatically.')));
    const logoSection=h('div',{},file,remove,h('p.setting-note',{},t('PNG, JPEG or WebP, up to 2 MB and 4096 × 4096 pixels. The logo keeps its proportions.')));
    function paint() {
      modes.replaceChildren(...([['blank',t('Empty')],['text',t('Text')],['logo',t('Logo')]] as const).map(([value,label])=>h('button.btn',{type:'button',role:'radio','aria-checked':String(mode===value),class:mode===value?'on':'',disabled:busy,onclick:()=>{mode=value;status.textContent='';paint();}},label)));
      textSection.classList.toggle('hidden',mode!=='text');logoSection.classList.toggle('hidden',mode!=='logo');
      const hasLogo=imageData!==null && (!!image || !!initial.logo);
      remove.disabled=busy || !hasLogo;file.disabled=busy;text.disabled=busy;save.disabled=busy || loading || (mode==='logo' && !hasLogo) || (mode==='text' && !text.value.trim());
      drawReceptionSign(canvas,{mode,text:text.value.trim()},image);
    }
    async function loadImage(url:string,data?:string,ticket=++loadTicket) {
      loading=true;status.textContent=t('Loading logo…');paint();
      const img=new Image();
      try {await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject();img.src=url;});if(ticket!==loadTicket)return;image=img;if(data!==undefined)imageData=data;status.textContent='';}
      catch {if(ticket===loadTicket){file.value='';status.textContent=t('Could not read the image');}}
      if(ticket===loadTicket){loading=false;paint();}
    }
    text.addEventListener('input',()=>{status.textContent='';paint();});
    file.addEventListener('change',async()=>{
      const selected=file.files?.[0];if(!selected)return;
      if(selected.size>SIGN_LOGO_MAX || !['image/png','image/jpeg','image/webp'].includes(selected.type)){file.value='';status.textContent=t('Choose a PNG, JPEG or WebP logo up to 2 MB');return;}
      const ticket=++loadTicket;loading=true;paint();const reader=new FileReader();reader.onload=()=>{if(ticket===loadTicket)void loadImage(String(reader.result),String(reader.result),ticket);};reader.onerror=()=>{if(ticket===loadTicket){loading=false;status.textContent=t('Could not read the image');paint();}};reader.readAsDataURL(selected);
    });
    remove.addEventListener('click',()=>{++loadTicket;loading=false;imageData=null;image=undefined;file.value='';mode='blank';status.textContent='';paint();});
    save.addEventListener('click',async()=>{
      if(busy || disposed)return;busy=true;status.textContent=t('Saving…');paint();
      try {
        const response=await fetch('/api/reception-sign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,text:text.value,image:imageData})});
        const result=await response.json() as ReceptionSignState & {error?:string};if(!response.ok)throw new Error(result.error ?? 'Could not save the reception sign');
        receiveReception(result);busy=false;if(!disposed){status.textContent=t('Reception sign saved');paint();toast(t('Reception sign saved'));}
      }catch(error){if(!disposed){status.textContent=t((error as Error).message);busy=false;paint();}}
    });
    element.replaceChildren(modes,canvas,textSection,logoSection,status,h('div.sign-actions',{},h('span.grow',{},t('Visible to everyone in the building')),save));
    paint();void document.fonts.ready.then(()=>{if(!disposed)paint();});
    if(initial.logo)void loadImage('/api/reception-sign/logo?id='+encodeURIComponent(initial.logo.id));
  }
  return {element,load:()=>{void load();},dispose:()=>{disposed=true;++loadTicket;}};
}
