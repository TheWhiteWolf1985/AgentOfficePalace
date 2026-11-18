"""Portable exports and manifests. Original contract/validator are never changed."""
from pathlib import Path
import bpy,sys,json,hashlib,struct,copy,runpy
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'resources'))
from support import CONTRACT,RES,write_json
from glb_common import parse
from inspect_character import inspect
from contract_config import ROLES

def preserve_body_normals(path,reference):
    """Restore original non-hair normals after Blender's import/export rounding.

    Coordinates, indices, material assignments and visible geometry are not
    edited. This prevents tiny normal recalculations on two eyebrow triangles.
    """
    from glb_reader import Asset
    from collections import defaultdict
    src=Asset(reference);dst=Asset(path);lookup=defaultdict(list)
    for node in src.g['nodes']:
        if 'mesh' not in node or src.ancestor(node['name'],'char_hair'):continue
        for primitive in src.g['meshes'][node['mesh']]['primitives']:
            positions=src.values(primitive['attributes']['POSITION']);normals=src.values(primitive['attributes']['NORMAL'])
            mat=src.g['materials'][primitive['material']]['name']
            for p,n in zip(positions,normals):lookup[(node['name'],mat,tuple(round(x,6) for x in p))].append(n)
    binary=bytearray(dst.binary);changed=0
    for node in dst.g['nodes']:
        if 'mesh' not in node or dst.ancestor(node['name'],'char_hair'):continue
        for primitive in dst.g['meshes'][node['mesh']]['primitives']:
            positions=dst.values(primitive['attributes']['POSITION']);normals=dst.values(primitive['attributes']['NORMAL'])
            mat=dst.g['materials'][primitive['material']]['name']
            accessor=dst.g['accessors'][primitive['attributes']['NORMAL']];view=dst.g['bufferViews'][accessor['bufferView']]
            start=view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',12)
            for i,(p,n) in enumerate(zip(positions,normals)):
                candidates=lookup[(node['name'],mat,tuple(round(x,6) for x in p))]
                if not candidates:raise RuntimeError('Non-hair position changed during assembly')
                chosen=min(candidates,key=lambda q:sum((a-b)**2 for a,b in zip(q,n)))
                if sum((a-b)**2 for a,b in zip(chosen,n))>1e-6:raise RuntimeError('Unexpected non-hair normal change')
                if tuple(chosen)!=tuple(n):changed+=1
                struct.pack_into('<fff',binary,start+i*stride,*chosen)
    raw=json.dumps(dst.g,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
    binary+=b'\0'*((-len(binary))%4)
    body=struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
    Path(path).write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)
    return changed

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def ensure_inactive_hair_material(path):
    # Bald retains the hair color channel as an unused PBR material, with zero
    # hair geometry. No invisible dummy mesh or primitive is introduced.
    path=Path(path);g,binary=parse(path.read_bytes())
    if any(m.get('name')=='char_mat_hair' for m in g.get('materials',[])):return
    g.setdefault('materials',[]).append({'name':'char_mat_hair','pbrMetallicRoughness':{
        'baseColorFactor':[.30,.19,.082,1],'metallicFactor':0,'roughnessFactor':.8}})
    raw=json.dumps(g,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
    body=struct.pack('<II',len(raw),0x4e4f534a)+raw
    if binary:
        binary+=b'\0'*((-len(binary))%4);body+=struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)

def export_root(path,root):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root,*root.children_recursive]:o.hide_set(False);o.hide_render=False;o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
                             export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)

def export_avatar(path,asset,style,reference_body=None):
    path=Path(path).resolve();path.parent.mkdir(parents=True,exist_ok=True)
    previous=sys.argv[:]
    try:
        sys.argv=['export_character.py','--','--profile','human','--out',str(path)]
        runpy.run_path(str(RES/'export_character.py'),run_name='__main__')
    finally:
        sys.argv=previous
    if style=='bald':ensure_inactive_hair_material(path)
    restored_normals=preserve_body_normals(path,reference_body) if reference_body else 0
    g,_=parse(path.read_bytes())
    manifest=json.loads((RES/'human.manifest.json').read_text(encoding='utf8'))
    manifest.update(asset_id=asset,file=path.name,sha256=sha(path),blender_version=bpy.app.version_string,
                    material_roles=ROLES,license='Original designs for Juri; MIT scaffold/tools, copyright 2026 AgentSystemLabs',
                    body_mesh_nodes=[n['name'] for n in g['nodes'] if 'mesh' in n])
    manifest['hairstyle']={'active_style':style,'attach_control':'char_hair','component_local_translation':[0,0,0],
                            'component_local_rotation':[0,0,0,1],'component_local_scale':[1,1,1],
                            'replace':'Remove existing hair mesh children, attach exactly one component at identity; bald removes all hair geometry.',
                            'compatible_styles':['short','long','bun','spiky','curly','ponytail','bald']}
    manifest['modular_hair']={'strategy':'One shared component, one hairstyle active; eyebrows under char_head',
                              'head_attachment_surface':'upper head x +/-0.27, Blender y [-0.30,+0.27], top z=1.72; attachment origin z=1.32',
                              'inactive_hair_material':style=='bald'}
    manifest['deviations']=[{'field':'materials','legacy_limit':8,'requested_limit':11},
                            {'field':'primitives','legacy_limit':24,'requested_limit':25}]
    manifest['requested_budget']={'materials':11,'primitives':25,'other_limits':'unchanged original human profile'}
    manifest['runtime_application']='NOT_RUN'
    manifest['assembly_normal_preservation']={'restored_normal_vertices':restored_normals,'scope':'Non-hair normals restored exactly from the base when Blender recalculates them; positions and topology unchanged.'}
    write_json(path.with_suffix('.manifest.json'),manifest)
    report=inspect(path.read_bytes(),CONTRACT,'human',manifest)
    write_json(path.with_suffix('.original_check.json'),report)
    expected={'Budget exceeded: materials','Budget exceeded: primitives','Manifest deviations require separate review; not an in-contract PASS'}
    errors=[e for e in report['errors'] if e not in expected]
    m=report['metrics']
    if m['materials']>11:errors.append('Requested material budget exceeded')
    if m['primitives']>25:errors.append('Requested primitive budget exceeded')
    result={'status':'FAIL' if errors else 'PASS','errors':errors,'metrics':m,
             'original_validator_status':report['status'],'original_validator_errors':report['errors'],
             'scope':'Current request 11 materials/25 primitives; all other original checks preserved'}
    write_json(path.with_suffix('.check.json'),result)
    if errors:raise RuntimeError(result)
    return result

def export_component(path,style):
    path=Path(path);root=bpy.data.objects['hair_component_root'];export_root(path,root)
    if style=='bald':ensure_inactive_hair_material(path)
    g,_=parse(path.read_bytes())
    write_json(path.with_suffix('.manifest.json'),{'asset_id':'hair_'+style,'type':'modular_hair_component','style_id':style,
        'file':path.name,'sha256':sha(path),'attach_to':'char_hair','local_translation':[0,0,0],
        'local_rotation':[0,0,0,1],'local_scale':[1,1,1],'units':'meters','up':'+Y','forward':'+Z',
        'mesh_count':len(g.get('meshes',[])),'material':'char_mat_hair','empty_configuration':style=='bald',
        'compatible_bases':['human_base_v02','female_base_v01'],'baseline_head_pivot_height_m':1.32,
        'license':'Original voxel geometry for Juri; short derived without visible changes from male revision02',
        'validation_scope':'Component only; the full human rig validator does not apply to a hair component'})
