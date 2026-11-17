"""Seven unisex voxel hairstyles in the common char_hair attachment space."""
import bpy
from mathutils import Vector
from support import Parts,material,empty_scene,RES
from contract_config import STYLES

def build_component(style):
    if style not in STYLES:raise ValueError(style)
    empty_scene()
    bpy.ops.import_scene.gltf(filepath=str(RES/'male_reference.glb'))
    source=bpy.data.objects['char_hair_visual']
    verts=[tuple(v.co+Vector((0,0,1.32))) for v in source.data.vertices]
    faces=[tuple(p.vertices) for p in source.data.polygons]
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
    root=bpy.data.objects.new('char_hair',None);bpy.context.collection.objects.link(root)
    root.location=(0,0,1.32);bpy.context.view_layer.update()
    mat=material('char_mat_hair',(.30,.19,.082));mat.use_fake_user=True
    if style!='bald':
        parts=Parts({'hair':mat})
        parts.groups['char_hair']=(verts,faces,['hair']*len(faces))
        box=lambda c,s:parts.box('char_hair','hair',c,s)
        if style=='long':
            box((0,.315,1.50),(.46,.070,.12))
            box((0,.35,1.35),(.46,.050,.30))
            box((0,.35,1.145),(.36,.050,.13))
            for x in [-.255,.255]:box((x,.04,1.385),(.040,.20,.27))
            # Longer tapered back length, kept clear of the collar/raised arms.
            box((0,.40,1.005),(.30,.060,.17))
        elif style=='bun':
            box((0,.367,1.72),(.22,.18,.22))
            box((0,.367,1.72),(.30,.15,.14))
        elif style=='spiky':
            vertices,polygons,roles=parts.groups['char_hair']
            for x in [-.19,0,.19]:
                for y in [-.17,.13]:
                    start=len(vertices);r=.075;z=1.73
                    vertices.extend([(x-r,y-r,z),(x+r,y-r,z),(x+r,y+r,z),(x-r,y+r,z),(x+.015,y+.012,1.84)])
                    polygons.extend([tuple(start+j for j in f) for f in [(0,3,2,1),(0,1,4),(1,2,4),(2,3,4),(3,0,4)]])
                    roles.extend(['hair']*5)
        elif style=='curly':
            for x in [-.29,.29]:
                for y in [-.23,0,.23]:
                    for z in [1.56,1.68]:box((x,y,z),(.095,.11,.10))
            for x in [-.19,0,.19]:
                for y in [-.20,0,.20]:box((x,y,1.77),(.13,.13,.09))
            for x in [-.19,0,.19]:box((x,-.292,1.59),(.105,.105,.12))
        elif style=='ponytail':
            box((0,.354,1.625),(.20,.14,.25))
            box((0,.393,1.30),(.14,.11,.33))
            box((0,.39,1.105),(.12,.10,.09))
        parts.finish()
    root.location=(0,0,0);root.name='hair_component_root'
    root['style_id']=style;root['attach_to']='char_hair'
    root['attachment_local_trs']='position=0 rotation=identity scale=1'
    bpy.context.view_layer.update()
    return root
