// Run with Node inside the Plugin & Skills image. Both PDFs are synthetic.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

function pdf(objects) {
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let length = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from((index + 1) + ' 0 obj\n'), Buffer.from(object), Buffer.from('\nendobj\n')]);
    chunks.push(chunk);
    length += chunk.length;
  }
  const entries = offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  chunks.push(Buffer.from('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' + entries +
    'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + length + '\n%%EOF\n'));
  return Buffer.concat(chunks);
}
function stream(data, props = '') {
  const b = Buffer.from(data);
  return Buffer.concat([Buffer.from('<< ' + props + ' /Length ' + b.length + ' >>\nstream\n'), b, Buffer.from('\nendstream')]);
}
function page(resources, content) {
  return '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << ' + resources + ' >> /Contents ' + content + ' 0 R >>';
}
const catalog = '<< /Type /Catalog /Pages 2 0 R >>';
const font = '/Font << /F1 5 0 R >>';
const digital = pdf([catalog, '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', page(font, 6), page(font, 7),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  stream('BT /F1 27 Tf 40 160 Td (Verbale ufficio 12345) Tj ET'),
  stream('BT /F1 27 Tf 40 160 Td (Office report 67890) Tj ET')]);
const jpeg = execFileSync('pdftoppm', ['-f','1','-l','1','-singlefile','-scale-to','1200','-jpeg','-'], { input: digital });
const scanned = pdf([catalog, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', page('/XObject << /Im 4 0 R >>', 5),
  stream(jpeg, '/Type /XObject /Subtype /Image /Width 1200 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'),
  stream('q 600 0 0 300 0 0 cm /Im Do Q')]);
if (process.argv.includes('--fixtures')) {
  console.log(JSON.stringify({ digital: digital.toString('base64'), scanned: scanned.toString('base64') }));
  process.exit(0);
}
const dir = await mkdtemp('/tmp/office-pdf-');
const socket = dir + '/broker.sock';
const service = spawn(process.execPath, ['/app/service.mjs'], { env: { ...process.env, AOP_PLUGIN_DATA_DIR: dir, AOP_PLUGIN_SOCKET: socket } });
try {
  for (let i = 0; i < 100 && !await stat(socket).catch(() => false); i++) await delay(30);
  function call(route, data, headers = {}) {
    return new Promise((resolve, reject) => {
      const body = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
      const req = request({ socketPath: socket, path: '/' + route, method: 'POST', headers: {
        'content-type': 'application/json', 'content-length': body.length, ...headers } }, res => {
        const parts = [];
        res.on('data', b => parts.push(b));
        res.on('end', () => resolve({ status: res.statusCode, ...JSON.parse(Buffer.concat(parts)) }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end(body);
    });
  }
  const file = (name, data, options = {}) => call('worker/file', data, { 'content-type': 'application/octet-stream',
    'x-office-tool': name, 'x-office-options': Buffer.from(JSON.stringify(options)).toString('base64url') });
  assert.equal((await file('pdf.text', digital)).status, 404);
  assert.equal((await call('worker/list', {})).tools.length, 0);
  assert.equal((await call('admin/skill', { id: 'pdf-ocr', enabled: true })).status, 200);
  assert.deepEqual((await call('worker/list', {})).tools.map(x => x.name), ['pdf.text', 'pdf.ocr', 'pdf.render']);
  assert.match((await call('worker/use', { name: 'skill.pdf-ocr' })).instructions, /pdf\.render/);
  assert.deepEqual(await file('pdf.text', digital, { page: 2 }), { status: 200, page: 2, pages: 2, text: 'Office report 67890' });
  assert.equal((await file('pdf.text', scanned)).text, '');
  assert.match((await file('pdf.ocr', scanned)).text, /Verbale ufficio 12345/i);
  assert.match((await file('pdf.ocr', digital, { page: 2, language: 'eng' })).text, /Office report 67890/i);
  const { image } = await file('pdf.render', scanned);
  assert.equal(image.mimeType, 'image/jpeg');
  assert.equal(Buffer.from(image.data, 'base64').readUInt16BE(), 0xffd8);
  assert.equal((await file('pdf.text', digital, { page: 3 })).status, 400);
  assert.equal((await file('pdf.ocr', scanned, { language: 'rus' })).status, 400);
  assert.equal((await file('pdf.text', Buffer.from('not PDF'))).status, 415);
  assert.equal((await file('pdf.text', Buffer.from('%PDF-broken'))).status, 422);
  await call('admin/skill', { id: 'pdf-ocr', enabled: false });
  assert.equal((await file('pdf.render', digital)).status, 404);
  console.log('PASS. Catalog toggle, two native pages, Italian and English OCR, image-only PDF, JPEG, invalid inputs and revoke.');
} finally {
  const exit = once(service, 'exit');
  service.kill();
  await exit;
  await rm(dir, { recursive: true, force: true });
}
