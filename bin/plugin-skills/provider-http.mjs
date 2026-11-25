export class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const maxBytes = 256 * 1024;
export async function readLimited(response) {
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Problem(413, 'The document exceeds the reading limit (256 KiB).');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { await reader.cancel().catch(() => {}); }
}
