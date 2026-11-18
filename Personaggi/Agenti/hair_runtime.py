from pathlib import Path
import sys,json,struct,hashlib,bpy
from mathutils import Matrix
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE/'resources'))
from support import Parts,material,empty_scene
from concept_style import PALETTE,long_hair
from glb_common import parse
STYLES=['short','long','bun','spiky','curly','ponytail','bald']
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
