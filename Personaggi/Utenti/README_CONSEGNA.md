# Personaggio principale utenti — human_base, prima versione

Creato il 16 novembre 2026 per revisione in Blender. Profilo tecnico `human`, contratto `AOP_CHAR_RIGID_1` del kit 1.0.0. Questa variante riprende il riferimento Minecraft fornito da Juri: testa e corpo squadrati, capelli corti castano chiaro, completo nero con pantaloni, camicia bianca, cravatta rossa e scarpe nere basse. Occhi azzurri umanizzati e volto sorridente, come richiesto.

Scala asset e istanza: **1:1**, root a scala `(1,1,1)` e origin al suolo `(0,0,0)`. Un'unità è un metro; statura locale circa 1,7655 m. Il moltiplicatore 1,15 riguarda soltanto i due NPC reception e non viene applicato a questo personaggio. Nessun placement reception è incluso.

## File e ricostruzione

- `human_base.blend`: sorgente modificabile, un solo personaggio con allestimento fotografico.
- `human_base.glb`, `human_base.manifest.json`, `human_base.check.json`: esportazione autonoma e controllo del contratto sul GLB finale.
- `human_base.reimport.blend` e `human_base.review.blend`: reimportazione separata e scena di revisione. I .blend contengono anche camere, luci e piano fotografico; il GLB contiene soltanto il personaggio.
- `build_scene.py`: ricostruisce la geometria originale del personaggio, non soltanto lo scaffold.
- `voxel_support.py`, `contact_sheets.py`, `resources/`: tutti i moduli e gli input necessari, senza percorsi assoluti d'autore o pacchetti Python aggiuntivi.
- `views/`: fronte, lato, retro, tre quarti, primo piano del volto, visibilità e otto pose di controllo.
- `BUILD_REPORT.json`, `VALIDATION.json` e `checksums.json`: evidenze, limiti e SHA-256 dei file.

Da questa cartella, con Blender nel PATH:

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
python -B verify_asset.py
```

Il design usa cuboidi per corpo/abiti/capelli e geometria piana per occhi, sopracciglia, sorriso, colletto e cravatta. Pelle, vestiti e capelli restano uniformi e ricolorabili separatamente. Testa, capelli, occhi, bocca, braccia, mani e gambe restano sotto i controlli contrattuali. La parte superiore dei pantaloni appartiene al bacino/torso fisso; le parti inferiori seguono i pivot gambe del kit. Nessun corpo unico saldato, armatura, skin, morph, clip o root motion.

## Stato e provenienza

Prima versione estetica approvata da Juri il 16 novembre 2026 con «Bene, mi piace», consegnata su sua richiesta; resta modificabile per revisioni successive. Controllo statico GLB, roundtrip Blender, scala, rotazione e visibilità sono verificati; gli esiti effettivi sono in VALIDATION.json. Le pose mostrano il comportamento del rig a parti rigide e non una deformazione anatomica di gomiti o ginocchia. L'approvazione visiva di questa versione è `PASS`; la QA del renderer/controller applicativo resta `NOT_RUN`.

Questo pacchetto contiene soltanto `human_base`. Agenti e mani in prima persona restano profili distinti e non sono stati creati da questa richiesta. L'applicazione non è stata modificata o installata.

Geometria originale creata per Juri. Nessuna skin o texture Minecraft di terzi inclusa; l'immagine allegata è un riferimento estetico e non è ridistribuita. Scaffold e strumenti derivati dal kit conservano la licenza MIT in `resources/LICENSE_SOURCE.txt`. SHA-256 in `checksums.json`, che esclude soltanto sé stesso.
