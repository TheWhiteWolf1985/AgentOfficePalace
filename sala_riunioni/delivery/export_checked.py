"""Export secondo il kit, eliminando anche selezioni rimaste in scene estranee.

Il .blend conserva la scena preesistente. La selezione delle altre scene deve
essere esplicitamente azzerata: glTF 5.3 puo esportarla con use_selection.
"""
from pathlib import Path
import bpy, runpy
kit=Path(__file__).resolve().parent.parent
for sc in bpy.data.scenes:
    for layer in sc.view_layers:
        for ob in layer.objects:
            ob.select_set(False,view_layer=layer)
bpy.context.window.scene=bpy.data.scenes['AOP_Sala_Riunioni_v01']
runpy.run_path(str(kit/'scripts/export_asset.py'),run_name='__main__')
