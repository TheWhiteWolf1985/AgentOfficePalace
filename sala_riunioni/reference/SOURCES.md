# Provenienza e limiti

Kit1.0.0 preparato il15 novembre2026 per Agent Office Palace software0.1.0, commit ab4040a14e6f3387f5ecc9ac44e1fc5f896218c5.

Numeri e convenzioni verificati nel checkout locale:
- src/shared/layout.ts: FLOOR, WALL_T/SLAB, ELEVATOR e WHITEBOARD.
- src/client/player/collide.ts: raggio0,32m, altezza1,7m, STEP0,30m.
- src/client/features/rooftop/world.ts e world/elevator.ts: origine locale e ascensore.
- blender/README.md e blender/scripts/aokit.py: metri, Blender Z-up, fronte-Y, export Y-up e materiali per nome.
- src/client/world/models.ts: materiali toon riassegnati e loader GLTF.
- src/client/features/whiteboard/world.ts e ui.ts: superficie dinamica, UV/canvas ed editor.
- src/server/office/views.ts, server/meetings.ts e shared/meetings.ts: contesto del tetto e limiti correnti dei meeting.

Riferimento primario sul formato glTF2.0/GLB, coordinate e risorse:
https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

Gli script Blender seguono il percorso di export usato dal progetto e interrogano i parametri dell'operatore disponibile. Nessuna versione Blender e stata inventata come verificata: leggere verification/PACKAGE_VALIDATION.json. I controlli Python del kit non sostituiscono il validatore completo Khronos né il test nel renderer finale.

I documenti di contesto copiati sotto reference/ sono storici descrittivi; in caso di formulazione diversa prevalgono rules/CONSTRAINTS.md e constraints.json di questa versione. Non sono inclusi credenziali, chiavi, URL interni o accessi ai server.
