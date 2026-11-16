import { EMPTY_RECEPTION_SIGN, type ReceptionSignState } from '../../../shared/reception-sign';
let current:ReceptionSignState={...EMPTY_RECEPTION_SIGN};
const listeners=new Set<(state:ReceptionSignState)=>void>();
export const receptionState=()=>current;
export function receptionChanged(fn:(state:ReceptionSignState)=>void) {listeners.add(fn);return ()=>{listeners.delete(fn);};}
export function receiveReception(state:ReceptionSignState) {
  if(state.revision<current.revision || JSON.stringify(state)===JSON.stringify(current)) return;
  current=state;for(const fn of listeners)fn(state);
}
export async function refreshReception() {
  const response=await fetch('/api/reception-sign');
  if(!response.ok)throw new Error('Could not load the reception sign');
  receiveReception(await response.json() as ReceptionSignState);return current;
}
