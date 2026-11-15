# Sala riunioni Agent Office Palace — esportazione

Esportazione richiesta da Juri il 15 novembre 2026, Blender 5.3.0, contratto 1.0.0.

I file da usare sono in `delivery/`:

- `conference_room.glb`: asset GLB 2.0, metri e Y-up, autosufficiente.
- `conference_room.blend`: sorgente modificabile con guide e collider separati.
- `conference_room.manifest.json`: gerarchia, materiali, collisioni e ancoraggi.
- `build_scene.py`: ricostruzione procedurale; mantenere il kit con `templates/`, `scripts/` e `rules/`.
- `VALIDATION.json` e i report: esiti e limiti dei controlli realmente eseguiti.
- `views/`: pianta, ingresso, vista lavagna da una seduta e lounge.

La sala contiene 13 posti riunione e la lounge 6 posti aggiuntivi, distinti nel manifest. Ascensore e avatar rimangono del software. La porta interna e un oggetto separabile; il passaggio verificato assume la porta aperta.

Esportazione e copia completate; controlli automatici della scena, del GLB e della reimportazione superati. La geometria esportabile coincide con quella aperta in Blender. Le review manuali ancora parziali o non eseguite sono dichiarate in `delivery/VALIDATION.json`: non si certifica l'integrazione nell'applicazione.

`PACKAGE_MANIFEST.json` contiene SHA-256 e dimensioni dei file consegnati. `COPY_VERIFICATION.json` documenta il confronto della copia. Gli originali del kit restano invariati: README_INIZIA_QUI.md e gli altri ingressi originali descrivono il pacchetto iniziale; lo stato dell'asset esportato e in questo documento e in delivery/NOTES.md.
