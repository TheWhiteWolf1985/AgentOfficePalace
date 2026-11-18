"""Reproducible generation and assembly of the approved Concept 01 avatars."""
from pathlib import Path
import sys,json,struct,hashlib,runpy,math
import bpy
from mathutils import Matrix,Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE/'resources'))
from support import Parts,material,empty_scene,CONTRACT,pose
from concept_style import PALETTE,long_hair
from glb_common import parse
from inspect_character import inspect
STYLES=['short','long','bun','spiky','curly','ponytail','bald']
CONFIG=json.loads((HERE/'package_config.json').read_text(encoding='utf8'))
ROLES={r:'char_mat_'+r for r in ['skin','hair','eyebrows','iris','clothing','shirt','tie','pants','shoes','accent']}
ROLES.update(facial_dark='char_mat_dark',eye_and_teeth_white='char_mat_white')
if CONFIG['asset']=='female_base':ROLES['bow']='char_mat_bow'
def write(path,obj):Path(path).write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save_glb(path,g,binary):
    raw=json.dumps(g,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);binary+=b'\0'*((-len(binary))%4)
    body=struct.pack('<II',len(raw),0x4e4f534a)+raw
    if binary:body+=struct.pack('<II',len(binary),0x004e4942)+binary
    Path(path).write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)
def export_root(path,root):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root,*root.children_recursive]:o.hide_set(False);o.hide_render=False;o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
def preserve_body_normals(path,reference):
    """Restore original non-hair normals after Blender's import/export rounding.

    Coordinates, indices, material assignments and visible geometry are not
    edited. This prevents tiny normal recalculations on two eyebrow triangles.
    """
    from geometry_reader import Asset
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

def export_avatar(path,style,reference_body=None):
    path=Path(path);old=sys.argv[:]
    try:
        sys.argv=['export_character.py','--','--profile','human','--out',str(path)]
        runpy.run_path(str(HERE/'resources/export_character.py'),run_name='__main__')
    finally:sys.argv=old
    if reference_body:preserve_body_normals(path,reference_body)
    g,b=parse(path.read_bytes())
    if style=='bald' and not any(m['name']=='char_mat_hair' for m in g.get('materials',[])):
        g.setdefault('materials',[]).append({'name':'char_mat_hair','pbrMetallicRoughness':{
            'baseColorFactor':[*PALETTE['hair'],1],'metallicFactor':0,'roughnessFactor':.8}});save_glb(path,g,b)
    manifest=json.loads((HERE/'resources/human.manifest.json').read_text(encoding='utf8'))
    manifest.update(asset_id=CONFIG['asset']+'_concept01_v01',file=path.name,sha256=sha(path),blender_version=bpy.app.version_string,
        license='Original design for Juri; scaffold/tools MIT, copyright 2026 AgentSystemLabs',
        material_roles=ROLES,body_mesh_nodes=[n['name'] for n in g['nodes'] if 'mesh' in n],
        mesh_parents={o.name:o.parent.name for o in bpy.data.objects['char_root'].children_recursive if o.type=='MESH'},
        design_revision='human_concept01_v01',status='ARTISTIC_APPROVED',
        checks={'artistic_approval':'PASS','approval_source':'Juri: Perfetti, 17 novembre 2026','application_QA':'NOT_RUN'},
        customization={'clothing':'jacket, lapels, pockets and button only','pants':'trousers including upper torso-connected part; on female skirt',
            'shoes':'independent from pupils and mouth','eyebrows':'under char_head outside char_hair',
            'accent':'temple marks, independent color','bow':'female permanent head accessory with independent color'},
        hairstyle={'active_style':style,'compatible_styles':STYLES,'attach_to':'char_hair','local_translation':[0,0,0],
            'local_rotation':[0,0,0,1],'local_scale':[1,1,1],
            'replace':'Remove existing hair meshes; attach exactly one component at identity. Bald removes hair geometry only.'},
        deviations=[{'field':'materials/primitives','original_limit':[8,24],'previous_reference_limit':[11,25],
            'reason':'Independent color channels, including temple accent and female fixed bow','technical_budget_approval':'NOT_RUN'}],
        provenance=[{'file':'resources/starter_human.glb','license':'MIT','role':'contract scaffold'},
            {'file':'character_design.py','role':'original geometry; common details in concept_style.py; procedural hair in delivery_runtime.py'}])
    write(path.with_suffix('.manifest.json'),manifest)
    report=inspect(path.read_bytes(),CONTRACT,'human',manifest)
    write(path.with_suffix('.original_check.json'),report)
    return report
def component(style):
    empty_scene();root=bpy.data.objects.new('char_hair',None);bpy.context.collection.objects.link(root)
    root.location.z=1.32;bpy.context.view_layer.update()
    if style!='bald':
        p=Parts({'hair':material('char_mat_hair',PALETTE['hair'])})
        long_hair(p)
        if style!='long':
            # long_hair is six cap/fringe boxes plus rear extensions; retain
            # precisely the first ten boxes (80 vertices, 60 quads) as short.
            v,f,r=p.groups['char_hair'];p.groups['char_hair']=(v[:80],f[:60],r[:60])
            box=lambda c,s:p.box('char_hair','hair',c,s)
            if style=='bun':
                box((0,.367,1.72),(.22,.18,.22));box((0,.367,1.72),(.30,.15,.14))
            elif style=='spiky':
                v,f,r=p.groups['char_hair']
                for x in [-.19,0,.19]:
                    for y in [-.17,.13]:
                        i=len(v);rad=.075;z=1.73
                        v.extend([(x-rad,y-rad,z),(x+rad,y-rad,z),(x+rad,y+rad,z),(x-rad,y+rad,z),(x+.015,y+.012,1.84)])
                        f.extend([tuple(i+j for j in q) for q in [(0,3,2,1),(0,1,4),(1,2,4),(2,3,4),(3,0,4)]]);r.extend(['hair']*5)
            elif style=='curly':
                for x in [-.29,.29]:
                    for y in [-.23,0,.23]:
                        for z in [1.56,1.68]:box((x,y,z),(.095,.11,.10))
                for x in [-.19,0,.19]:
                    for y in [-.20,0,.20]:box((x,y,1.77),(.13,.13,.09))
                for x in [-.19,0,.19]:box((x,-.292,1.59),(.105,.105,.12))
            elif style=='ponytail':
                box((0,.354,1.625),(.20,.14,.25));box((0,.393,1.30),(.14,.11,.33));box((0,.39,1.105),(.12,.10,.09))
        p.finish()
    root.location=(0,0,0);root.name='hair_component_root'
    root['style_id']=style;root['attach_to']='char_hair';root['attachment_local_trs']='translation=0 rotation=identity scale=1'
    bpy.context.view_layer.update();return root
def attach(style,folder=None):
    anchor=bpy.data.objects['char_hair']
    for o in list(anchor.children_recursive):bpy.data.objects.remove(o,do_unlink=True)
    if style=='bald':return
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str((folder or HERE/'hair')/('hair_'+style+'.glb')))
    imported=set(bpy.data.objects)-before;mesh=next(o for o in imported if o.type=='MESH')
    mat=bpy.data.materials.get('char_mat_hair')
    if mat is None:mat=mesh.data.materials[0];mat.name='char_mat_hair'
    mesh.data.materials.clear();mesh.data.materials.append(mat)
    mesh.parent=anchor;mesh.matrix_parent_inverse=Matrix.Identity(4);mesh.matrix_basis=Matrix.Identity(4);mesh.name='char_hair_visual'
    for o in imported:
        if o!=mesh:bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.update()
def roundtrip(path):
    empty_scene();bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    errors=[]
    for name,c in CONTRACT['profiles']['human']['nodes'].items():
        o=bpy.data.objects.get(name);t=c['translation']
        if o is None:errors.append('missing '+name);continue
        if (o.location-Vector((t[0],-t[2],t[1]))).length>.00001:errors.append('translation '+name)
        if (o.parent.name if o.parent else None)!=c['parent']:errors.append('parent '+name)
        if max(abs(s-1) for s in o.scale)>.00001 or o.matrix_local.to_quaternion().angle>.00001:errors.append('TRS '+name)
    if bpy.data.objects['char_eyebrows_visual'].parent.name!='char_head':errors.append('eyebrows parent')
    if CONFIG['asset']=='female_base' and bpy.data.objects['char_bow_visual'].parent.name!='char_head':errors.append('bow parent')
    mats=[m for m in bpy.data.materials if m.name.startswith('char_mat_')]
    def node(m):return next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    colors={m.name:tuple(node(m).inputs['Base Color'].default_value) for m in mats}
    for m in mats:
        node(m).inputs['Base Color'].default_value=(.82,.01,.52,1)
        if any(tuple(node(n).inputs['Base Color'].default_value)!=colors[n.name] for n in mats if n!=m):errors.append('coupled color '+m.name)
        node(m).inputs['Base Color'].default_value=colors[m.name]
    for name in ['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']:
        pose(name)
        if not all(math.isfinite(v) for o in bpy.data.objects for row in o.matrix_world for v in row):errors.append('pose '+name)
    pose('rest')
    meshes=[o for o in bpy.data.objects['char_root'].children_recursive if o.type=='MESH']
    hidden={o for n in ['char_head','char_arm_negx','char_arm_posx'] for o in bpy.data.objects[n].children_recursive}
    if {o.name for o in meshes if o not in hidden}!={'char_torso_visual','char_leg_negx_visual','char_leg_posx_visual'}:errors.append('first person')
    bpy.context.scene.name=CONFIG['asset']+'_Concept01_Roundtrip'
    bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.reimport.blend')))
    return {'status':'FAIL' if errors else 'PASS','errors':errors,'source_sha256':sha(path),
        'scope':'rig/rest TRS, independent material edits, branch separation, eight finite poses; not full collision QA'}
def build(out):
    from character_design import build_character
    out=Path(out).resolve();out.mkdir(parents=True,exist_ok=True);(out/'hair').mkdir(exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    catalog=[]
    for style in STYLES:
        root=component(style);path=out/'hair'/('hair_'+style+'.glb');export_root(path,root)
        bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.blend')))
        catalog.append({'style_id':style,'file':path.name,'sha256':sha(path),'geometry':style!='bald',
            'compatible_bases':['human_base_concept01_v01','female_base_concept01_v01'],
            'attach_to':'char_hair','translation':[0,0,0],'rotation':[0,0,0,1],'scale':[1,1,1]})
    write(out/'hair/CATALOG.json',{'styles':catalog,'one_active_only':True,'default':CONFIG['default_hair'],'bald':'remove hair geometry; keep head, eyebrows and female fixed bow'})
    build_character();root=bpy.data.objects['char_root'];root['concept_id']='01_professionale_aumentato';root['status']='ARTISTIC_APPROVED'
    bpy.context.scene.name=CONFIG['asset']+'_Concept01_Source'
    path=out/(CONFIG['asset']+'.glb');bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.blend')))
    static=export_avatar(path,CONFIG['default_hair']);rt=roundtrip(path)
    write(out/'BUILD_REPORT.json',{'asset':CONFIG['asset'],'roundtrip':rt,'original_validator':static,
        'artistic_approval':'PASS','technical_budget_approval':'NOT_RUN','application_QA':'NOT_RUN'})
    if rt['status']!='PASS':raise RuntimeError(rt)

if __name__=='__main__':raise SystemExit('Use build_scene.py or assemble.py')
