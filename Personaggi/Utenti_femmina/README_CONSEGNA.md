# Utenti femmina — Concept 01 approvato

Modello approvato da Juri con «Perfetti», 17 novembre 2026. Nuova visuale navy/avorio/verde petrolio. Profilo human AOP_CHAR_RIGID_1, scala 1:1, origine ai piedi, GLB +Y alto/+Z avanti, altezza circa 1,7655 m. La selezione estetica non costituisce approvazione delle deroghe tecniche.

## File principali

- female_base.blend: sorgente singolo, senza arredi/camere/luci, nomi contrattuali e root locali.
- female_base.glb: avatar autosufficiente con una sola acconciatura iniziale (long).
- female_base.manifest.json: controlli, gerarchie, ruoli materiali, sostituzione capelli e provenienza.
- female_base.reimport.blend: verifica in file separato del GLB effettivamente esportato.
- hair/: sette componenti GLB e relativi sorgenti Blender, short/long/bun/spiky/curly/ponytail/bald; CATALOG.json con ID stabili, hash, compatibilita tra entrambe le nuove basi e agganci. Bald e senza geometria.
- views/: render reali del modello approvato dopo reimportazione, viste senza capelli, prima persona, sei pose e confronto uomo/donna. Il confronto contiene entrambi solo come immagine; in questo pacchetto e presente soltanto la base femmina.
- build_scene.py, character_design.py, concept_style.py, support.py, delivery_runtime.py, resources/: ricostruzione completa da geometria procedurale e scaffold incluso, senza download, moduli esterni o percorsi assoluti al PC autore.
- assemble.py: sostituzione di una sola acconciatura; conserva le normali della base approvata.
- verify_package.py, geometry_reader.py, APPROVED_GEOMETRY.json: controlli sulla geometria approvata nelle otto pose, GLB, componenti e inventario.
- VALIDATION.json, BUILD_REPORT.json, MODULAR_QA.json, ASSEMBLER_CLI_QA.json, PORTABILITY.json: prove e limiti. PREVIOUS_ROUNDTRIP_EVIDENCE.json conserva i confronti con la precedente base eseguiti nella fase di design, senza includere vecchi avatar.
- checksums.json: SHA-256 di tutti gli altri file del pacchetto. Non include se stesso; il suo hash e nella ricevuta di pubblicazione esterna.

## Personalizzazione e parti rigide

Nove canali invariati: skin→char_mat_skin, hair→char_mat_hair, eyebrows→char_mat_eyebrows, iris→char_mat_iris, clothing→char_mat_clothing, shirt→char_mat_shirt, tie→char_mat_tie, pants→char_mat_pants, shoes→char_mat_shoes. Clothing e solo la giacca con revers/tasche/bottone; pants comprende i pantaloni superiori sul torso maschile oppure la gonna femminile. Scarpe separate dai materiali facciali char_mat_dark/char_mat_white. Accent→char_mat_accent colora soltanto i segni alla tempia, indipendentemente da occhi e cravatta. Bow→char_mat_bow e il fiocco fisso femminile: colore indipendente, sotto char_head e fuori dai capelli.

Capelli sostituibili sotto char_hair, sopracciglia sotto char_head. Una mesh e un solo materiale per ciascuno stile; agganciare il componente con posizione/rotazione locali nulle e scala1. Rimuovere prima la geometria capelli precedente. Bald lascia intatti testa, occhi, sopracciglia e fiocco femminile. I due pacchetti contengono gli stessi componenti capelli. Non nascondere char_head per cambiare acconciatura.

Testa/occhi/bocca, torso, braccia/mani e gambe restano separati secondo il contratto. Nascondere ricorsivamente char_head e le due braccia preserva torso e gambe. Niente armature, skin, morph, clip o root motion. Le funzioni applicative saranno adattate separatamente.

## Comandi riproducibili

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
blender --background --factory-startup --python assemble.py -- --style ponytail --out assembled.glb --blend
python -B verify_package.py
```

Il primo comando ricostruisce la nuova figura e i sette componenti in una cartella separata. La ricostruzione isolata ha prodotto otto GLB byte-identici. L'assemblatore usa solo il pacchetto e accetta anche --base per un'altra base compatibile. La verifica restituisce 0 se integrita e controlli funzionali passano; il JSON continua a riportare FAIL per il budget, senza confonderlo con conformita tecnica completa.

## Esiti effettivi

PASS: geometria/materiali del risultato approvato invariati nelle otto pose, GLB autonomo, gerarchie/pivot/TRS e scala, reimportazione in file separato, modifica indipendente dei materiali, separazione prima persona, sette acconciature assemblate/esportate/reimportate su questa base, agganci locali identita, corpo invariato durante la sostituzione capelli, CLI e ricostruzione isolata. Le prove di posa verificano trasformazioni finite; non certificano tutte le intersezioni.

FAIL: budget originale 8 materiali/24 primitive e precedente riferimento 11/25. Questa base completa iniziale usa 13 materiali, 27 primitive e 973 triangoli. Gli altri controlli statici del kit passano. Deroga tecnica: NOT_RUN/non dichiarata approvata; validatori originali invariati.

NOT_RUN: QA applicativa e matrice visiva completa di tutte le intersezioni capelli/vestiti nelle pose e nelle rotazioni della testa. Nessuna integrazione o installazione applicativa inclusa. L'approvazione artistica del modello iniziale e PASS.

Risorse scaffold/strumenti MIT: resources/LICENSE_SOURCE.txt. Design originale per Juri. Le vecchie versioni sono escluse da questa cartella attiva e preservate separatamente fuori da essa prima della sostituzione.
