"""Collaudo riproducibile del GLB reimportato in una scena Blender separata.

Misure, gerarchia, ancoraggi, materiali, UV, monitor e geometria vano ascensore.
I controlli geometrici non certificano l'integrazione o l'usabilita nell'app.
"""
from pathlib import Path
from collections import deque
import json, math
import bpy
from mathutils import Vector

kit=Path(__file__).resolve().parent.parent
delivery=kit/'delivery'
manifest=json.loads((delivery/'conference_room.manifest.json').read_text(encoding='utf8'))
source=json.loads((delivery/'scene_check.json').read_text(encoding='utf8'))
scene=bpy.data.scenes.new('AOP_GLB_Reimport_Check')
bpy.context.window.scene=scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.ops.import_scene.gltf(filepath=str(delivery/'conference_room.glb'))
bpy.context.view_layer.update()
objects={o.name:o for o in scene.objects}
checks=[]
def check(name,ok,details=None):checks.append({'check':name,'passed':bool(ok),'details':details})
root=objects['aop_conference_room'];asset=[root,*root.children_recursive]
check('only_asset_root',set(scene.objects)==set(asset))
check('root_identity',all(abs(root.matrix_world[r][c]-(1 if r==c else 0))<1e-6 for r in range(4) for c in range(4)))
check('groups',[objects[x].parent.name for x in ('architecture','furniture','anchors')]==[root.name]*3)
dg=bpy.context.evaluated_depsgraph_get();bounds={};triangles=[]
for ob in asset:
    if ob.type!='MESH':continue
    ev=ob.evaluated_get(dg);me=ev.to_mesh()
    pts=[ev.matrix_world@v.co for v in me.vertices]
    bounds[ob.name]={'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)]}
    me.calc_loop_triangles()
    triangles.extend((ob.name,[pts[i].copy() for i in tri.vertices]) for tri in me.loop_triangles)
    ev.to_mesh_clear()
errors=[]
for name,b in source['mesh_bounds_blender_m'].items():
    if name not in bounds:errors.append(name+' missing');continue
    delta=max(abs(b[key][i]-bounds[name][key][i]) for key in ('min','max') for i in range(3))
    if delta>.001:errors.append({'mesh':name,'delta_m':delta})
check('source_vs_reimport_bounds',not errors,errors)
for row in manifest['seats']:
    for key,name in [('position_blender_m',row['anchor']),('stand_blender_m',row['stand'])]:
        delta=(objects[name].matrix_world.translation-Vector(row[key])).length
        check('anchor:'+name,delta<.001,{'delta_m':delta})
normal_checks=[]
for i in range(1,14):
    tag=f'{i:03}';screen=objects['pc_screen_'+tag];a=objects['seat_'+tag]
    toward=a.matrix_world.translation-screen.matrix_world.translation;toward.z=0;toward.normalize()
    normal=screen.matrix_world.to_3x3()@screen.data.polygons[0].normal;normal.z=0;normal.normalize()
    normal_checks.append(round(normal.dot(toward),6))
check('13_monitors_face_seats',len(normal_checks)==13 and min(normal_checks)>.999,normal_checks)
white=objects['whiteboard_surface'];uv=white.data.uv_layers.active
uv_points={}
for loop in white.data.loops:
    coord=tuple(round(v,5) for v in uv.data[loop.index].uv)
    uv_points[coord]=white.matrix_world@white.data.vertices[loop.vertex_index].co
du=(uv_points[(1,0)]-uv_points[(0,0)]).normalized();dv=(uv_points[(0,1)]-uv_points[(0,0)]).normalized()
normal=(white.matrix_world.to_3x3()@white.data.polygons[0].normal).normalized()
check('whiteboard_uv_not_mirrored',du.x>.999 and dv.z>.999 and normal.y<-.999,
      {'U_world':list(du),'V_world':list(dv),'normal':list(normal)})
actual_mats={m.name for o in asset if o.type=='MESH' for m in o.data.materials}
check('material_names',actual_mats=={m['name'] for m in manifest['materials']})
# Clip triangoli contro l'interno del prisma ascensore; contatti sul bordo esclusi.
lo=(7.2001,10.6001,.0001);hi=(9.7999,12.9999,20)
def clip(poly,axis,threshold,lower):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        va=a[axis]-threshold;vb=b[axis]-threshold
        ina=va>=0 if lower else va<=0;inb=vb>=0 if lower else vb<=0
        if ina:out.append(a)
        if ina!=inb:out.append(a+(b-a)*(va/(va-vb)))
    return out
intrusions=set()
for name,pts in triangles:
    if any(max(p[k] for p in pts)<lo[k] or min(p[k] for p in pts)>hi[k] for k in range(3)):continue
    poly=pts
    for axis in range(3):
        if poly:poly=clip(poly,axis,lo[axis],True)
        if poly:poly=clip(poly,axis,hi[axis],False)
    if len(poly)>=3:intrusions.add(name)
check('elevator_actual_mesh_triangles_clear',not intrusions,sorted(intrusions))
# Verifica di percorsi su griglia per l'avatar cilindrico di riferimento.
radius=.32;step=.25;boxlist=[]
for box in manifest['colliders']:
    a,b=box['min_blender_m'],box['max_blender_m']
    if box['role'] in ('floor','ceiling','door_closed') or a[2]>=1.7 or b[2]<=.02:continue
    boxlist.append((a[0]-radius,a[1]-radius,b[0]+radius,b[1]+radius))
def coords(cell):return (-17.5+cell[0]*step,-12.5+cell[1]*step)
def cell(x,y):return (round((x+17.5)/step),round((y+12.5)/step))
def free(c):
    x,y=coords(c)
    return 0<=c[0]<=140 and 0<=c[1]<=100 and not any(a<=x<=c0 and b<=y<=d for a,b,c0,d in boxlist) and not (7.2-radius<x<9.8+radius and y>10.6)
start=cell(8.5,10.1);visited={start};queue=deque([start])
while queue:
    c=queue.popleft()
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
        n=(c[0]+dx,c[1]+dy)
        if n not in visited and free(n):visited.add(n);queue.append(n)
routes=[{'seat':s['anchor'],'reachable':cell(*s['stand_blender_m'][:2]) in visited} for s in manifest['seats']]
check('routes_to_all_stands_box_grid',all(s['reachable'] for s in routes),{'grid_m':step,'radius_m':radius,'door_state':'open; collider door_closed escluso esplicitamente','results':routes})
report={'automatic_pass':all(c['passed'] for c in checks),'blender_version':bpy.app.version_string,
        'checks':checks,'triangles_checked':len(triangles),
        'scope':'Geometria GLB reimportata, UV e percorsi su box/griglia. Review visiva e runtime separati.',
        'manual_checks_not_certified':['no_surface_z_fighting','all_seat_views','weather_runtime','visual_approval']}
(delivery/'reimport_check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(kit/'work/reimport_check.blend'))
print(json.dumps({'automatic_pass':report['automatic_pass'],'failed':[c['check'] for c in checks if not c['passed']]}))
if not report['automatic_pass']:raise RuntimeError('Reimport audit failed')
