# Human base maschile — revisione 02, materiali indipendenti

Revisione del 16 novembre 2026, limitata alla base maschile e alla sua acconciatura attuale. Conserva design, proporzioni, colori iniziali e geometria della versione approvata. Il confronto dei GLB prima/dopo, a riposo e nelle otto pose, confronta tutti i triangoli, le normali e le proprietà iniziali dei materiali ignorandone soltanto il nome. Tolleranza di confronto delle coordinate: 0,000001 m. Risultato: nessun triangolo mancante o aggiunto, 522 triangoli in entrambi i file.

## Rig conservato e deroga al budget

Profilo `human`, contratto `AOP_CHAR_RIGID_1` 1.0.0. Scala 1:1, origin al suolo sotto il centro, root identità, GLB Y-up/fronte +Z. Nomi, genitori, posizioni locali, rotazioni, scale e pivot di tutti i controlli richiesti coincidono con la versione originale. Nessuna armatura, skin, morph, clip o root motion. Nessun fattore 1,15, nessun placement reception o modello di agente/mano in prima persona.

**Il controllo rigoroso del contratto originale è FAIL:** questa revisione richiede **11 materiali e 25 primitive**, contro i limiti originali di 8 e 24. I triangoli sono 522 e le mesh 13, entro gli altri limiti. `resources/constraints.json` e `resources/inspect_character.py` sono gli originali invariati. I superamenti e la relativa dichiarazione di deroga compaiono in `human_base.check.json`, nel manifest e in `DEVIATIONS.json`. L'accettazione della deroga di budget e l'adattamento applicativo non sono dichiarati eseguiti. I controlli delle modifiche richieste e del rig hanno esito separato PASS.

## Materiali e parti

| Ruolo | Materiale | Ambito |
|---|---|---|
| Pelle | `char_mat_skin` | Testa completa, collo, orecchie, naso e mani |
| Capelli | `char_mat_hair` | Solo acconciatura corrente sotto `char_hair` |
| Sopracciglia | `char_mat_eyebrows` | Mesh `char_eyebrows_visual`, direttamente sotto `char_head` |
| Iridi | `char_mat_iris` | Entrambi gli occhi |
| Giacca | `char_mat_clothing` | Giacca, maniche e risvolti; nessun pantalone |
| Camicia | `char_mat_shirt` | Camicia, colletto e polsini |
| Cravatta | `char_mat_tie` | Nodo e parte lunga |
| Pantaloni | `char_mat_pants` | Parte superiore sotto il torso e parti inferiori sotto le due gambe |
| Scarpe | `char_mat_shoes` | Solo scarpe |

I due materiali facciali accessori restano `char_mat_dark` (pupille, contorni degli occhi e interno del sorriso) e `char_mat_white` (sclera, riflessi e denti), come nella versione precedente. Le scarpe non condividono più il materiale scuro del volto. Le nove categorie richieste hanno nove materiali distinti, con i colori iniziali identici ai precedenti. Nessuna texture incorpora i colori.

Le sopracciglia seguono la testa anche quando `char_hair` è nascosto o quando la mesh dei capelli è scollegata dal suo gruppo. La testa completa sottostante è invariata e chiusa. Nessuna acconciatura alternativa è stata aggiunta.

## Contenuti e riproduzione

`human_base.blend` è il sorgente modificabile con un solo personaggio. Camere, luci e piano fotografico sono esclusi dal GLB. `human_base.glb` è autosufficiente; `human_base.reimport.blend` e `human_base.review.blend` provengono dalla reimportazione in un file vuoto. Il manifest elenca tutti i controlli, i genitori delle mesh e i ruoli dei materiali.

`build_scene.py`, `voxel_support.py` e `resources/` ricostruiscono il design completo. `qa_glb.py` confronta gli asset e controlla le assegnazioni; `qa_blender.py` esegue le prove reali di ricolorazione, visibilità, scollegamento capelli, rotazione della testa e pose. Il GLB originale preservato per i confronti è `resources/baseline_human_base.glb`; il relativo manifest ne conserva SHA-256 e provenienza.

Da questa cartella, con Blender disponibile nel PATH:

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
blender --background --factory-startup --python qa_blender.py -- --out rebuilt
python -B verify_asset.py
```

Nessuna dipendenza Python aggiuntiva, download o percorso assoluto d'autore è necessario. Collaudo con Blender 5.3.0. `verify_asset.py` restituisce exit 0 per i controlli della revisione richiesta e dell'inventario, stampando separatamente il FAIL del contratto originale: exit 0 non significa piena conformità al budget. Per ripetere il validatore originale (exit 1 atteso per i limiti dichiarati):

```text
python -B resources/inspect_character.py human_base.glb --profile human --manifest human_base.manifest.json --contract resources/constraints.json
```

## Immagini ed evidenze

- `views/comparison_front.png`, `comparison_side.png`, `comparison_back.png`, `comparison_three_quarter.png`, `comparison_face.png`: originale a sinistra, revisione a destra, colori iniziali.
- `views/comparison_hair_hidden.png`: originale a sinistra con sopracciglia che scomparivano insieme ai capelli; revisione a destra con testa e sopracciglia visibili.
- `views/color_channels.png`: prova temporanea in magenta. Ordine da sinistra a destra e dall'alto in basso: pelle, capelli, sopracciglia, iridi, giacca, camicia, cravatta, pantaloni, scarpe. Le prove individuali sono in `color_*.png`; i primi piani di sopracciglia e iridi sono aggiunti per leggibilità.
- `views/hair_hidden_head_turn.png`: sopracciglia che seguono la testa ruotata, con capelli nascosti.
- `views/poses.png`: riposo, due fasi cammino, seduta, presa, carta/libro, scala e palo. Nessuna nuova funzione o animazione è implementata.

Il magenta è soltanto un colore di prova nei render. I .blend sorgente e il GLB finale mantengono la palette originale. `BLENDER_QA.json`, `GEOMETRY_COMPARISON.json`, `BUILD_REPORT.json`, `PORTABILITY.json`, `VALIDATION.json` e `DEVIATIONS.json` distinguono esecuzione delle prove, invarianti conservati e limiti.

## Ambito dell'accettazione

PASS: geometria/normali/colori iniziali invariati, rig e pivot invariati, scala/origin/fronte, nove materiali indipendenti, pantaloni superiori/inferiori correttamente assegnati, scarpe separate dal volto, sopracciglia indipendenti dai capelli, testa chiusa, roundtrip Blender e pose.

FAIL: conformità completa ai budget originali, per i due superamenti dichiarati. NOT_RUN: adattatore e renderer dell'applicazione, ricolorazione e comportamento di più istanze nel runtime, approvazione della deroga di budget. Non è stata modificata l'applicazione e non sono stati eseguiti commit, push, merge o deploy.

Originali preservati in una cartella separata prima della revisione e in un backup separato della destinazione prima della pubblicazione. `checksums.json` contiene SHA-256 di tutti gli altri file del pacchetto; esclude soltanto sé stesso e le cache Python generate durante l'esecuzione. Scaffold e strumenti derivati dal kit mantengono la licenza MIT in `resources/LICENSE_SOURCE.txt`; nessuna skin o texture di terzi è inclusa.
