"""Render delle sole viste angolari, senza cambiare geometrie o export."""
from pathlib import Path
import bpy
s=bpy.context.scene
prefix=s.objects[next(o.name for o in s.objects if o.name.endswith('_root'))].name[:-4]
out=Path(bpy.data.filepath).parent/'views'
for ob in s.objects[prefix+'ceiling'].children_recursive:ob.hide_render=True
for label in ('corner_south_east','corner_south_west'):
    s.camera=s.objects[prefix+'preview_'+label]
    s.render.filepath=str(out/(label+'.png'))
    bpy.ops.render.render(write_still=True)
