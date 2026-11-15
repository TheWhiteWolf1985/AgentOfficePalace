# Agent Office Palace — kit Blender sala riunioni 1.0.0

Pacchetto portatile per affidare a Codex la modellazione della sala sul tetto. Baseline software 0.1.0, commit ab4040a. Il pacchetto non contiene la sala finita e non applica modifiche al software.

1. Estrai tutto lo ZIP in una cartella dedicata e aprila come progetto nella nuova chat Codex.
2. Incolla `PROMPT_CODEX.md`. Il modello deve leggere `AGENTS.md`, `rules/CONSTRAINTS.md`, `rules/constraints.json` e `rules/DELIVERY.md` prima di lavorare.
3. Fornisci a quel Codex le tue indicazioni visive. Stile, disposizione, numero di posti e arredi li decide Juri: il kit non li inventa.
4. Per vedere subito i riferimenti in Blender puoi importare `reference/starter_reference.glb` con File > Import > glTF 2.0. E solo una guida: non e il modello della sala e non va esportato nella consegna.
5. In alternativa, in un file Blender dedicato esegui `scripts/create_starter.py` dal Text Editor, impostando KIT_ROOT nel codice al percorso della cartella estratta. Lo script aggiunge guide e una gerarchia di lavoro vuota, senza cancellare oggetti esistenti o salvare sopra file aperti.
6. Il Codex salva sorgenti modificabili in `work/` e consegna soltanto quanto previsto in `delivery/`. Esegue i controlli e dichiara quali restano manuali.

## Contenuto

- `AGENTS.md`: istruzioni vincolanti per il Codex che crea il modello.
- `rules/CONSTRAINTS.md` + `constraints.json`: geometria, coordinate, parti interattive e confini; separano obblighi, raccomandazioni e liberta visive.
- `rules/DELIVERY.md`: nomi e formato della consegna, manifest e prove richieste.
- `reference/`: GLB guida importabile, pianta SVG/PNG e note di integrazione.
- `scripts/create_starter.py`, `validate_scene.py`, `export_asset.py`: strumenti Blender da eseguire nel suo Python.
- `scripts/inspect_glb.py`, `verify_kit.py`: controlli eseguibili con Python standard, senza installare pacchetti.
- `templates/`: manifest da compilare e stato delle verifiche; non sono risultati PASS.
- `verification/PACKAGE_VALIDATION.json`: controlli effettivamente eseguiti sul kit, con limiti dichiarati.

## Tre distinzioni obbligatorie

- **File modello valido** non significa **sala gia integrata nel software**: sessioni persone/agenti, lavagna condivisa, meteo interno e logica dei meeting saranno sviluppati nel repository applicativo.
- Un controllo automatico del kit non prova da solo tutti i requisiti: accessi, lavagna, camera, copertura e stile vanno anche verificati visivamente e documentati.
- Il limite attuale di cinque agenti riguarda i meeting del software esistente, non la geometria della nuova sala. Non imporre cinque sedie al modello.

Non e stato reperito un eseguibile Blender nel PATH o nei percorsi standard controllati dell’ambiente che ha preparato questo ZIP. Gli script Blender sono stati controllati sintatticamente, ma vanno eseguiti e verificati nel Blender effettivamente usato per la modellazione; non e incluso un .blend fittizio. Il GLB guida e invece un file reale, sottoposto a controlli di struttura e caricamento.
