"""Controlli automatici parziali della scena Blender; le review manuali restano obbligatorie."""
from pathlib import Path
import argparse,json,math,re,sys
import bpy
from mathutils import Vector

def args_after_separator():
    return sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

def validate(contract, manifest):
    errors=[]; warnings=[]; checks=[]
    tol=contract['tolerance_m']
    def check(label, ok, message):
        checks.append({'check':label,'passed':bool(ok)})
        if not ok: errors.append(message)
    root=bpy.data.objects.get(contract['root_node'])
    check('root',root is not None,'Root aop_conference_room mancante')
    if root is None:return {'automatic_pass':False,'errors':errors,'warnings':warnings,'checks':checks,'manual_review_required':True}
    check('metric_units',bpy.context.scene.unit_settings.system=='METRIC' and abs(bpy.context.scene.unit_settings.scale_length-1)<1e-6,'Unita scena non metriche a scala1')
    loc,rot,scale=root.matrix_world.decompose()
    check('root_identity',loc.length<1e-6 and abs(rot.angle)<1e-6 and all(abs(v-1)<1e-6 for v in scale),'Trasformazione globale root diversa da identita')
    objs=[root,*root.children_recursive]; byname={ob.name:ob for ob in objs}
    for name in contract['asset_groups']:
        ob=byname.get(name)
        check('group_'+name,ob is not None and ob.type=='EMPTY' and ob.parent==root,'Gruppo Empty '+name+' mancante o non figlio diretto del root')
    def under(ob,ancestor):
        while ob:
            if ob.name==ancestor:return True
            ob=ob.parent
        return False
    dg=bpy.context.evaluated_depsgraph_get(); bounds={}; triangles=0
    for ob in objs:
        check('node_type:'+ob.name,ob.type in {'EMPTY','MESH'},'Tipo non esportabile nel profilo del kit: '+ob.name)
        check('no_guides:'+ob.name,not any(ob.name.lower().startswith(p) for p in contract['forbidden_export_prefixes']),'Guide/collider sotto il root: '+ob.name)
        if ob.type!='MESH':continue
        check('applied_scale:'+ob.name,all(abs(v-1)<1e-6 for v in ob.scale),'Applicare scala mesh: '+ob.name)
        ev=ob.evaluated_get(dg); me=ev.to_mesh()
        try:
            pts=[ev.matrix_world@v.co for v in me.vertices]
            check('mesh_nonempty:'+ob.name,bool(pts),'Mesh vuota: '+ob.name)
            if not pts:continue
            lo=[min(v[i] for v in pts) for i in range(3)];hi=[max(v[i] for v in pts) for i in range(3)];bounds[ob.name]={'min':lo,'max':hi}
            b=contract['design_xy_m'] if under(ob,'furniture') else contract['outer_xy_m']
            check('bounds:'+ob.name,lo[0]>=b['min_x']-tol and hi[0]<=b['max_x']+tol and lo[1]>=b['min_y']-tol and hi[1]<=b['max_y']+tol and lo[2]>=contract['minimum_mesh_z_m']-tol,'Mesh fuori involucro: '+ob.name)
            me.calc_loop_triangles();triangles+=len(me.loop_triangles)
            check('materials:'+ob.name,bool(me.materials) and all(m and m.name for m in me.materials),'Materiale non identificato: '+ob.name)
        finally:ev.to_mesh_clear()
    white=byname.get('whiteboard_surface')
    check('whiteboard_mesh',white is not None and white.type=='MESH','Superficie whiteboard_surface mancante')
    if white is not None and white.type=='MESH':
        me=white.data; uv=me.uv_layers.active
        check('whiteboard_topology',len(me.vertices)==4 and len(me.polygons) in {1,2},'Lavagna: richiesti4 vertici, un quad o due triangoli')
        check('whiteboard_material',len(me.materials)==1 and me.materials[0] is not None and me.materials[0].name==contract['whiteboard_material'],'Materiale lavagna diverso da mat_whiteboard_dynamic')
        check('whiteboard_uv',uv is not None,'UV lavagna mancanti')
        if uv:
            coords={(round(v.uv.x,5),round(v.uv.y,5)) for v in uv.data}
            check('whiteboard_uv_corners',coords=={(0,0),(1,0),(1,1),(0,1)},'UV della lavagna non coprono esattamente il rettangolo0..1')
        if len(me.vertices)==4:
            p=[white.matrix_world@v.co for v in me.vertices];normal=(p[1]-p[0]).cross(p[2]-p[0])
            check('whiteboard_planar',normal.length>1e-8 and abs(normal.normalized().dot(p[3]-p[0]))<tol,'Lavagna degenere o non piana')
    seats=[ob for ob in objs if re.fullmatch(contract['seat_regex'],ob.name)]
    check('real_seats',bool(seats),'Nessun posto del design reale; lo scaffold non e una sala finita')
    for ob in seats:
        stand=byname.get('stand_'+ob.name.split('_',1)[1])
        check('seat_anchor:'+ob.name,ob.type=='EMPTY' and under(ob,'anchors'),'Posto non rappresentato da Empty in anchors: '+ob.name)
        check('stand_pair:'+ob.name,stand is not None and stand.type=='EMPTY' and under(stand,'anchors'),'Uscita stand abbinata mancante: '+ob.name)
        if stand:check('stand_floor:'+ob.name,abs(stand.matrix_world.translation.z)<tol,'Uscita non a pavimento: '+stand.name)
        pos=ob.matrix_world.translation;b=contract['design_xy_m']
        check('seat_bounds:'+ob.name,b['min_x']<=pos.x<=b['max_x'] and b['min_y']<=pos.y<=b['max_y'] and pos.z>=-tol,'Posto fuori perimetro/quota: '+ob.name)
    if not manifest:
        errors.append('Manifest obbligatorio mancante; compilare il template sul modello reale')
    else:
        check('manifest_contract',manifest.get('source_contract')==contract['contract_version'],'Versione contratto nel manifest non coerente')
        h=manifest.get('ceiling_height_m')
        check('ceiling_height',isinstance(h,(float,int)) and math.isfinite(h) and h>contract['avatar']['collision_height_m'],'Altezza interna non definita o insufficiente')
        arch=manifest.get('architecture',{})
        for role in ['floor_nodes','wall_nodes','ceiling_nodes']:
            ns=arch.get(role,[]);check(role,bool(ns) and all(n in byname and byname[n].type=='MESH' and under(byname[n],'architecture') for n in ns),'Nodi architettura mancanti/non corretti: '+role)
        for n in arch.get('floor_nodes',[]):
            if n in bounds:check('floor_z:'+n,abs(bounds[n]['max'][2])<=tol,'Pavimento finito non a quota0: '+n)
        declared={s.get('anchor') for s in manifest.get('seats',[])}
        check('manifest_seats',declared=={s.name for s in seats},'Elenco posti manifest diverso dagli Empty reali')
        for s in manifest.get('seats',[]):
            check('manifest_stand:'+str(s.get('anchor')),s.get('stand') in byname,'Stand manifest mancante')
        check('manifest_colliders',bool(manifest.get('colliders')),'Collider numerici non dichiarati nel manifest')
    warnings.append('Non controllati automaticamente: intersezioni reali con ascensore, percorsi, UV specchiate, z-fighting, chiusura/camera/meteo e design. Fare le review obbligatorie.')
    return {'automatic_pass':not errors,'scope':'Controlli automatici parziali della scena; non conformita finale','blender_version':bpy.app.version_string,'checks':checks,'errors':errors,'warnings':warnings,'stats':{'mesh_count':len(bounds),'triangles_evaluated':triangles,'seat_count':len(seats)},'mesh_bounds_blender_m':bounds,'manual_review_required':True}

def main():
    p=argparse.ArgumentParser();p.add_argument('--kit',type=Path,default=Path(__file__).resolve().parent.parent);p.add_argument('--manifest',type=Path);p.add_argument('--report',type=Path)
    a=p.parse_args(args_after_separator());c=json.loads((a.kit/'rules/constraints.json').read_text(encoding='utf-8'))
    path=a.manifest or a.kit/'delivery/conference_room.manifest.json'
    m=json.loads(path.read_text(encoding='utf-8')) if path.is_file() else None
    report=validate(c,m);dest=a.report or a.kit/'delivery/scene_check.json';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'automatic_pass':report['automatic_pass'],'errors':report['errors'],'report':str(dest)}))
    if not report['automatic_pass']:raise RuntimeError('Controlli automatici scena non superati; leggere il report')

if __name__=='__main__':main()
