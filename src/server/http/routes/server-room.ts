import type { Ctx } from '../../office/context.js';
import { ServerPanelMonitor } from '../../server-panels.js';
import { VmConsole } from '../../vm-console.js';
import { send } from '../util.js';
import type { Route } from '../router.js';

const instances = new WeakMap<Ctx,{monitor:ServerPanelMonitor;console:VmConsole}>();
export function serverRoomServices(ctx: Ctx) {
  let services=instances.get(ctx);
  if(!services) {
    const console=new VmConsole();
    services={console,monitor:new ServerPanelMonitor(()=>ctx.machine.state(),()=>console.state())};
    instances.set(ctx,services);
  }
  return services;
}
export function stopServerRoom(ctx: Ctx) { instances.get(ctx)?.console.stop(); }
export const serverRoomRoute: Route = {
  path:'/api/server-room/status',auth:'session',
  async handle(ctx,{req,res,session}) {
    if(!ctx.meOf(session.account?.id).admin)return send(res,403,{error:'Administrator access required'});
    if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
    return send(res,200,await serverRoomServices(ctx).monitor.state());
  },
};
