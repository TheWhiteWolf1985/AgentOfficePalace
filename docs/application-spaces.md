# Common spaces, presentation and personal preferences

The Atrium and shared meeting room work without configured projects. The client loads their shared environment and the selected avatar first. Project furniture and the project office geometry load on the first visit to a project floor, then remain cached for the session. Other avatar models and hairstyles load when selected or needed for a visible participant. The conference-room model is also used for the outside of the company building, so it is part of the common initial assets.

Menus, pinned commands, panel toggles and the command palette follow the current space. Project tasks, workers, services, issues, pull requests and project meetings appear on actual project floors. Saved pins and panel choices survive visits to common spaces. The Atrium offers common navigation, people, chat and settings; the shared meeting room also offers its whiteboard and presentation.

## Presenting in the shared meeting room

Choose **Present my screen** in the shared meeting room. The browser asks which screen, window or tab to share. The existing WebRTC connection carries the video to participants in the same space and displays it on the room's 3D panel, preserving its aspect ratio with black borders where needed. No recording or video upload is added.

**Show whiteboard**, or opening the drawing editor, restores the shared drawing. Presentation never changes or clears the drawing or its uploaded images. Stopping screen sharing, disconnecting or leaving the room releases the presentation. New arrivals see the active presentation. Presentation selection is temporary and resets to the whiteboard when the application restarts.

Screen capture requires HTTPS except on localhost. An optional second native listener keeps the existing HTTP address available:

```
AGENT_OFFICE_HTTPS_PORT=4643
```

Alternatively pass `--https-port 4643`. It runs in the same application process and uses the same application state and authentication. The existing self-signed certificate helper stores `tls-cert.pem` and `tls-key.pem` in the application data directory; existing certificates are reused. Allow the HTTPS port through any existing firewall if needed. With a self-signed certificate, accept the certificate warning once in each browser. No operating-system certificate trust is changed. The HTTP interface offers **Open secure connection** and preserves the selected floor when switching.

## Personal accounts

Named accounts save appearance (model, hairstyle and all color channels) and personal settings (view, sound, push-to-talk, notifications, panels and pins) on the application server. Another browser restores them when signing in or reloading. Existing appearance and settings migrate once, only if that account has no saved preferences yet. Credentials remain in their existing separate account store.

Preferences use `personal-preferences.json` in the application data directory. Include it in application-data backups. Authenticated HTTP requests select the owner from the session, never from a supplied account ID. Shared-password access continues to use browser-local preferences and does not write account preferences. Position and current floor stay local.

The browser keeps an account-specific cache and durable retry queue. Failed saves retry automatically and show a sync-pending notice. Retrying a write whose acknowledgement was lost does not overwrite a later acknowledged change from another device. Normal later edits use the most recently accepted value for each submitted setting; already-open browsers refresh server preferences on their next login or reload.
