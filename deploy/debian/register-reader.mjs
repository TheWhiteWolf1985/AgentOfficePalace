import { connections } from '../dist/server/server/connections/store.js';
import { RemoteApi } from '../dist/server/server/connections/api.js';

let payload = '';
for await (const chunk of process.stdin) payload += chunk;
const { url, username, token } = JSON.parse(payload);
const store = connections();
const server = store.putServer({ id: 'office-forgejo', provider: 'forgejo', name: 'Forgejo uffici', url });
const previous = store.snapshot().accounts.find(a => a.serverId === server.id && a.username === username);
const account = store.putAccount({ id: previous?.id, serverId: server.id, username, name: 'Uffici · lettura', token });
await new RemoteApi(store, account.id).verify();
console.log(account.id);
