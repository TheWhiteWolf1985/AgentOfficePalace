"""Original voxel reception women, revision 01. Run in a fresh background Blender.

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
            parent = bpy.data.objects[control]
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

def build_character(asset):
    empty_scene()
    # Import the contractual scaffold before replacing its placeholder geometry.
    bpy.ops.import_scene.gltf(filepath=str(RES / 'starter_human.glb'))
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    bpy.context.view_layer.update()
    blonde = asset == 'reception_a'
    palette = {
        'skin': (.71,.43,.25) if blonde else (.58,.31,.17),
        'clothing': (.026,.032,.048) if blonde else (.045,.028,.037),
        'hair': (.69,.43,.115) if blonde else (.115,.047,.023),
        'shirt': (.85,.87,.84),
        'accent': (.39,.018,.03) if blonde else (.016,.22,.19),
        'dark': (.008,.011,.017),
        'white': (.95,.97,1),
        'iris': (.018,.20,.48) if blonde else (.10,.27,.11),
    }
    mats = {k:material('char_mat_'+k, v) for k,v in palette.items()}
    p = Parts(mats)
    box = p.box
    # Tailored black jacket, ivory shirt and a small square scarf inspired by the reference.
    box('char_torso','clothing',(0,0,.905),(.44,.30,.43))
    box('char_torso','clothing',(0,0,1.065),(.64,.30,.09))
    box('char_torso','clothing',(0,0,.735),(.40,.30,.13))
    # Three stepped skirt tiers are a single rigid garment under the torso control.
    for center,width,depth,height in [(.663,.43,.32,.11),(.559,.47,.34,.10),(.467,.51,.36,.084)]:
        box('char_torso','clothing',(0,0,center),(width,depth,height))
    box('char_torso','shirt',(0,-.156,1.025),(.15,.012,.17))
    box('char_torso','shirt',(-.076,-.164,1.082),(.055,.016,.055))
    box('char_torso','shirt',(.076,-.164,1.082),(.055,.016,.055))
    box('char_torso','accent',(0,-.17,1.069),(.045,.016,.042))
    box('char_torso','accent',(0,-.171,.994),(.037,.016,.11))
    # Neck, ears and small square nose stay with the head.
    box('char_head','skin',(0,0,1.14),(.15,.16,.12))
    box('char_head','skin',(0,-.015,1.445),(.54,.57,.55))
    box('char_head','skin',(-.286,0,1.40),(.036,.12,.12))
    box('char_head','skin',(.286,0,1.40),(.036,.12,.12))
    box('char_head','skin',(0,-.318,1.365),(.064,.036,.054))
    # Mesh offsets leave clearance for the head/hair in raised-arm tests.
    # The contractual shoulder pivots themselves remain at +/-0.33 m.
    for side,x in [('negx',-.385),('posx',.385)]:
        arm = 'char_arm_'+side
        box(arm,'clothing',(x,0,.852),(.136,.26,.45))
        box(arm,'shirt',(x,-.002,.613),(.14,.264,.035))
        box('char_hand_'+side,'skin',(x,-.003,.552),(.14,.266,.087))
        leg = 'char_leg_'+side
        lx = -.125 if side=='negx' else .125
        box(leg,'skin',(lx,0,.28),(.15,.17,.30))
        # Block heel, raised rear of shoe, stepped instep and projecting square toe.
        box(leg,'dark',(lx,.054,.042),(.095,.078,.084))
        box(leg,'dark',(lx,-.109,.024),(.172,.145,.048))
        box(leg,'dark',(lx,-.073,.058),(.172,.19,.045))
        box(leg,'dark',(lx,-.009,.087),(.166,.125,.045))
        box(leg,'dark',(lx,.032,.115),(.16,.080,.043))
    # Human-style almond eyes on the voxel head; each eye keeps its own control.
    for side,x in [('negx',-.12),('posx',.12)]:
        eye = 'char_eye_'+side
        eye_shape=[(-.076,0),(-.052,.026),(-.02,.035),(.018,.034),(.052,.023),(.076,0),(.047,-.021),(.012,-.028),(-.026,-.026),(-.054,-.016)]
        p.face(eye,'dark',[(x+dx,1.414+dz) for dx,dz in eye_shape],-.303)
        p.face(eye,'white',[(x+dx*.92,1.414+dz*.78-.001) for dx,dz in eye_shape],-.305)
        p.ellipse(eye,'iris',x,1.414,.025,.025,-.307)
        p.ellipse(eye,'dark',x,1.414,.011,.017,-.309)
        p.ellipse(eye,'white',x-.008,1.425,.006,.006,-.311,12)
        # Tapered, gently arched eyebrows in the recolorable hair material.
        brow=[(-.067,-.003),(-.034,.010),(.005,.014),(.042,.008),(.065,-.002),(.037,.001),(.002,.005),(-.033,.001)]
        p.face('char_hair','hair',[(x+dx,1.482+dz) for dx,dz in brow],-.304)
    # An open upturned smile with teeth; no texture or animation clip.
    smile=[(-.080,1.301),(-.043,1.289),(0,1.286),(.043,1.289),(.080,1.301),(.060,1.271),(.030,1.252),(0,1.247),(-.030,1.252),(-.060,1.271)]
    p.face('char_mouth','dark',smile,-.303)
    teeth=[(-.061,1.291),(-.03,1.283),(0,1.281),(.03,1.283),(.061,1.291),(.046,1.277),(0,1.269),(-.046,1.277)]
    p.face('char_mouth','white',teeth,-.305)
    # All hair uses one uniform dynamic material, no painted shading or skin texture.
    box('char_hair','hair',(0,-.012,1.738),(.586,.606,.055))
    box('char_hair','hair',(0,.281,1.488),(.586,.045,.45))
    for x in [-.282,.282]:
        box('char_hair','hair',(x,-.005,1.665),(.064,.58,.13))
    # Asymmetric stair-step fringe leaves the pixel eyes unobstructed.
    for x,width,bottom in [(-.245,.096,1.53),(-.147,.10,1.57),(-.049,.10,1.61),(.049,.10,1.65),(.147,.10,1.62),(.245,.096,1.57)]:
        box('char_hair','hair',(x,-.311,(bottom+1.72)/2),(width,.034,1.72-bottom))
    if blonde:
        box('char_hair','hair',(0,.294,1.205),(.586,.070,.37))
        for x in [-.267,.267]:
            box('char_hair','hair',(x,.05,1.405),(.052,.46,.46))
            box('char_hair','hair',(x,-.17,1.20),(.075,.12,.28))
            box('char_hair','hair',(x,-.16,1.035),(.059,.10,.05))
    else:
        for x in [-.282,.282]:
            box('char_hair','hair',(x,-.005,1.415),(.064,.58,.50))
        box('char_hair','hair',(0,.293,1.195),(.62,.067,.09))
    mesh_objects = p.finish()
    root = bpy.data.objects['char_root']
    root['asset_id'] = asset
    root['contract'] = 'AOP_CHAR_RIGID_1'
    root['design_revision'] = 'voxel_women_v01'
    return mesh_objects

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
    manifest['design_revision'] = 'voxel_women_v01'
    manifest['appearance'] = 'Woman, long blonde hair, skirt and block heels' if asset=='reception_a' else 'Woman, brown bob, skirt and block heels'
    manifest['provenance'] = [{'kind':'scaffold','file':'resources/starter_human.glb','license':'MIT'},
                              {'kind':'original_design','file':'build_scene.py','note':'Original cuboid geometry, no third party skins or textures. User image used only as visual inspiration; not distributed.'}]
    manifest['checks'] = {'runtime_application':'NOT_RUN','artistic_approval':'NOT_RUN'}
    write_json(out/(asset+'.manifest.json'),manifest)
    result = inspect(glb.read_bytes(),CONTRACT,'human',manifest)
    write_json(out/(asset+'.check.json'),result)
    if result['status'] != 'PASS':
        raise RuntimeError(result)
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

def pair_scene(out,views,atrium=None):
    empty_scene()
    placements=json.loads((RES/'reception.placements.json').read_text(encoding='utf8'))
    if atrium:
        bpy.ops.import_scene.gltf(filepath=str(atrium))
    for index,asset in enumerate(['reception_a','reception_b']):
        previous=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(out/(asset+'.glb')))
        imported=set(bpy.data.objects)-previous
        roots=[o for o in imported if o.parent not in imported]
        for root in roots:
            if atrium:
                root.location=placements['placements'][index]['blender_position']
                root.scale=placements['placements'][index]['runtime_instance_scale']
            else:
                root.location.x=(-.65 if index==0 else .65)
    if atrium:
        stage(1500,1000,ground=False)
        # Keep the original reference materials, glass, floor and geometry unchanged.
        for o in bpy.data.objects:
            if o.type=='LIGHT':
                o.location.y+=7
                o.location.z+=1
                o.rotation_euler=(Vector((0,10.8,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
                o.data.energy*=3
        cam=camera_at('Review_visitor',(0,5.5,1.40),(0,10.8,1.40),lens=42)
        render(views/'reception_from_visitor.png')
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'reception_fit.reimport.blend'))
    else:
        stage(1500,1000)
        camera_at('Review_camera',(2.5,-7,2.8),(0,0,.9),3.35)
        render(views/'pair_three_quarter.png')
        bpy.context.scene.camera.location=(0,-6,.9)
        bpy.context.scene.camera.rotation_euler=(Vector((0,0,.9))-bpy.context.scene.camera.location).to_track_quat('-Z','Y').to_euler()
        render(views/'front.png')
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'pair_review.blend'))
        bpy.context.scene.render.resolution_y=600
        bpy.context.scene.camera.location=(0,-6,1.43)
        bpy.context.scene.camera.rotation_euler=(Vector((0,0,1.43))-bpy.context.scene.camera.location).to_track_quat('-Z','Y').to_euler()
        bpy.context.scene.camera.data.ortho_scale=2.15
        render(views/'faces_closeup.png')

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--out',type=Path,default=HERE/'generated')
    ap.add_argument('--atrium',type=Path)
    ap.add_argument('--skip-views',action='store_true')
    a=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if '--factory-startup' not in sys.argv or not bpy.app.background:
        raise RuntimeError('Run in a separate Blender --background --factory-startup process.')
    out=a.out.resolve()
    out.mkdir(parents=True,exist_ok=True)
    views=out/'views'
    views.mkdir(exist_ok=True)
    reports={}
    for asset in ['reception_a','reception_b']:
        build_character(asset)
        result=export(out,asset)
        stage()
        camera_at('Review_camera',(2.6,-4.5,2.4),(0,0,.88),2.12)
        bpy.ops.wm.save_as_mainfile(filepath=str(out/(asset+'.blend')))
        reports[asset]={'glb_contract':result}
        write_json(out/'BUILD_REPORT.json',reports)
    if not a.skip_views:
        pair_scene(out,views)
        for asset in ['reception_a','reception_b']:
            reports[asset]['roundtrip']=reimport_asset(out,asset,views)
            write_json(out/'BUILD_REPORT.json',reports)
        if a.atrium:
            expected=json.loads((RES/'reception.placements.json').read_text(encoding='utf8'))['source_atrium_sha256']
            if hashlib.sha256(a.atrium.read_bytes()).hexdigest()!=expected:
                raise RuntimeError('Atrium reference SHA does not match placements')
            pair_scene(out,views,a.atrium)
        from contact_sheets import create
        create(views)
    shutil.copy2(RES/'reception.placements.json',out/'reception.placements.json')
    print('BUILD_COMPLETED',out,flush=True)

if __name__=='__main__':
    main()
