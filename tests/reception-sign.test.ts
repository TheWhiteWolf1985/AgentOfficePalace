import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReceptionSign } from '../src/server/reception-sign.js';
import { SIGN_LOGO_MAX } from '../src/shared/reception-sign.js';
import { logoRect } from '../src/client/shared/reception-sign-draw.js';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1kAAAAASUVORK5CYII=';
function fixture(t:TestContext) {
  const dir=mkdtempSync(path.join(tmpdir(),'office-reception-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  return {dir,sign:new ReceptionSign(dir)};
}
test('reception text, image and selected mode survive restart independently of project offices',t=>{
  const {dir,sign}=fixture(t);
  assert.deepEqual(sign.state(),{revision:0,mode:'blank',text:'',logo:null});
  const text=sign.update({mode:'text',text:'  Azienda\r\nStudio  '});assert.equal(text.text,'Azienda\nStudio');
  assert.deepEqual(new ReceptionSign(dir).state(),text);
  const logo=sign.update({mode:'logo',text:text.text,image:png});assert.ok(logo.logo);
  assert.equal(logo.logo.mime,'image/png');assert.equal(logo.logo.width,1);
  const back=new ReceptionSign(dir);assert.deepEqual(back.state(),logo);
  assert.deepEqual(back.logo(logo.logo.id)?.bytes,Buffer.from(png.split(',')[1],'base64'));
  assert.equal(back.logo('../../secret'),undefined);
  assert.equal(JSON.stringify(back.state()).includes('base64'),false,'socket state stays small');
  assert.equal(sign.update({mode:'text',text:'New name'}).logo?.id,logo.logo.id,'switching mode preserves the uploaded logo');
  const clear=sign.update({mode:'blank',text:'New name',image:null});assert.equal(clear.logo,null);
  assert.equal(new ReceptionSign(dir).state().logo,null);
  assert.equal(readFileSync(path.join(dir,'reception-sign.json'),'utf8').includes('base64'),false,'removal also clears persisted image bytes');
});
test('invalid sign changes never replace the saved content or revision',t=>{
  const {dir,sign}=fixture(t);const before=sign.update({mode:'text',text:'Company'});
  for(const input of [null,[],{mode:'other',text:'X'},{mode:'text',text:' '},{mode:'text',text:'x'.repeat(401)},{mode:'text',text:'a\n'.repeat(7)+'a'},{mode:'text',text:'\u0000'},{mode:'logo',text:''},{mode:'logo',text:'',image:'data:image/svg+xml;base64,PHN2Zz4='},{mode:'logo',text:'',image:'data:image/png;base64,YWJjZA=='}])assert.throws(()=>sign.update(input));
  assert.deepEqual(sign.state(),before);assert.deepEqual(new ReceptionSign(dir).state(),before);
});
test('logo upload limits are checked on bytes and decoded dimensions',t=>{
  const {sign}=fixture(t);
  const huge=Buffer.from(png.split(',')[1],'base64');huge.writeUInt32BE(5000,16);
  assert.throws(()=>sign.update({mode:'logo',text:'',image:'data:image/png;base64,'+huge.toString('base64')}),/4096/);
  assert.throws(()=>sign.update({mode:'logo',text:'',image:'data:image/png;base64,'+Buffer.alloc(SIGN_LOGO_MAX+1).toString('base64')}),/2 MB/);
  assert.throws(()=>sign.update({mode:'logo',text:'',image:'data:image/jpeg;base64,'+Buffer.from([255,216,255,255,255,255,255,255,255,255,255,217]).toString('base64')}),/valid/);
});
test('logo fitting centers wide and tall images without stretching or cropping',()=>{
  for(const [w,h] of [[600,200],[100,900],[300,300]]){
    const r=logoRect(2048,468,w,h);
    assert.ok(Math.abs(r.width/r.height-w/h)<1e-9);
    assert.ok(Math.abs(r.x+r.width/2-1024)<1e-9);assert.ok(Math.abs(r.y+r.height/2-234)<1e-9);
    assert.ok(r.x>=0 && r.y>=0 && r.x+r.width<=2048 && r.y+r.height<=468);
  }
});
