# Consegna del modello

Dentro delivery/:

- conference_room.blend: sorgente modificabile, con gerarchia, guide/collider separati e oggetti nominati.
- conference_room.glb: asset visibile finale, senza guide/collider/camere/luci di anteprima o risorse esterne.
- conference_room.manifest.json: compilato a partire dal template; unità, versione Blender, altezza, nodi, posti/uscite, lavagna, materiali e collider numerici, deroghe esplicite.
- build_scene.py: script riproducibile della modellazione secondo il design approvato, senza percorsi assoluti del computer dell'autore; eventuali dipendenze vanno documentate e incluse quando necessarie.
- VALIDATION.json: controlli automatici e manuali effettivi, comandi, esito, versione Blender, errori/limiti. Nessun PASS precompilato.
- views/top.png, views/entrance.png, views/whiteboard_from_seat.png: viste del modello effettivo, non immagini del solo scaffold o del GLB guida.

Usare templates/conference_room.manifest.json e templates/VALIDATION.json. Campi null/[] indicano dati ancora da compilare e non una scelta di design. source_contract deve rimanere1.0.0 salvo deroga dichiarata; tutti i nomi dichiarati devono esistere nel file esportato.

## Controlli

1. Eseguire scripts/validate_scene.py dal Python di Blender sulla scena finale con il root corretto; salvare l'output.
2. Usare scripts/export_asset.py per esportare solo l'asset e generare misure/elenchi del manifest, oppure applicare esattamente lo stesso contratto con un exporter verificato. Lo script non salva il .blend al posto dell'autore e non crea il design.
3. Eseguire `python scripts/inspect_glb.py delivery/conference_room.glb --contract rules/constraints.json --manifest delivery/conference_room.manifest.json --report delivery/glb_check.json`.
4. Reimportare il GLB in un file Blender separato: confrontare posizione ascensore, misure, gerarchia, ancoraggi, materiali e orientamento/UV della lavagna; non usare solo il .blend sorgente come prova dell'export.
5. Review manuale di tutti i punti in manual_checks_required: volume ascensore libero, percorso e uscite sedute, lavagna visibile/UV non specchiate, normali corrette, assenza z-fighting, chiusura/coprimento dal meteo e conformita al design di Juri. Gli strumenti non certificano questi punti per semplice assenza di errori automatici.
6. Compilare VALIDATION.json includendo i file di prova. Dichiarare le verifiche non eseguite; in quel caso il modello non e ancora pronto alla chiusura della consegna.

Il conteggio dei posti non e determinato dal template. L'assegnazione persone/agenti avverra nel software: non generare agenti, CLI o sessioni per provare la geometria.
