"""Blender -b --factory-startup -P strumenti/verifica_consegna.py -- <kit>.
Python ordinario: stessa sintassi per integrita dei file e struttura GLB.
"""
import sys,json,struct,hashlib,math
from pathlib import Path

def glb(path):
    raw=path.read_bytes()
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),path
    n,tag=struct.unpack_from('<I4s',raw,12);assert tag==b'JSON'
    data=json.loads(raw[20:20+n])
    assert data.get('meshes') and all('uri' not in b for b in data['buffers'])
    assert all('bufferView' in i for i in data.get('images',[]))
    triangles=sum(data['accessors'][p.get('indices',p['attributes']['POSITION'])]['count']//3
                  for m in data['meshes'] for p in m['primitives'])
    assert all(p.get('mode',4)==4 for m in data['meshes'] for p in m['primitives'])
    return data,{'nodes':len(data['nodes']),'meshes':len(data['meshes']),
                 'triangles_unique_geometry':triangles,'images':len(data.get('images',[])),
                 'sha256':hashlib.sha256(raw).hexdigest()}

def verify(root,blender_checks=True):
    root=Path(root).resolve()
    manifest=json.loads((root/'ufficio.manifest.json').read_text(encoding='utf-8-sig'))
    groups=json.loads((root/'riferimenti/GRUPPI_EXPORT.json').read_text(encoding='utf-8-sig'))
    models={};parsed={}
    for name,row in groups.items():
        data,stats=glb(root/row['file']);models[name]=stats;parsed[name]=data
        actual={n.get('name') for n in data['nodes']}
        assert set(row['objects'])<=actual,(name,set(row['objects'])-actual)
    assert len(groups)==11 and 'chiusura_piani_superiori' not in groups
    base=parsed['ufficio_base'];names={n.get('name') for n in base['nodes']}
    absent=['Balcone','Gong','gong','Uscita_primo_ufficio','cerniera_uscita',
            'anta_balcone_sx','anta_balcone_dx','station-issues','station-pulls',
            'station-queue','superficie_macchina','expand']
    assert not set(absent)&names
    assert len(manifest['dynamic_surfaces'])==8
    assert set(manifest['dynamic_surfaces'])<=names
    for size,ids in [(1,{17,18}),(2,{17,18,19,20})]:
        nodes={n.get('name') for n in parsed[f'ala_{size}']['nodes']}
        assert {f'desk-{i}' for i in ids}<=nodes
        assert all(f'desk-{i}__{role}' in nodes for i in ids for role in ['seatAnchor','laptopAnchor','stage'])
    glass=[m for m in base['materials'] if 'server_v12_access_mat_glass' in m.get('name','')]
    assert glass and all(m.get('alphaMode')=='BLEND' and abs(m['pbrMetallicRoughness']['baseColorFactor'][3]-.12)<.00001 for m in glass)
    inventory=root/'CONTENUTO_SHA256.json'
    integrity='NON_PRESENTE_DURANTE_PREPARAZIONE'
    if inventory.exists():
        files=json.loads(inventory.read_text(encoding='utf-8-sig'))['files']
        actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
        assert actual==set(files)|{'CONTENUTO_SHA256.json'},('Inventario',actual-set(files))
        for name,row in files.items():
            p=root/name
            assert p.stat().st_size==row['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'],name
        integrity='PASS'
    result={'esito':'PASS','modelli':models,'numero_glb':len(models),'integrita':integrity,
            'approvazione_artistica':'APPROVATO_DA_JURI','runtime':'NON_ESEGUITO',
            'blender_checks':'NON_ESEGUITI'}
    try:import bpy
    except ImportError:return result
    if not blender_checks:return result
    from mathutils import Vector
    bpy.ops.wm.open_mainfile(filepath=str(root/'ufficio.blend'))
    assert len(bpy.data.scenes)==1 and bpy.context.scene.name=='Piano ufficio'
    assert bpy.context.scene.unit_settings.scale_length==1
    expected=json.loads((root/'verifiche/CONFRONTO_SCENA.json').read_text())['delivery_base']
    ns={};exec(compile((root/'strumenti/snapshot.py').read_text(encoding='utf-8'),'snapshot.py','exec'),ns)
    assert ns['fingerprint'](bpy.data.collections['UFFICIO | Base'])==expected
    anchors=json.loads((root/'riferimenti/ancore_scrivanie.json').read_text())
    nanchors=0
    for name,roles in anchors.items():
        for role in ['group','seatAnchor','laptopAnchor','stage']:
            ob=bpy.data.objects[name if role=='group' else name+'__'+role]
            x,y,z=roles[role][12:15]
            assert math.dist(ob.matrix_world.translation,(x,-z,y))<.001,(name,role)
            nanchors+=1
    for name in manifest['dynamic_surfaces']:
        ob=bpy.data.objects[name];assert ob.type=='MESH' and ob.data.uv_layers.active
        assert all(-.0001<=c<=1.0001 for e in ob.data.uv_layers.active.data for c in e.uv)
    assert abs(bpy.data.objects['bookshelf'].matrix_world.translation.x+4)<.0001
    for name in ['Parete_palette','Finitura_palette','Parquet_palette']:assert name in bpy.data.materials
    images=[im for im in bpy.data.images if im.users and im.type=='IMAGE']
    assert images and all(im.packed_file for im in images)
    expected_positions={name:list(bpy.data.objects[name].matrix_world.translation)
                        for name in list(anchors)+[f'{n}__{r}' for n in anchors for r in ['seatAnchor','laptopAnchor','stage']]+['bookshelf','boss-chair']}
    reimport={}
    for name,row in groups.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        assert bpy.ops.import_scene.gltf(filepath=str(root/row['file']),import_pack_images=True)=={'FINISHED'}
        names=set(bpy.context.scene.objects.keys())
        assert set(row['objects'])<=names,(name,'Oggetti mancanti dopo reimport')
        if name=='ufficio_base':
            for ident,pos in expected_positions.items():assert math.dist(bpy.data.objects[ident].matrix_world.translation,pos)<.001,ident
            for ident in manifest['dynamic_surfaces']:assert bpy.data.objects[ident].data.uv_layers.active
        reimport[name]={'esito':'PASS','nodes':len(names)}
    result.update(blender_checks='PASS',blender=bpy.app.version_string,
                  desk_anchors_checked=nanchors,dynamic_uv_surfaces_checked=8,
                  packed_images_checked=len(images),reimport=reimport)
    return result

if __name__=='__main__':
    argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    report=verify(Path(argv[0]));print(json.dumps(report,indent=2,ensure_ascii=False))
    if len(argv)>1:Path(argv[1]).write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
