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
