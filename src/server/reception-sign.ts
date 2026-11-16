import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EMPTY_RECEPTION_SIGN, SIGN_IMAGE_SIDE_MAX, SIGN_LOGO_MAX, signMode, signText, type ReceptionLogo, type ReceptionSignState } from '../shared/reception-sign.js';

/** Raster headers, without executing or fetching user-provided image content. */
function dimensions(bytes: Buffer, mime: ReceptionLogo['mime']): [number, number] {
  if (mime === 'image/png' && bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length-8, bytes.length-4) === 'IEND') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (mime === 'image/jpeg' && bytes.length >= 12 && bytes.readUInt16BE(0) === 0xffd8 && bytes.readUInt16BE(bytes.length-2) === 0xffd9) {
    let i = 2;
    while (i+4 <= bytes.length) {
      if (bytes[i++] !== 0xff) break;
      while (bytes[i] === 0xff) i++;
      if (i+3 > bytes.length) break;
      const marker = bytes[i++];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
      const length = bytes.readUInt16BE(i);
      if (length < 2 || i+length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) return [bytes.readUInt16BE(i+5), bytes.readUInt16BE(i+3)];
      if (marker === 0xda || marker === 0xd9) break;
      i += length;
    }
  }
  if (mime === 'image/webp' && bytes.length >= 25 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && bytes.readUInt32LE(4)+8 === bytes.length) {
    const chunk = bytes.toString('ascii',12,16);
    if (chunk === 'VP8X' && bytes.length >= 30) return [bytes.readUIntLE(24,3)+1, bytes.readUIntLE(27,3)+1];
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a]))) return [bytes.readUInt16LE(26)&0x3fff, bytes.readUInt16LE(28)&0x3fff];
    if (chunk === 'VP8L' && bytes[20] === 0x2f) { const bits=bytes.readUInt32LE(21); return [(bits&0x3fff)+1, ((bits>>>14)&0x3fff)+1]; }
  }
  throw new Error('Choose a valid PNG, JPEG or WebP image');
}

function image(raw: unknown): { bytes: Buffer; meta: ReceptionLogo } {
  if (typeof raw !== 'string' || raw.length > Math.ceil(SIGN_LOGO_MAX/3)*4+128) throw new Error('The logo must be at most 2 MB');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!match || match[2].length % 4) throw new Error('Choose a valid PNG, JPEG or WebP image');
  const bytes=Buffer.from(match[2],'base64'), mime=match[1] as ReceptionLogo['mime'];
  if (!bytes.length || bytes.length > SIGN_LOGO_MAX) throw new Error('The logo must be at most 2 MB');
  const [width,height]=dimensions(bytes,mime);
  if (!width || !height || width > SIGN_IMAGE_SIDE_MAX || height > SIGN_IMAGE_SIDE_MAX) throw new Error('The logo must be at most 4096 × 4096 pixels');
  return { bytes, meta:{id:createHash('sha256').update(bytes).digest('hex'),mime,width,height} };
}

/** One building-wide sign, independent of project floors. Atomic persistence includes its raster. */
export class ReceptionSign {
  private value: ReceptionSignState = { ...EMPTY_RECEPTION_SIGN };
  private raster?: { bytes: Buffer; meta: ReceptionLogo };
  private file: string;
  constructor(private dataDir: string) {
    this.file=path.join(dataDir,'reception-sign.json');
    try {
      const saved=JSON.parse(readFileSync(this.file,'utf8'));
      const raster=saved.image ? image(saved.image) : undefined;
      const mode=signMode(saved.mode), text=signText(saved.text);
      if (mode === 'logo' && !raster) throw new Error('Missing logo');
      this.raster=raster;
      this.value={revision:Number.isSafeInteger(saved.revision) && saved.revision>=0 ? saved.revision : 0,mode,text,logo:raster?.meta ?? null};
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Could not load the reception sign:', (e as Error).message); }
  }
  state(): ReceptionSignState { return { ...this.value, logo:this.value.logo ? {...this.value.logo} : null }; }
  logo(id: string) { return id === this.raster?.meta.id ? this.raster : undefined; }
  update(raw: unknown): ReceptionSignState {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid reception sign');
    const input=raw as Record<string,unknown>, mode=signMode(input.mode), text=signText(input.text);
    const raster=input.image === null ? undefined : input.image === undefined ? this.raster : image(input.image);
    if (mode === 'text' && !text) throw new Error('Enter text for the reception sign');
    if (mode === 'logo' && !raster) throw new Error('Upload a logo first');
    const next={revision:this.value.revision+1,mode,text,logo:raster?.meta ?? null};
    const saved={...next,image:raster ? `data:${raster.meta.mime};base64,${raster.bytes.toString('base64')}` : undefined};
    mkdirSync(this.dataDir,{recursive:true,mode:0o700});
    writeFileSync(this.file+'.tmp',JSON.stringify(saved),{mode:0o600});
    renameSync(this.file+'.tmp',this.file);
    this.value=next; this.raster=raster;
    return this.state();
  }
}
