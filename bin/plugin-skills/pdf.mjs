import { execFile } from 'node:child_process';
import { Problem } from './providers.mjs';

export const pdfTools = [
  { name: 'pdf.text', description: 'Extract native text from one PDF page. Arguments: file (workspace path or /office-drops attachment), page (1-based, default 1). Returns pages and text.' },
  { name: 'pdf.ocr', description: 'Recognize a scanned PDF page. Arguments: file, page (1-based), optional language (ita+eng, ita or eng). Returns pages and text.' },
  { name: 'pdf.render', description: 'View one original PDF page as an image. Arguments: file, page (1-based). Returns the page image.' },
];
const fileLimit = 16 * 1024 * 1024;
let busy = false;

// Parsers receive only the document bytes over stdin. The unprivileged child cannot read accounts or the broker socket.
function tool(command, args, input, maxBuffer, signal) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      encoding: 'buffer', maxBuffer, signal, killSignal: 'SIGKILL',
      uid: 65534, gid: 65534, cwd: '/tmp', env: { PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C', OMP_THREAD_LIMIT: '1' },
    }, (error, out) => {
      if (!error) return resolve(out);
      if (signal.aborted) return reject(new Problem(408, 'PDF processing timed out.'));
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return reject(new Problem(413, 'PDF page output is too large.'));
      reject(new Problem(422, 'The PDF page could not be processed. Check that the document is readable and unlocked.'));
    });
    child.stdin.on('error', () => {}); // A parser can reject the input before consuming it.
    child.stdin.end(input);
  });
}

export async function processPdf(req) {
  if (busy) throw new Problem(429, 'PDF processing is busy. Retry shortly.');
  const name = req.headers['x-office-tool'];
  let options;
  try { options = JSON.parse(Buffer.from(req.headers['x-office-options'], 'base64url').toString()); }
  catch { throw new Problem(400, 'Invalid PDF arguments.'); }
  const page = options?.page ?? 1;
  const language = options?.language ?? 'ita+eng';
  const length = Number(req.headers['content-length']);
  if (!pdfTools.some(t => t.name === name)) throw new Problem(404, 'Tool unavailable.');
  if (!Number.isSafeInteger(page) || page < 1 || !['ita+eng', 'ita', 'eng'].includes(language)) throw new Problem(400, 'Invalid PDF page or OCR language.');
  if (!Number.isSafeInteger(length) || length < 1 || length > fileLimit) throw new Problem(413, 'PDF files must be at most 16 MiB.');
  busy = true;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > length) throw new Problem(413, 'PDF files must be at most 16 MiB.');
      chunks.push(chunk);
    }
    const pdf = Buffer.concat(chunks);
    if (size !== length || !pdf.subarray(0, 1024).includes('%PDF-')) throw new Problem(415, 'A PDF document is required.');
    const signal = AbortSignal.timeout(35_000);
    const info = (await tool('pdfinfo', ['-'], pdf, 128 * 1024, signal)).toString('utf8');
    const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
    if (!pages || page > pages) throw new Problem(400, 'PDF page is outside the document.');
    const range = ['-f', String(page), '-l', String(page)];
    if (name === 'pdf.text') {
      const out = await tool('pdftotext', [...range, '-layout', '-enc', 'UTF-8', '-', '-'], pdf, 256 * 1024, signal);
      return { page, pages, text: out.toString('utf8').trim() };
    }
    if (name === 'pdf.render') {
      const image = await tool('pdftoppm', [...range, '-singlefile', '-scale-to', '1440', '-jpeg', '-'], pdf, 1400 * 1024, signal);
      return { page, pages, image: { mimeType: 'image/jpeg', data: image.toString('base64') } };
    }
    const raster = await tool('pdftoppm', [...range, '-singlefile', '-scale-to', '2600', '-gray', '-'], pdf, 8 * 1024 * 1024, signal);
    const out = await tool('tesseract', ['stdin', 'stdout', '-l', language, '--dpi', '300'], raster, 256 * 1024, signal);
    return { page, pages, language, text: out.toString('utf8').trim() };
  } finally { busy = false; }
}
