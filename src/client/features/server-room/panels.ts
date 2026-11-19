import { t as uiText } from '../../../shared/i18n';
import * as THREE from 'three';
import { SERVER_PANELS, type ServerPanelId, type ServerPanelState } from '../../../shared/server-panels';
import type { Interactable } from '../../world/types';

export const formatBytes = (n: number) => `${(n/1024**3).toFixed(1)} GiB`;
export class ServerPanelFeed {
  state?: ServerPanelState;
  error = '';
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private request?: AbortController;
  private active = false;
  on(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(fn=>fn()); }
  setActive(active: boolean) {
    if(active===this.active)return;
    this.active=active; clearTimeout(this.timer); this.request?.abort();
    if(active)void this.poll();
    else { this.state=undefined;this.error='';this.emit(); }
  }
  private async poll() {
    if(!this.active)return;
    const request=this.request=new AbortController();
    try {
      const response=await fetch('/api/server-room/status',{signal:AbortSignal.any([request.signal,AbortSignal.timeout(8000)]),cache:'no-store'});
      if(!response.ok)throw new Error(response.status===403?uiText("Administrator access required"):uiText("Monitoring unavailable"));
      const state=await response.json() as ServerPanelState;
      if(request.signal.aborted)return;
      this.state=state;this.error='';this.emit();
    } catch(error) {
      if(request.signal.aborted)return;
      this.state=undefined;this.error=error instanceof Error?error.message:uiText("Monitoring unavailable");this.emit();
    } finally {
      if(!request.signal.aborted && this.active)this.timer=setTimeout(()=>void this.poll(),5000);
    }
  }
}

export function createServerPanels(scene: THREE.Object3D) {
  const faces = SERVER_PANELS.map((panel,index) => {
    const node=scene.getObjectByName(panel.surface);
    if(!(node instanceof THREE.Mesh))throw new Error(`Missing server panel ${panel.id}`);
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=560;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
    node.material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false,side:THREE.DoubleSide});
    node.geometry.computeBoundingBox();
    const at=node.localToWorld(node.geometry.boundingBox!.getCenter(new THREE.Vector3()));
    const interaction: Interactable={kind:'serverpanel',panel:panel.id,x:at.x,y:0,z:at.z,radius:2.5};
    node.userData.interact=interaction;
    return {panel,index,canvas,texture,interaction};
  });
  const update=(state:ServerPanelState|undefined,error='',admin=true)=> {
    for(const {panel,index,canvas,texture} of faces) {
      const g=canvas.getContext('2d')!;
      g.fillStyle='#101c2b';g.fillRect(0,0,1280,560);g.textAlign='left';g.textBaseline='top';
      g.fillStyle='#71d6e4';g.font='bold 42px sans-serif';g.fillText(`${index+1}  ${uiText(panel.title)}`,48,30);
      const lines: string[]=[];
      if(!admin)lines.push(uiText("Administrator access required"));
      else if(error)lines.push(error,uiText("Reconnecting…"));
      else if(!state)lines.push(uiText("Loading…"));
      else if(panel.id==='machine') {
        const m=state.machine;
        lines.push(`CPU   ${m.cpu}% · ${m.cores} core`, `RAM   ${formatBytes(m.memUsed)} / ${formatBytes(m.memTotal)}`,
          m.disk?`${uiText('Disk')}   ${formatBytes(m.disk.used)} / ${formatBytes(m.disk.total)}`:uiText(m.diskError??'Disk unavailable'),
          m.disk?`${uiText('Available')}   ${formatBytes(m.disk.available)}`:'');
      } else if(panel.id==='docker') {
        const d=state.docker;
        if(d.state!=='ready')lines.push(uiText(d.message??'Docker unreachable'));
        else if(!d.containers.length)lines.push(uiText("Docker running · No containers"));
        else {
          lines.push(`${d.containers.filter(c=>c.state==='running').length} attivi / ${d.containers.length} container`);
          for(const c of d.containers.slice(0,5))lines.push(`${c.name} · ${c.state}${c.health?' · '+c.health:''}`);
          if(d.containers.length>5)lines.push(uiText("Open to view all services"));
        }
      } else {
        lines.push(state.console.configured?(state.console.active?uiText("Console in use"):uiText("Serial console available")):uiText("Console not configured"));
        lines.push(...state.console.lines.filter(Boolean).slice(-7));
        if(!state.console.active)lines.push(uiText("Open to connect to the VM console"));
      }
      g.fillStyle='#eef5fa';g.font=panel.id==='console'?'25px monospace':'32px sans-serif';
      lines.slice(0,9).forEach((line,i)=>g.fillText(line.slice(0,110),48,108+i*(panel.id==='console'?43:48),1180));
      g.fillStyle='#9bb0c5';g.font='24px sans-serif';g.fillText(admin?uiText("Click or E to expand"):uiText("VM administration"),48,515);
      texture.needsUpdate=true;
    }
  };
  update(undefined);
  return {update,interactables:faces.map(f=>f.interaction)};
}

// Augmented where the interaction is registered (index.ts).
declare module '../../world/types' { interface Interactable { panel?: ServerPanelId } }
