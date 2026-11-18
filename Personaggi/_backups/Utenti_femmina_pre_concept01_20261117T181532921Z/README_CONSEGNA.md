# Base femminile v03 — giacchina, capelli lunghi e fiocco fisso

Revisione del 17 novembre 2026 richiesta da Juri: giacchina corta e sagomata, maniche rastremate, colletto da blusa, piccolo nastro al collo e fascia chiara in vita. Restano gonna, gambe scoperte e tacchi a blocco. Lo stile iniziale è **long**, con lunghezza posteriore estesa. Stile voxel, volto sorridente e occhi umanizzati sono conservati.

## Fiocco permanente e colori

Il fiocco è `char_bow_visual`, sotto `char_head` ed esterno a `char_hair`. È parte fissa della base, non un accessorio del catalogo capelli: sostituire o rimuovere l'acconciatura non lo rimuove. Resta anche con bald. Il manifest dichiara `removable=false` ed `editable_property=color_only`.

Nuovo canale indipendente **bow → char_mat_bow**, inizialmente rosso. Il nastro al collo continua a usare `tie → char_mat_tie`: cambiare il fiocco in testa non cambia quello al collo. Non è stata implementata l'UI: il futuro adattatore dovrà rispettare il vincolo non rimovibile.

I nove canali precedenti mantengono i nomi esatti: skin/char_mat_skin, hair/char_mat_hair, eyebrows/char_mat_eyebrows, iris/char_mat_iris, clothing/char_mat_clothing, shirt/char_mat_shirt, tie/char_mat_tie, pants/char_mat_pants, shoes/char_mat_shoes. Sulla femminile pants colora la gonna, skin anche le gambe e shoes i tacchi. char_mat_dark e char_mat_white restano i materiali accessori del volto. Colori uniformi PBR, nessuna texture incorpora le tinte personalizzabili.

## Rig, capelli e prima persona

Profilo human / AOP_CHAR_RIGID_1: stessi controlli, parentela, trasformazioni locali, pivot e socket. Scala1:1, metri, origin ai piedi, GLB +Y alto/+Z avanti. Altezza con long circa1,7655m, ingombri a riposo entro il kit. Nessuna armatura, skin, morph, clip o root motion.

Testa completa, sopracciglia sotto char_head, capelli separati e sostituibili. Nascondendo ricorsivamente testa e braccia restano torso e gambe; in prima persona anche il fiocco si nasconde insieme alla testa.

Sette ID stabili: short, long, bun, spiky, curly, ponytail, bald. Ogni componente non vuoto in hair/ contiene una mesh e il solo materiale char_mat_hair. Aggancio a char_hair con posizione/rotazione locali nulle e scala1. Rimuovere la vecchia mesh prima di caricare il nuovo stile. Bald elimina soltanto la geometria capelli. La superficie superiore comune della testa resta compatibile con il maschile. Il maschile originale rimane invariato e senza fiocco.

## Superamento del budget dichiarato

Il fiocco con colore indipendente aggiunge un materiale e una primitive: **12 materiali e 26 primitive** sulla femminile con capelli, contro il precedente limite11/25. Con bald:12materiali e25primitive. Il controllo di quel budget è **FAIL**. La deroga non è dichiarata approvata; è esplicita nei manifest, nei check e in BUDGET_DEVIATIONS.json.

Il validatore originale continua a dare FAIL per i vecchi limiti8/24, senza modifiche a contratto o validatori. Le verifiche funzionali sono separate: rig, visibilità, colori, fiocco, geometria e pose. Tutti gli altri limiti restano invariati e verificati. `verify_package.py` restituisce exit0 quando funzionalità/evidenze/inventario passano, stampando separatamente i FAIL del budget; exit0 non significa conformità completa.

## File e ricostruzione

female_base.blend e female_base.glb: base completa con long e fiocco. female_base.review.blend include il set fotografico, escluso dal GLB. hair/ contiene componenti/sorgenti/manifest; assemblies/ contiene le14 combinazioni di prova. I generatori e tutti i moduli sono inclusi, senza percorsi d'autore o pacchetti Python aggiuntivi.

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
blender --background --factory-startup --python qa_components.py -- --out rebuilt
blender --background --factory-startup --python qa_assemblies.py -- --out rebuilt --render
blender --background --factory-startup --python presentation.py -- --out rebuilt
python -B verify_assets.py rebuilt
python -B verify_package.py
```

`verify_assets.py` conserva exit1 se il budget fallisce e un distinto `functional_status`. Collaudo Blender5.3.0. Scaffold e strumenti derivati mantengono la licenza MIT in resources/LICENSE_SOURCE.txt; nessuna skin o texture di terzi.

## Verifiche e immagini

Le14 combinazioni sono provate in8pose corporee e9stati della testa:1.008casi. Test testa: yaw±25°, pitch±15°, roll±10° e due combinazioni. Contatto con lo scalpo intenzionale; viso/naso e intersezioni capelli-corpo controllati separatamente. Il dominio non copre ogni rotazione arbitraria. Le pose sono a parti rigide, senza deformazioni anatomiche di gomiti o ginocchia.

I nove colori precedenti e bow sono verificati separatamente. `bow_color_test.png` mostra il fiocco in testa blu e il nastro al collo ancora rosso; i file finali conservano il rosso. `fixed_bow_without_hair.png` dimostra che il fiocco resta senza capelli. `three_quarter.png`, `side.png`, `back.png` e `female_face.png` mostrano il modello finale. Le gallerie stili hanno riga maschile sopra, femminile sotto; colonne short/long/bun/spiky/curly/ponytail/bald. Tutte le pose sono in views/poses/.

Rapporti: VALIDATION.json, STRUCTURAL_QA.json, ASSEMBLY_QA.json, COMPONENT_ROUNDTRIP.json, BUDGET_DEVIATIONS.json, MALE_REFERENCE_PROTECTION.json e PORTABILITY.json. checksums.json copre tutti gli altri file, escluso sé stesso e le cache generate.

**QA applicativa NOT_RUN:** adattatore, selettore acconciature, blocco rimozione fiocco nell'UI, renderer toon, materiali per istanza e sedute. Nessuna modifica all'app, installazione, commit, push, merge o deploy. Versioni precedenti preservate in cartelle separate e in backup prima di aggiornare la consegna attiva.
