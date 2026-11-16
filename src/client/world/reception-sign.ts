import * as THREE from 'three';
import { ATRIUM_DATA } from '../../shared/atrium';
import { EMPTY_RECEPTION_SIGN, type ReceptionSignState } from '../../shared/reception-sign';

import { drawReceptionSign } from '../shared/reception-sign-draw';

let canvas: HTMLCanvasElement | undefined, texture: THREE.CanvasTexture | undefined, material: THREE.MeshBasicMaterial | undefined;
let state: ReceptionSignState={...EMPTY_RECEPTION_SIGN}, loaded: HTMLImageElement | undefined, loadedId='', generation=0;
const render=()=>{if(canvas){drawReceptionSign(canvas,state,state.logo?.id===loadedId ? loaded : undefined);texture!.needsUpdate=true;}};
function signMaterial() {
  if (!canvas) {
    canvas=document.createElement('canvas');canvas.width=2048;canvas.height=Math.round(canvas.width*ATRIUM_DATA.logo.height_m/ATRIUM_DATA.logo.width_m);
    texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.anisotropy=8;
    material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});material.name='atrio_mat_logo_dynamic';
    render();void document.fonts.ready.then(render);
  }
  return material!;
}
/** All interior/exterior copies share one texture, with glTF V=0 at the top. */
export function attachReceptionSign(root: THREE.Object3D) {
  const surface=root.getObjectByName(ATRIUM_DATA.logo.surface);
  if (surface instanceof THREE.Mesh) {surface.material=signMaterial();surface.castShadow=false;surface.receiveShadow=false;}
}
export async function paintReceptionSign(next: ReceptionSignState) {
  state=next;const ticket=++generation;render();
  if(next.mode !== 'logo' || !next.logo || next.logo.id===loadedId) return;
  const img=new Image();
  try {await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Logo unavailable'));img.src='/api/reception-sign/logo?id='+encodeURIComponent(next.logo!.id);});}
  catch {return;}
  if(ticket!==generation) return;
  loaded=img;loadedId=next.logo.id;render();
}
