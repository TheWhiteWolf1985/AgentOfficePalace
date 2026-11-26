import { createConnection } from 'node:net';

/** The system service accepts only an operation and a worker ID, never a host path. */
export function gitScratch(action: 'prepare' | 'release', id: string): Promise<void> {
  if (!/^[a-f0-9]{12}$/.test(id)) throw Error('Identità agente non valida');
  return new Promise((resolve, reject) => {
    const socket = createConnection('/run/agent-office-git.sock');
    const fail = () => reject(Error('Spazio temporaneo Git su disco non disponibile. Controllare il servizio agent-office-git e il disco della VM.'));
    let response = '';
    socket.setTimeout(65_000, () => socket.destroy(Error('timeout')));
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(action + ' ' + id + '\n'));
    socket.on('data', chunk => {
      response += chunk;
      if (response.length > 1024) socket.destroy(Error('invalid response'));
    });
    socket.on('error', fail);
    socket.on('end', () => {
      try { if (JSON.parse(response).ok === true) return resolve(); } catch { /* service unavailable */ }
      fail();
    });
  });
}
