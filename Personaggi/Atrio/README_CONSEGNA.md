# NPC Atrio — Concept 02 approvato

Approvazione estetica di Juri: «Perfetto», 17 novembre 2026. Due donne distinte: bionda con capelli lunghi, occhi azzurri e fiocco; castana con caschetto, occhi verdi e cerchietto. Incarnato piu caldo, occhi umanizzati, sorriso, giacca avorio sagomata senza revers con dettagli cobalto, gonna antracite e tacchi.

## Uso e file

Entrambi sono NPC decorativi permanenti IN PIEDI nel profilo human AOP_CHAR_RIGID_1. Nessuna mansione, AI, percorso, persona connessa o funzione software inclusa.

- reception_a.blend e reception_b.blend: sorgenti singoli, nomi contrattuali, origine locale ai piedi, scala1. Nessuna stanza/camera/luce.
- reception_a.glb e reception_b.glb: GLB autosufficienti, +Y alto/+Z avanti; rispettivi manifest con controlli/mesh/materiali/provenienza.
- reception_a.reimport.blend e reception_b.reimport.blend: reimportazione del GLB effettivamente esportato in file separati.
- reception.placements.json: file originale invariato, separato dagli asset. Scala istanza1,15 per i soli due NPC, mai incorporata nei vertici o nel root.
- npc_concept02.review.blend: confronto delle due nuove figure. Prefissi e spostamenti esistono solo nella scena di confronto.
- npc_concept02.fit.review.blend: prova separata nell'Atrio originale, con riferimento incluso solo nella preview; nessun arredo nei GLB dei personaggi.
- views/: render reali dei GLB reimportati, viste singole/comparative, dettagli, capelli nascosti, rotazione della testa, visibilita prima persona e pose tecniche. Le pose sono prove del rig e non aggiungono comportamenti ai NPC.
- build_scene.py, design.py, support.py e resources/: metodo procedurale completo di ricostruzione. Risorse tecniche e Atrio originale inclusi, senza dipendenze dal PC autore, percorsi assoluti o moduli Python esterni. Nessun vecchio avatar incluso.
- BUILD_REPORT.json, FIT_VALIDATION.json, VALIDATION.json e PORTABILITY.json: esiti effettivi e limiti; *.original_check.json conserva i FAIL del validatore originale.
- verify_delivery.py, geometry_reader.py e APPROVED_GEOMETRY.json: controlli sui GLB finali e confronto con la geometria approvata nelle otto pose.
- checksums.json: SHA-256 di tutti gli altri file; il suo hash e nella ricevuta esterna di pubblicazione.

## Suddivisione e personalizzazione

Nove canali precedenti preservati con nomi esatti: skin→char_mat_skin; hair→char_mat_hair; eyebrows→char_mat_eyebrows; iris→char_mat_iris; clothing→char_mat_clothing; shirt→char_mat_shirt; tie→char_mat_tie; pants→char_mat_pants; shoes→char_mat_shoes.

Clothing colora solo la giacca; shirt blusa e polsini scuri; tie la piccola chiusura al collo; pants la gonna; shoes i tacchi indipendentemente dal volto. Accent/char_mat_accent colora soltanto il bordo cobalto. Char_mat_dark e char_mat_white restano materiali facciali separati, la linea decorativa della guancia appartiene ai dettagli facciali scuri. Tinte uniformi, nessuna texture dei colori personalizzabili.

Capelli: una mesh separata sotto char_hair, sostituibile, testa completa al di sotto. Sopracciglia: char_eyebrows_visual sotto char_head, esterne ai capelli. Fiocco bionda: char_bow_visual/char_mat_bow; cerchietto castana: char_headband_visual/char_mat_headband. Accessori sotto char_head, fuori dai capelli, con colore indipendente dal bordo giacca e dagli altri ruoli. Il loro fit e provato sulle acconciature correnti, non su tutte le acconciature utenti.

Controlli, gerarchia, pivot e socket del contratto invariati. Scala1, metri, origine ai piedi; altezza bionda1,7655m, castana1,780m con cerchietto, entro1,85m. Testa/occhi/bocca, torso, braccia/mani e gambe restano rigidi e separati. Nascondere ricorsivamente testa e braccia preserva torso e gambe. Niente armature, skin, morph, clip o root motion.

## Ricostruzione e verifica

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
blender --background --factory-startup --python build_scene.py -- --out rebuilt --skip-views
python -B verify_delivery.py
```

La ricostruzione isolata da una copia di codice/risorse ha prodotto entrambi i GLB byte-identici. Il primo comando ricrea anche immagini e preview, il secondo solo asset e verifiche di reimportazione. La verifica del pacchetto consegnato restituisce0 per integrita/controlli funzionali passati; conserva separatamente i FAIL del budget. La rigenerazione scrive nuovi dati, non rigenera automaticamente l'inventario di questa consegna immutabile.

## Esiti

PASS: approvazione artistica; geometria e materiali rispetto al risultato approvato nelle otto pose; GLB autonomi; contratto di controlli/pivot/TRS/assi; reimportazione; colori indipendenti; sopracciglia/accessori fuori dai capelli; separazione prima persona; otto pose finite; ricostruzione isolata. Questi test di posa non certificano tutte le intersezioni.

PASS fit osservato: Atrio originale SHA256 5655594f52a4be97977d7cc98f00f1e514d73de5276de31d095a771fb7da774c; geometria/trasformazioni/materiali invariati nella prova. Raggi da visitatore a1,40m verso entrambi gli occhi e il sorriso visibili. Vista ampia con pannello aziendale libero; banco, monitor, sedie e pannello non spostati. Placements e scala istanza applicati senza modifiche.

FAIL: ciascun personaggio usa13materiali/28primitive, contro budget originale8/24; anche il riferimento11/25 e superato. Gli altri limiti statici originali passano. Nessuna deroga tecnica registrata come approvata; la scelta estetica non cambia i vincoli tecnici. Validatori e constraints originali intatti.

NOT_RUN: QA applicativa, matrice completa delle intersezioni in tutte le pose/accessori, verifica volumetrica completa con tutti gli arredi. Nessuna integrazione, installazione o modifica all'applicazione inclusa. Le consegne utenti non sono modificate da questo pacchetto.

## Provenienza

Design originale per Juri; scaffold/strumenti MIT come resources/LICENSE_SOURCE.txt. Solo le nuove figure e le risorse necessarie sono presenti nella cartella attiva; la versione precedente viene preservata in un backup separato prima della sostituzione.
