# Asset delivery and office surfaces

Client builds include optional Brotli (`.br`) and gzip (`.gz`) representations of static HTML, JS, CSS, JSON, SVG, WASM and GLB files. `npm run build:client` generates these after Vite. The original files remain unchanged. Small files and representations that do not save space are skipped; fonts and already compressed media are not recompressed.

The native application server selects an available representation using `Accept-Encoding`, including quality values and exclusions. Responses keep the original MIME type and cache policy, add `Vary: Accept-Encoding`, and report the selected representation's `Content-Length`. Clients without an accepted compressed representation receive the original when identity is acceptable. If no representation is acceptable, the server returns406. HEAD uses the same representation headers without sending a body. Sidecars are not separate public URLs. Static files support GET/HEAD; ranges are not advertised and a Range request receives the complete representation.

Static asset compression does not change API bodies, sessions, application data, media sharing, agents or certificate configuration. Keep the original files and their sidecars together when deploying the validated build. Compression happens at build time, without a new proxy or runtime service.

The office's seven board canvases/textures are now created when the project office is first constructed, rather than on application entry. The aim and hint handles remain usable in common spaces without allocating them. When the office is ready, boards render the current store state and retain their resources across floor changes. Their labels, data and interactions are unchanged.

The office TV creates its idle canvas at office readiness. Its video element and VideoTexture are created only on the first useful screen share in an actual project. Leaving the project, or stopping the share, pauses and detaches the TV video; returning reuses it. The common meeting-room presentation continues to use its existing independent surface.

## Comparing in Chrome

For a first-load comparison, use the same browser, viewport, device scale, account/avatar, room and server state for both versions. In Network, disable cache while DevTools is open and reload; previously cached immutable GLB files can otherwise avoid the network entirely. Inspect the response `Content-Encoding` and distinguish transferred bytes from the decompressed resource size. HTTPS can negotiate Brotli; clients that advertise only gzip receive gzip instead. A subsequent cache-enabled visit is a separate case.

Record a separate Performance trace for walking through the Atrium, visiting the shared meeting room, entering a project for the first time, and returning. The lazy resources intentionally move work to first office use. Screen sharing, drawing and avatar editing should be compared as separate interactions. Rendering resolution, shadows, frame rate and the supplied models remain unchanged by these two improvements. File-size reductions do not establish an FPS or RAM improvement.

HTTP representation selection follows [RFC9110 section12.5.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.3).

## Graphics and rendering budget

Settings â†’ Graphics stores a device/browser preference (`agent-office.graphics`), independently of account preferences. High preserves the existing appearance: pixel ratio up to2,2048Â² shadows and toon outlines. Balanced caps pixel ratio at1.5 and shadows at1024Â². Economy caps pixel ratio at1 and disables shadows/outlines. Models, layout and interaction distances are unchanged.

Drawing defaults to60FPS;30FPS and the display refresh rate are available. These are upper limits, not promised performance. Simulation, networking, audio and collaboration continue on the regular application loop. The world behind an open dialog draws at15FPS; hidden documents skip world drawing. A deadline accumulator tolerates RAF jitter and resets on resume/rate changes. The avatar editor uses the dedicated preview budget described below.

## Static room geometry

The runtime Atrium and meeting-room clones merge compatible opaque static leaf meshes in spatial cells. A batch shares the same material, vertex-attribute layout, shadow flags, render order and layers. Transforms are baked into derived geometry while positions, normals, UVs, triangles and original imported buffers are preserved. Delivered GLB/Blender files are not rewritten.

Transparent surfaces, dynamic textures, the reception logo, whiteboard, door/pivots, seat interactions, floors/rugs, skinned/instanced/morphed objects and custom render callbacks stay separate. Pointer raycasts still use the room geometry for occlusion; collision/seat manifests remain authoritative. Batch object counts are not measured draw calls: shadows and outlines add passes, and culling varies with the camera.

## Shader and audio preparation

Only a requested destination is prepared with Three's `compileAsync`, using the current scene lights. Repeated visits share preparation; quality changes invalidate it. Elevator departure waits behind its fade for bounded preparation (maximum2seconds), and actual drawing of a newly revealed world waits for preparation to settle. Unsupported/failing drivers retain the normal first-use rendering path. Loading completion follows an actual draw, rather than an arbitrary RAF tick. This reduces first-use shader work without disabling shader diagnostics or changing agents.

Audio sample buffers are generated lazily, cached and warmed one sample family per idle/background task. The browser can prepare AudioBuffers without creating or starting an AudioContext;48kHz prepared samples are resampled normally by the playing context. The context is still resumed during the user gesture. The initial sound graph and alerts remain immediately usable, while ambience starts in a separate task. Sound recipes, volume, visibility behavior, voice and alerts remain in place.

## Picking and visual updates

Frequent pointer rays are bounded by the maximum interaction reach plus the camera-to-eyes distance and any click tolerance. Intersections are reused while the camera, geometry and object hierarchy stay still. The cache checks transforms, visibility, layers, materials and geometry revisions, including parent transforms. Tiny numerical settling below 1e-8 is ignored. Key actions and first-person clicks recheck the scene before using the target. Third-person clicks retain the distant-object feedback and board intersections retain their UV coordinates.

Local character poses, hands, dust, confetti and sky updates follow the world's drawing cadence, including the reduced cadence behind a dialog. Their elapsed time accumulates between draws and is bounded on resume. Movement, collision handling, networking, audio, door/elevator state and shared updates continue on the normal loop. Solar position calculations are cached within one simulated second and refresh when time or location changes. The user-avatar editor uses the dedicated preview budget described below.

Compare CPU/frame traces with the same graphics preference, viewport, camera, weather and route. Measure first room entry separately from a repeat visit. User-supplied November17traces locate an audio startup task around58ms and a shader-program first-use stall around201ms; these are a baseline, not evidence of a hardware-independent improvement after this change.
## Anteprima dell'utente

L'editor del personaggio usa il profilo grafico del dispositivo, con un limite di30fotogrammi/s per Alta/Bilanciata e20per Risparmio, anche con frequenza principale illimitata. DPR massimo1,5/1,25/1 rispettivamente; ombre1024/512/disabilitate e contorni disabilitati in Risparmio. Le ombre animate si aggiornano fino a15volte/s e una modifica del personaggio le invalida per il disegno successivo.

L'anteprima sospende il proprio RAF con scheda nascosta, canvas fuori vista o finestra coperta da un'altra modale. Al ritorno mostra lo stato attuale senza recuperare il tempo trascorso. Rotazione, animazioni, selezione di modello/acconciatura e colori restano attive alla cadenza prevista. Chiusura e annullamento scollegano osservatori, listener, ciclo e risorse del renderer. Questi limiti riguardano l'editor dell'utente.
