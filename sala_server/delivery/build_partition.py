"""Parete vetrata di accesso, anta separata e tastierino per futura integrazione."""
import math
import bpy
from mathutils import Matrix,Vector


def add_partition(scene,root,asset,preview,prefix):
    wall_x=6.1
    height=5.2
    palette={'frame':(.28,.34,.37),'glass':(.68,.83,.87),'handle':(.68,.73,.76),
             'keypad_body':(.24,.28,.31),'button':(.12,.16,.18),'digits':(.94,.96,.96),
             'display':(.12,.38,.43),'indicator':(.95,.58,.16)}
    mats={}
    for name,rgb in palette.items():
        m=bpy.data.materials.new(prefix+'access_mat_'+name);m.use_nodes=True
        sh=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        linear=lambda v:v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
        sh.inputs['Base Color'].default_value=(*map(linear,rgb),1)
        sh.inputs['Roughness'].default_value=.65
        if name=='glass':
            sh.inputs['Alpha'].default_value=.12;sh.inputs['Roughness'].default_value=.16
            options=[i.identifier for i in m.bl_rna.properties['surface_render_method'].enum_items]
            if 'BLENDED' not in options:raise RuntimeError(str(options))
            m.surface_render_method='BLENDED';m.use_backface_culling=False
        if name=='handle':sh.inputs['Metallic'].default_value=.6
        if name in ('display','indicator'):
            sh.inputs['Emission Color'].default_value=(*map(linear,rgb),1)
            sh.inputs['Emission Strength'].default_value=.35
        m.diffuse_color=(*rgb,.12 if name=='glass' else 1)
        mats[name]=m
    def empty(label,parent):
        ob=bpy.data.objects.new(prefix+label,None);asset.objects.link(ob);ob.parent=parent
        ob.empty_display_size=.10
        return ob
    group=empty('access_partition',root)
    fixed=empty('access_partition_fixed',group)
    colliders=[]
    def mesh(label,verts,faces,mat,parent):
        data=bpy.data.meshes.new(prefix+label+'_mesh');data.from_pydata(verts,[],faces)
        data.materials.append(mats[mat]);data.update()
        ob=bpy.data.objects.new(prefix+label,data);asset.objects.link(ob);ob.parent=parent
        return ob
    def box(label,lo,hi,mat='frame',parent=fixed):
        return mesh(label,[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])],
                    [(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)],mat,parent)
    def pane(label,y0,y1,z0,z1,parent=fixed,x=wall_x):
        return mesh(label,[(x,y0,z0),(x,y1,z0),(x,y1,z1),(x,y0,z1)],[(0,1,2,3)],'glass',parent)
    nodes=[]
    south_end=-12.94
    north_end=12.99
    for side,lo,hi in [('south',south_end,-.90),('north',.90,north_end)]:
        segments=6;step=(hi-lo)/segments
        for i in range(segments):
            ya=lo+i*step;yb=ya+step
            for band,z0,z1 in [('lower',.10,2.73),('upper',2.83,5.10)]:
                pa=ya+.08 if i==0 else ya+.04
                pb=yb-.08 if i==segments-1 else yb-.04
                nodes.append(pane(f'partition_{side}_{i:02}_{band}_glass',pa,pb,z0,z1).name)
            ma=ya if i==0 else ya-.04
            mb=ya+.08 if i==0 else ya+.04
            box(f'partition_{side}_{i:02}_mullion',(wall_x-.06,ma,0),(wall_x+.06,mb,height))
        box(f'partition_{side}_end_stile',(wall_x-.06,hi-.08,0),(wall_x+.06,hi,height))
        for band,z0,z1 in [('base',0,.10),('middle',2.73,2.83),('top',5.10,height)]:
            box(f'partition_{side}_{band}',(wall_x-.06,lo,z0),(wall_x+.06,hi,z1))
        colliders.append({'node':fixed.name,'min_blender_m':[wall_x-.06,lo,0],
                          'max_blender_m':[wall_x+.06,hi,height],'role':'fixed_glass_partition'})
    box('partition_south_joint_seal',(wall_x-.06,-12.95,0),(wall_x+.06,south_end,height))
    box('partition_north_joint_seal',(wall_x-.06,north_end,0),(wall_x+.06,13,height))
    for label,y in [('south',-.85),('north',.85)]:
        box('access_door_jamb_'+label,(wall_x-.08,y-.05,0),(wall_x+.08,y+.05,height))
    box('access_door_header',(wall_x-.08,-.95,2.72),(wall_x+.08,.95,2.83))
    box('access_door_transom_top',(wall_x-.06,-.95,5.10),(wall_x+.06,.95,height))
    pane('access_door_transom',-.85,.85,2.83,5.10)

    # Leaf extends +Y from its hinge. A +90 degree rotation opens toward -X (inside).
    pivot=empty('access_door_pivot',group);pivot.location=(wall_x,-.795,0)
    pivot['interaction']='hinged_access_door';pivot['closed_angle_z']=0
    pivot['open_angle_z']=math.pi/2;pivot['runtime_lock']='pending_application'
    leaf_width=1.59
    door_glass=pane('access_door_glass',.06,leaf_width-.06,.12,2.64,pivot,x=0)
    for tag,lo,hi in [
        ('hinge',(-.035,0,.025),(.035,.06,2.70)),
        ('latch',(-.035,leaf_width-.06,.025),(.035,leaf_width,2.70)),
        ('bottom',(-.035,.06,.025),(.035,leaf_width-.06,.12)),
        ('top',(-.035,.06,2.64),(.035,leaf_width-.06,2.70))]:
        box('access_door_leaf_'+tag,lo,hi,parent=pivot)
    for tag,x in [('inside',-.10),('outside',.10)]:
        box('access_door_handle_'+tag,(x-.014,1.34,1.05),(x+.014,1.53,1.09),'handle',pivot)
        box('access_door_handle_mount_'+tag,(min(x,0),1.48,1.035),(max(x,0),1.52,1.105),'handle',pivot)
    colliders.append({'node':pivot.name,'min_blender_m':[wall_x-.04,-.8,.025],
                      'max_blender_m':[wall_x+.04,.8,2.70],'role':'access_door',
                      'active_when':'door_closed'})

    # From outside (+X), looking toward -X, right is +Y.
    box('keypad_mount_post',(wall_x-.06,1.13,0),(wall_x+.06,1.27,height))
    keypad=empty('access_keypad',group);keypad.location=(wall_x+.06,1.20,1.35)
    keypad['interaction']='numeric_access_keypad';keypad['door_node']=pivot.name
    keypad['outside_face_axis']='+X';keypad['pin_validation']='pending_application'
    box('keypad_body',(0,-.115,-.19),(.045,.115,.19),'keypad_body',keypad)
    display=mesh('keypad_display',[(.046,-.085,.105),(.046,.085,.105),(.046,.085,.16),(.046,-.085,.16)],
                 [(0,1,2,3)],'display',keypad)
    uv=display.data.uv_layers.new(name='UVMap')
    for loop,coord in zip(display.data.polygons[0].loop_indices,((0,0),(1,0),(1,1),(0,1))):uv.data[loop].uv=coord
    box('keypad_status_led',(.046,.09,.162),(.050,.104,.176),'indicator',keypad)
    buttons=[]
    text_rotation=Matrix(((0,0,1),(1,0,0),(0,1,0))).to_quaternion()
    for row,labels in enumerate((('1','2','3'),('4','5','6'),('7','8','9'),('*','0','#'))):
        for col,key in enumerate(labels):
            yy=(col-1)*.066;zz=.055-row*.060
            key_id=key if key.isdigit() else ('clear' if key=='*' else 'confirm')
            button=empty('keypad_key_'+key_id,keypad);button.location=(.045,yy,zz);button['key']=key
            hit=box('keypad_button_'+key_id,(0,-.026,-.023),(.012,.026,.023),'button',button)
            curve=bpy.data.curves.new(prefix+'keypad_digit_'+key_id+'_font','FONT')
            curve.body=key;curve.size=.031;curve.align_x='CENTER';curve.align_y='CENTER'
            ob=bpy.data.objects.new(prefix+'keypad_digit_'+key_id,curve);asset.objects.link(ob);ob.parent=button
            ob.location=(.013,0,0);ob.rotation_mode='QUATERNION';ob.rotation_quaternion=text_rotation
            curve.materials.append(mats['digits']);bpy.context.view_layer.update()
            data=bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            # Nome stabile come nell'asset approvato, indipendente dalla lingua di Blender.
            for layer in data.uv_layers:layer.name='Mappa UV'
            transform=ob.matrix_basis.copy();name=ob.name
            bpy.data.objects.remove(ob,do_unlink=True)
            label_ob=bpy.data.objects.new(name,data);asset.objects.link(label_ob);label_ob.parent=button
            label_ob.matrix_basis=transform
            buttons.append({'key':key,'node':button.name,'hit_mesh':hit.name})
    for label,pos,target,lens in [
        ('entrance',(12.5,-4.7,2.2),(wall_x,0,1.7),24),
        ('junction',(9.0,-9.5,4.2),(wall_x,-12.96,2.7),38),
        ('corner_south_east',(23,-20,9.8),(18,-13,2.6),28),
        ('corner_south_west',(-23,-20,9.8),(-18,-13,2.6),28),
        ('keypad',(8.0,1.7,1.48),(wall_x+.08,1.20,1.35),60)]:
        data=bpy.data.cameras.new(prefix+'preview_'+label)
        ob=bpy.data.objects.new(data.name,data);preview.objects.link(ob);ob.location=pos
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        data.lens=lens;data.clip_end=150
    return {'group':group.name,'fixed_group':fixed.name,'wall_x_m':wall_x,
        'span_y_m':[south_end,north_end],'perimeter_inner_span_y_m':[-13,13],
        'construction_joint_m':.01,'south_junction':'aligned_to_perimeter_window_stile',
        'height_m':height,'glass_nodes':nodes,
        'door':{'pivot':pivot.name,'glass_node':door_glass.name,'width_m':leaf_width,
                'height_m':2.7,'clear_width_m':1.6,'hinge_blender_m':[wall_x,-.795,0],'opens_inside_direction':'-X',
                'open_angle_z_rad':math.pi/2,'preview_state':'closed'},
        'keypad':{'node':keypad.name,'display_node':display.name,'buttons':buttons,
                  'position_blender_m':[wall_x+.06,1.2,1.35],
                  'side':'right_of_door_when_viewed_from_outside_+X',
                  'normal_blender':[1,0,0],'access_logic':'pending_application'},
        'colliders':colliders,'runtime_implemented':False}
