import type { ReceptionSignState } from '../../shared/reception-sign';

const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';
export const SIGN_BACKGROUND = '#f0d9ad';
export function logoRect(w: number, h: number, iw: number, ih: number) {
  const margin=h*0.1, scale=Math.min((w-2*margin)/iw,(h-2*margin)/ih);
  const width=iw*scale,height=ih*scale;
  return {x:(w-width)/2,y:(h-height)/2,width,height};
}

/** Fit the actual glyph bounds, including accents and multiline text, about both center axes. */
export function drawReceptionSign(canvas: HTMLCanvasElement, state: Pick<ReceptionSignState,'mode'|'text'>, image?: CanvasImageSource & {width:number;height:number}) {
  const g=canvas.getContext('2d')!,w=canvas.width,h=canvas.height;
  g.clearRect(0,0,w,h);g.fillStyle=SIGN_BACKGROUND;g.fillRect(0,0,w,h);
  if (state.mode === 'logo' && image) { const r=logoRect(w,h,image.width,image.height);g.drawImage(image,r.x,r.y,r.width,r.height);return; }
  if (state.mode !== 'text' || !state.text) return;
  const lines=state.text.split('\n');g.textAlign='center';g.textBaseline='alphabetic';
  const measure=(size:number) => {
    g.font=`700 ${size}px ${FONT}`;
    const step=size*1.2;
    const metrics=lines.map((text,i)=>{const m=g.measureText(text);return {text,left:m.actualBoundingBoxLeft,right:m.actualBoundingBoxRight,top:i*step-m.actualBoundingBoxAscent,bottom:i*step+m.actualBoundingBoxDescent,base:i*step};});
    return {metrics,top:Math.min(...metrics.map(m=>m.top)),bottom:Math.max(...metrics.map(m=>m.bottom)),width:Math.max(...metrics.map(m=>m.left+m.right))};
  };
  let low=1,high=h;
  for(let i=0;i<12;i++){const mid=(low+high)/2,m=measure(mid);if(m.width<=w*.9 && m.bottom-m.top<=h*.8)low=mid;else high=mid;}
  const m=measure(low),offset=(h-m.top-m.bottom)/2;g.fillStyle='#24364b';
  for(const line of m.metrics)g.fillText(line.text,w/2+(line.left-line.right)/2,line.base+offset);
}
