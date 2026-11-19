import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { WebSocket, type RawData } from 'ws';
import headless from '@xterm/headless';
import type { ServerPanelState } from '../shared/server-panels.js';

interface ConsoleConfig { origin: string; node: string; vmid: number; token: string; caFile: string }
export function consoleConfig(file = process.env.AGENT_OFFICE_SERVER_CONSOLE_FILE || '/etc/agent-office-palace/console.json'): ConsoleConfig | undefined {
  if (!existsSync(file)) return;
  const c = JSON.parse(readFileSync(file,'utf8')) as ConsoleConfig;
  const u = new URL(c.origin);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || !/^[\w-]+$/.test(c.node) || !Number.isInteger(c.vmid) || c.vmid < 100 || !/^PVEAPIToken=\S+$/.test(c.token) || !c.caFile) throw new Error('Invalid VM console configuration');
  return c;
}
export function consoleInput(raw: string): { data: string } | { cols: number; rows: number } | undefined {
  try {
    const value = JSON.parse(raw);
    if (value.type === 'input' && typeof value.data === 'string' && Buffer.byteLength(value.data) <= 16384) return {data:value.data};
    if (value.type === 'resize' && Number.isInteger(value.cols) && Number.isInteger(value.rows) && value.cols>=20 && value.cols<=240 && value.rows>=5 && value.rows<=100) return {cols:value.cols,rows:value.rows};
  } catch { /* Reject malformed client messages. */ }
}

/** A single writer to the existing Proxmox serial console, independent of workers/agent PTYs. */
export class VmConsole {
  private active = false;
  private lines: string[] = [];
  private shutdown?: () => void;
  constructor(private config: () => ConsoleConfig | undefined = consoleConfig) {}
  state(): ServerPanelState['console'] {
    let configured = false;
    try { configured = !!this.config(); } catch { /* Report unavailable without exposing configuration. */ }
    return {configured,active:this.active,lines:this.lines.slice()};
  }
  stop() { this.shutdown?.(); }
  async attach(browser: WebSocket, authorized: () => boolean) {
    if (this.active) { browser.close(4009,'Console già in uso'); return; }
    let cfg: ConsoleConfig | undefined;
    try { cfg = this.config(); } catch { browser.close(4011,'Configurazione console non disponibile'); return; }
    if (!cfg) { browser.close(4011,"Console not configured"); return; }
    this.active = true; this.lines = [];
    let upstream: WebSocket | undefined, timer: NodeJS.Timeout | undefined, stopped = false;
    const abort = new AbortController();
    const term = new headless.Terminal({cols:100,rows:28,scrollback:0,allowProposedApi:true});
    const close = () => {
      if (stopped) return;
      stopped = true; abort.abort(); clearInterval(timer); upstream?.terminate(); term.dispose();
      this.active = false; this.lines = []; this.shutdown = undefined;
      if (browser.readyState === WebSocket.OPEN) browser.close(1000,'Console disconnessa');
    };
    this.shutdown = close;
    browser.once('close',close); browser.once('error',close);
    try {
      const ca = readFileSync(cfg.caFile);
      const base = `/api2/json/nodes/${encodeURIComponent(cfg.node)}/qemu/${cfg.vmid}`;
      const ticket = await new Promise<{port:number;ticket:string;user:string}>((resolve,reject) => {
        const body = 'serial=serial0';
        const req = https.request(new URL(base+'/termproxy',cfg!.origin), {method:'POST',ca,signal:abort.signal,timeout:8000,
          headers:{Authorization:cfg!.token,'content-type':'application/x-www-form-urlencoded','content-length':Buffer.byteLength(body)}},res => {
          let data = ''; res.on('data',chunk => { data+=chunk; if(data.length>16384)req.destroy(new Error('Response too large')); });
          res.on('error',reject);res.on('end',() => {
            try { const value=JSON.parse(data).data; const port=Number(value?.port); if(res.statusCode!==200 || !value || !Number.isInteger(port) || port<5900 || port>5999 || typeof value.ticket!=='string' || typeof value.user!=='string')throw new Error('Console unavailable'); resolve({...value,port}); }
            catch { reject(new Error('Console unavailable')); }
          });
        });
        req.on('timeout',()=>req.destroy(new Error('Console timeout')));req.on('error',reject);req.end(body);
      });
      if (stopped || !authorized()) return close();
      const url = new URL(base+'/vncwebsocket',cfg.origin); url.protocol='wss:';
      url.searchParams.set('port',String(ticket.port));url.searchParams.set('vncticket',ticket.ticket);
      upstream = new WebSocket(url,{ca,headers:{Authorization:cfg.token},handshakeTimeout:8000,maxPayload:1024*1024});
      let ready = false, greeting = Buffer.alloc(0); const started=Date.now();
      upstream.on('open',()=>upstream!.send(`${ticket.user}:${ticket.ticket}\n`));
      upstream.on('message',(raw: RawData) => {
        let bytes = Buffer.isBuffer(raw) ? raw : Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw)]);
        if (!ready) {
          greeting=Buffer.concat([greeting,bytes]); if(greeting.length<2)return;
          if(greeting.subarray(0,2).toString()!=='OK')return close();
          ready=true;bytes=greeting.subarray(2);
          browser.send(JSON.stringify({type:'ready'})); upstream!.send('1:100:28:');
        }
        if (!authorized() || browser.bufferedAmount>1024*1024) return close();
        if (bytes.length) {
          browser.send(bytes,{binary:true});
          term.write(bytes,()=> { if(stopped)return; const b=term.buffer.active; this.lines=Array.from({length:Math.min(b.length,28)},(_,i)=>b.getLine(b.viewportY+i)?.translateToString(true) ?? ''); });
        }
      });
      browser.on('message',(raw,isBinary) => {
        if(isBinary || !ready || !authorized())return close();
        const message=consoleInput(raw.toString());if(!message)return browser.close(4000,'Messaggio non valido');
        if(upstream!.bufferedAmount>1024*1024)return close();
        if('data' in message)upstream!.send(`0:${Buffer.byteLength(message.data)}:${message.data}`);
        else {term.resize(message.cols,message.rows);upstream!.send(`1:${message.cols}:${message.rows}:`);}
      });
      upstream.on('error',()=> { if(browser.readyState===WebSocket.OPEN)browser.send(JSON.stringify({type:'error',message:"Console connection unavailable"})); close(); });
      upstream.on('close',close);
      timer=setInterval(()=> { if(!authorized() || (!ready && Date.now()-started>10000))return close(); if(ready && upstream?.readyState===WebSocket.OPEN)upstream.send('2'); },2000); timer.unref();
    } catch {
      if(browser.readyState===WebSocket.OPEN)browser.send(JSON.stringify({type:'error',message:"Console connection unavailable"}));
      close();
    }
  }
}
