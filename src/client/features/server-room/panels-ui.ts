import { t as uiText } from '../../../shared/i18n';
import './panels.css';
import { h, openModal, type Modal } from '../../ui/dom';
import { store } from '../../state';
import { SERVER_PANELS, type ServerPanelId } from '../../../shared/server-panels';
import { SERVER_ROOM } from '../../../shared/rooftop';
import { formatBytes, type ServerPanelFeed } from './panels';
import type { Terminal } from '@xterm/xterm';

let opened: Modal | undefined;
export async function openServerPanel(id:ServerPanelId,feed:ServerPanelFeed) {
  if(!store.me.admin || store.floor!==SERVER_ROOM)return;
  opened?.close();
  const name=uiText(SERVER_PANELS.find(p=>p.id===id)!.title);
  const body=h('div.server-panel-body'), state=h('span.server-panel-state',{'aria-live':'polite'});
  const full=h('button',{type:'button',onclick:()=>el.classList.toggle('server-panel-full')},uiText("Expand / Restore"));
  const el=h('section.modal.server-panel',{'data-panel':id,role:'dialog','aria-label':name},h('header',{},h('h2',{},name),state,full),body);
  let closed=false, socket:WebSocket|undefined, term:Terminal|undefined, observer:ResizeObserver|undefined;
  let unsub=()=>{};
  let filter='';
  const check=()=> { if(!store.me.admin || store.floor!==SERVER_ROOM)modal.close(); };
  const offFloor=store.on('floor',check),offMe=store.on('me',check);
  const modal=opened=openModal(el,{doing:name,onClose:()=> {
    closed=true;unsub();offFloor();offMe();socket?.close();observer?.disconnect();term?.dispose();if(opened===modal)opened=undefined;
  }});
  const updated=()=> {
    const restoreSearch=body.contains(document.activeElement) && document.activeElement?.tagName==='INPUT';
    const s=feed.state;
    state.textContent=feed.error || (s?`${uiText('Updated')} ${new Date(s.at).toLocaleTimeString()}`:uiText("Loading…"));
    if(id==='console')return;
    body.replaceChildren();
    if(!s) {body.append(h('p',{},feed.error||uiText("Loading…")));return;}
    if(id==='machine') {
      const m=s.machine, pct=m.memTotal?Math.round(100*m.memUsed/m.memTotal):0;
      const gauge=(title:string,value:number,detail:string)=>h('article.server-metric',{},h('h3',{},title),h('strong',{},`${value}%`),h('progress',{max:100,value}),h('p',{},detail));
      body.append(h('div.server-metrics',{},gauge('CPU',m.cpu,`${m.cores} ${uiText('virtual cores')}`),gauge('RAM',pct,`${formatBytes(m.memUsed)} / ${formatBytes(m.memTotal)}`),
        m.disk?gauge(uiText("Disk"),Math.round(100*m.disk.used/m.disk.total),`${formatBytes(m.disk.used)} / ${formatBytes(m.disk.total)} · ${uiText('Available')} ${formatBytes(m.disk.available)} · ${m.disk.path}`):h('p',{},uiText(m.diskError??'Disk unavailable'))));
      body.append(h('h3',{},uiText("CPU and RAM history · last 5 minutes")),h('p',{},uiText("CPU: cyan · RAM: green")));
      const canvas=h('canvas.server-history',{width:1000,height:220,'aria-label':'Storico utilizzo CPU e RAM'}),g=canvas.getContext('2d')!;
      g.fillStyle='#101c2b';g.fillRect(0,0,1000,220);
      for(const [field,color] of [[1,'#71d6e4'],[2,'#8de3ae']] as const) {
        g.strokeStyle=color;g.lineWidth=3;g.beginPath();m.history.forEach((point,i)=>{const x=15+970*i/Math.max(1,m.history.length-1),y=205-190*point[field]/100;i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();
      }
      body.append(canvas);
    } else {
      const d=s.docker;
      if(d.state!=='ready') {body.append(h('p',{},uiText(d.message??'Docker unreachable')));return;}
      body.append(h('p',{},`${d.containers.length} container · ${d.containers.filter(c=>c.state==='running').length} attivi`));
      if(!d.containers.length) {body.append(h('p',{},uiText("No containers present")));return;}
      const search=h('input',{type:'search',placeholder:uiText("Filter name, project or service"),'aria-label':uiText("Filter Docker services")});
      search.value=filter;
      const table=h('table.server-containers'),rows=h('tbody');
      table.append(h('thead',{},h('tr',{},...['Container',uiText("Project / Service"),uiText("State"),uiText("Health"),uiText("Image"),uiText("Activity")].map(t=>h('th',{},t)))),rows);
      const render=()=>{const filter=search.value.toLowerCase();rows.replaceChildren(...d.containers.filter(c=>`${c.name} ${c.project??''} ${c.service??''}`.toLowerCase().includes(filter)).map(c=>h('tr',{},h('td',{},c.name),h('td',{},[c.project,c.service].filter(Boolean).join(' / ')||'—'),h('td',{},c.state),h('td',{},c.health??uiText("Not configured")),h('td',{},c.image),h('td',{},c.status))));};
      search.oninput=()=>{filter=search.value;render();};render();body.append(search,table);if(restoreSearch)search.focus();
    }
  };
  unsub=feed.on(updated);updated();
  if(id!=='console')return;
  const info=h('p',{},uiText("Serial console of the VM. Sign in with a Debian account. One person at a time can use it. Press Enter if the prompt is not visible."));
  const status=h('p',{'aria-live':'polite'}),host=h('div.server-console-host');
  const reconnect=h('button',{type:'button'},uiText("Connect"));
  body.append(info,h('div.server-console-actions',{},reconnect,status),host);
  const [{Terminal},{FitAddon},{TERM_THEME}]=await Promise.all([import('@xterm/xterm'),import('@xterm/addon-fit'),import('../../ui/termtheme'),import('@xterm/xterm/css/xterm.css')]);
  if(closed)return;
  term=new Terminal({fontFamily:'ui-monospace, monospace',fontSize:15,theme:TERM_THEME,scrollback:1000});
  const fit=new FitAddon();term.loadAddon(fit);term.open(host);
  const fitNow=()=> {if(closed)return;fit.fit();term!.resize(Math.max(20,Math.min(240,term!.cols)),Math.max(5,Math.min(100,term!.rows)));if(ready && socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'resize',cols:term!.cols,rows:term!.rows}));};
  observer=new ResizeObserver(fitNow);observer.observe(host);
  let ready=false;
  term.onData(data=> {if(ready && socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'input',data}));});
  const connect=()=> {
    if(socket && socket.readyState<2) {socket.close();return;}
    ready=false;term!.reset();status.textContent=uiText("Connecting…");reconnect.textContent=uiText("Disconnect");
    socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/server-console`);socket.binaryType='arraybuffer';
    socket.onmessage=event=> {
      if(typeof event.data==='string') {
        const msg=JSON.parse(event.data);
        if(msg.type==='ready') {ready=true;status.textContent=uiText("Console connected");fitNow();term!.focus();}
        if(msg.type==='error')status.textContent=uiText(msg.message);
      } else term!.write(new Uint8Array(event.data));
    };
    socket.onclose=event=> {ready=false;if(closed)return;reconnect.textContent=uiText("Connect");status.textContent=event.code===4009?uiText("Console already in use by another administrator"):event.code===4011?uiText("Console not configured or unavailable"):uiText("Console disconnected · press Connect to retry");};
    socket.onerror=()=> {if(!closed)status.textContent=uiText("Console connection unavailable");};
  };
  reconnect.onclick=connect;connect();
}
