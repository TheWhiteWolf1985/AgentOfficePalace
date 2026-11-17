"""Shared voxel geometry and GLB roundtrip helpers for the human user avatar. Run in a fresh background Blender.

blender --background --factory-startup --python build_scene.py -- --out ../../delivery
All build dependencies are distributed in resources/. No network or author paths.
Coordinates in the design below are Blender Z-up, front -Y, in metres.
"""
from pathlib import Path
import argparse, bpy, json, sys, hashlib, math, runpy, shutil
from mathutils import Vector

HERE = Path(__file__).resolve().parent
RES = HERE / 'resources'
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(RES))
from inspect_character import inspect
from glb_common import parse

CONTRACT = json.loads((RES / 'constraints.json').read_text(encoding='utf8'))

def write_json(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False)+'\n', encoding='utf8')

def empty_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1

def material(name, color, roughness=.8):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m

class Parts:
    """Collect cuboids into one mesh per independent control, without welding controls."""
    def __init__(self, mats):
        self.mats = mats
        self.groups = {}
        self.parents = {}

    def box(self, control, mat, center, size):
        verts, faces, roles = self.groups.setdefault(control, ([], [], []))
        x,y,z = center
        a,b,c = [v/2 for v in size]
        i = len(verts)
        verts.extend([(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                      (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)])
        faces.extend([tuple(i+k for k in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),
                     (1,2,6,5),(2,3,7,6),(3,0,4,7)]])
        roles.extend([mat]*6)

    def face(self, control, mat, outline, depth):
        """A flat facial detail facing -Y; outline contains world (X,Z) pairs."""
        verts, faces, roles = self.groups.setdefault(control, ([], [], []))
        i=len(verts)
        verts.extend((x,depth,z) for x,z in outline)
        # Counterclockwise in X/Z gives the outward -Y normal.
        area=sum(outline[k][0]*outline[(k+1)%len(outline)][1]-outline[(k+1)%len(outline)][0]*outline[k][1] for k in range(len(outline)))
        order=list(range(len(outline)))
        if area<0:order.reverse()
        faces.append(tuple(i+k for k in order));roles.append(mat)

    def ellipse(self, control, mat, x, z, rx, rz, depth, segments=20):
        self.face(control,mat,[(x+rx*math.cos(k*2*math.pi/segments),z+rz*math.sin(k*2*math.pi/segments)) for k in range(segments)],depth)

    def finish(self):
        result = []
        for control,(verts,faces,roles) in self.groups.items():
            parent = bpy.data.objects[self.parents.get(control,control)]
            inv = parent.matrix_world.inverted()
            mesh = bpy.data.meshes.new(control+'_voxel_geometry')
            mesh.from_pydata([inv @ Vector(v) for v in verts], [], faces)
            mesh.update()
            obj = bpy.data.objects.new(control+'_visual', mesh)
            bpy.context.collection.objects.link(obj)
            obj.parent = parent
            unique = list(dict.fromkeys(roles))
            for role in unique:
                mesh.materials.append(self.mats[role])
            for poly,role in zip(mesh.polygons,roles):
                poly.material_index = unique.index(role)
                poly.use_smooth = False
            result.append(obj)
        return result

def camera_at(name, location, target, orthographic=None, lens=50):
    data = bpy.data.cameras.new(name)
    o = bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(o)
    o.location = location
    o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    if orthographic:
        data.type = 'ORTHO'
        data.ortho_scale = orthographic
    else:
        data.lens = lens
    data.clip_start = .01
    data.clip_end = 150
    bpy.context.scene.camera = o
    return o

def stage(width=1000,height=1000, ground=True):
    s = bpy.context.scene
    # Blender 5.3 engine, with a portable fallback to Cycles.
    try:
        s.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        s.render.engine = 'CYCLES'
        s.cycles.samples = 24
        s.cycles.use_denoising = True
    s.render.resolution_x = width
    s.render.resolution_y = height
    s.render.resolution_percentage = 100
    s.render.image_settings.file_format = 'PNG'
    s.world = bpy.data.worlds.new('Review_world')
    s.world.use_nodes = True
    bg = next(n for n in s.world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value = (.57,.65,.74,1)
    bg.inputs['Strength'].default_value = .55
    s.view_settings.view_transform = 'AgX'
    for name,pos,power,size in [('Review_key',(2,-4,6),450,5),('Review_fill',(-3,-1,3),220,4),('Review_rim',(1,3,4),350,3)]:
        light = bpy.data.lights.new(name,'AREA')
        light.energy = power
        light.shape = 'DISK'
        light.size = size
        obj = bpy.data.objects.new(name,light)
        bpy.context.collection.objects.link(obj)
        obj.location = pos
        obj.rotation_euler = (Vector((0,0,.9))-obj.location).to_track_quat('-Z','Y').to_euler()
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.002))
        bpy.context.object.name = 'Review_ground'
        bpy.context.object.data.materials.append(material('Review_ground_mat',(.18,.23,.28)))

def render(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)

def export(out, asset):
    old = sys.argv[:]
    try:
        sys.argv = ['export_character.py','--','--profile','human','--out',str(out/(asset+'.glb'))]
        runpy.run_path(str(RES/'export_character.py'),run_name='__main__')
    finally:
        sys.argv = old
    glb = out/(asset+'.glb')
    manifest = json.loads((RES/'human.manifest.json').read_text(encoding='utf8'))
    g,_ = parse(glb.read_bytes())
    manifest.update(asset_id=asset,file=glb.name,sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),
                    blender_version=bpy.app.version_string,license='Original generated geometry for Juri; scaffold MIT, copyright 2026 AgentSystemLabs')
    manifest['body_mesh_nodes'] = [n['name'] for n in g['nodes'] if 'mesh' in n]
    manifest['design_revision'] = 'human_base_voxel_v02_materials'
    manifest['appearance'] = 'User avatar: short light-brown hair, black suit and trousers, white shirt, red tie, flat black shoes, humanized blue eyes and smile; unit scale'
    manifest['provenance'] = [{'kind':'scaffold','file':'resources/starter_human.glb','license':'MIT'},
                              {'kind':'original_design','file':'build_scene.py','note':'Original cuboid geometry, no third party skins or textures. User image used only as visual inspiration; not distributed.'}]
    manifest['checks'] = {'runtime_application':'NOT_RUN','artistic_approval':'NOT_RUN'}
    manifest['material_roles'] = {
        'skin':'char_mat_skin', 'hair':'char_mat_hair', 'eyebrows':'char_mat_eyebrows',
        'iris':'char_mat_iris', 'clothing':'char_mat_clothing', 'shirt':'char_mat_shirt',
        'tie':'char_mat_tie', 'pants':'char_mat_pants', 'shoes':'char_mat_shoes',
        'facial_dark':'char_mat_dark', 'eye_and_teeth_white':'char_mat_white'}
    manifest['material_roles_note'] = 'clothing is the jacket only; pants includes upper torso-connected trousers. Facial dark remains shared between pupils/eye rims and smile, while shoes are independent.'
    manifest['mesh_parents'] = {o.name:o.parent.name for o in bpy.data.objects if o.type=='MESH' and o.name in manifest['body_mesh_nodes']}
    manifest['modular_hair'] = {'strategy':'current short hairstyle only; char_hair is replaceable; eyebrows are under char_head',
                              'hair_control':'char_hair','eyebrows_mesh':'char_eyebrows_visual','eyebrows_parent':'char_head'}
    manifest['deviations'] = [
        {'field':'profiles.human.limits.materials','original_limit':8,'actual':11,
         'reason':'Requested nine independent color channels plus unchanged dark and white facial materials. Original contract is not edited.'},
        {'field':'profiles.human.limits.primitives','original_limit':24,'actual':25,
         'reason':'Additional torso pants material and head eyebrows primitive, preserving geometry and independently moving controls.'}]
    manifest['compliance'] = {'rig_contract':'AOP_CHAR_RIGID_1','strict_original_contract':'FAIL',
                            'budget_deviation_acceptance':'NOT_RUN','runtime_application':'NOT_RUN'}
    write_json(out/(asset+'.manifest.json'),manifest)
    result = inspect(glb.read_bytes(),CONTRACT,'human',manifest)
    write_json(out/(asset+'.check.json'),result)
    expected_errors={'Budget exceeded: primitives','Budget exceeded: materials',
                     'Manifest deviations require separate review; not an in-contract PASS'}
    if set(result['errors']) != expected_errors:
        raise RuntimeError('Unexpected strict validation results: '+str(result))
    return result

def pose(name):
    # Runtime X rotation maps to Blender X rotation (same axis).
    for n in ['char_arm_negx','char_arm_posx','char_leg_negx','char_leg_posx']:
        bpy.data.objects[n].rotation_mode = 'XYZ'
        bpy.data.objects[n].rotation_euler = (0,0,0)
    values = {
        'rest':{},
        'walk_a':{'char_arm_negx':.70,'char_arm_posx':-.70,'char_leg_negx':-.70,'char_leg_posx':.70},
        'walk_b':{'char_arm_negx':-.70,'char_arm_posx':.70,'char_leg_negx':.70,'char_leg_posx':-.70},
        'sit':{'char_leg_negx':-1.35,'char_leg_posx':-1.35,'char_arm_negx':-.55,'char_arm_posx':-.55},
        'hold':{'char_arm_negx':-1.65},
        'paper_book':{'char_arm_negx':-1.20,'char_arm_posx':-1.20},
        'ladder':{'char_arm_negx':-2.80,'char_arm_posx':-2.80,'char_leg_negx':-.70},
        'pole':{'char_arm_negx':-2.40,'char_arm_posx':-2.80,'char_leg_posx':-.70},
    }
    for n,v in values[name].items():
        bpy.data.objects[n].rotation_euler.x = v
    bpy.context.view_layer.update()

def reimport_asset(out,asset,views):
    empty_scene()
    bpy.ops.import_scene.gltf(filepath=str(out/(asset+'.glb')))
    names = {o.name:o for o in bpy.data.objects}
    # Verify Blender local-space conversion and parent relationships after GLB roundtrip.
    errors=[]
    for name,d in CONTRACT['profiles']['human']['nodes'].items():
        o=names.get(name)
        expected=Vector((d['translation'][0],-d['translation'][2],d['translation'][1]))
        if o is None:
            errors.append('missing '+name)
            continue
        if (o.location-expected).length > CONTRACT['tolerance_m']:errors.append('location '+name)
        if (o.parent.name if o.parent else None)!=d['parent']:errors.append('parent '+name)
        if max(abs(v-1) for v in o.scale)>.001:errors.append('scale '+name)
        if o.matrix_local.to_quaternion().angle > .001:errors.append('rotation '+name)
    original=set(names)
    stage()
    camera_at('Review_camera',(2.6,-4.5,2.4),(0,0,.88),2.12)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(asset+'.reimport.blend')))
    for name,pos in [('front',(0,-5,.89)),('side',(5,0,.89)),('back',(0,5,.89)),('three_quarter',(3,-5,2.3))]:
        camera=bpy.context.scene.camera
        camera.location=pos
        camera.rotation_euler=(Vector((0,0,.88))-camera.location).to_track_quat('-Z','Y').to_euler()
        render(views/(asset+'_'+name+'.png'))
    # Exercise inheritance/visibility on the imported file, restoring rest afterwards.
    hidden={}
    for control in ['char_head','char_arm_negx','char_arm_posx']:
        children={o.name for o in names[control].children_recursive if o.type=='MESH'}
        for name in children:names[name].hide_render=True
        hidden[control]=sorted(children)
    camera=bpy.context.scene.camera
    camera.location=(0,-5,.89)
    camera.rotation_euler=(Vector((0,0,.88))-camera.location).to_track_quat('-Z','Y').to_euler()
    render(views/(asset+'_visibility.png'))
    for o in bpy.data.objects:
        if o.name in original:o.hide_render=False
    pose_results={}
    # Pose images use a side-biased three-quarter view to expose garment intersections.
    for name in ['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']:
        pose(name)
        camera.location=(3,-4,2.0)
        camera.rotation_euler=(Vector((0,0,.95))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale=2.5
        render(views/(asset+'_pose_'+name+'.png'))
        pose_results[name]='PASS' # Execution only, artistic/intersection review is separate.
    pose('rest')
    return {'status':'FAIL' if errors else 'PASS','errors':errors,'visibility_descendants':hidden,
            'pose_execution':pose_results,'scope':'Roundtrip local transforms, inheritance and render execution; manual anatomy review is separate.'}

