# Uso degli strumenti

Eseguire dalla radice estratta del kit. Il comando `blender` indica l'eseguibile del Blender effettivamente usato; Codex deve risolverne il percorso senza fingere che sia installato.

## Avvio interattivo

Aprire un file dedicato in Blender. Nel Text Editor aprire create_starter.py, impostare KIT_ROOT al percorso della cartella estratta ed eseguire. Lo script aggiunge i riferimenti e una gerarchia vuota, senza cancellare la scena o salvare un file sopra il lavoro esistente. Il default Cube eventualmente presente non appartiene al root dell'asset e non va incluso nella consegna.

Alternativa senza script: importare reference/starter_reference.glb come guida. I nodi ref_* restano fuori dal root dell'asset e non vanno esportati. Non serve importare la guida se e gia stata creata da create_starter.py.

## Verifica della scena finale

Dopo aver salvato il modello e compilato delivery/conference_room.manifest.json:

```text
blender --background work/conference_room.blend --python scripts/validate_scene.py -- --kit . --manifest delivery/conference_room.manifest.json --report delivery/scene_check.json
```

Oppure eseguire il file da Blender passando il percorso del kit; il parametro --kit risolve i percorsi. Gli errori devono essere corretti senza alterare il contratto per nasconderli.

## Export

```text
blender --background work/conference_room.blend --python scripts/export_asset.py
```

L'exporter legge il manifest compilato, verifica la scena, esporta solo root e discendenti e aggiorna misure dei posti/materiali/statistiche. Non genera il design, non salva il .blend sorgente e non supera le review manuali. Se un parametro dell'exporter installato non e disponibile, il comando fallisce esplicitamente invece di ignorarlo.

## Controlli Python standard

```text
python scripts/verify_kit.py
python scripts/inspect_glb.py reference/starter_reference.glb --reference
python scripts/inspect_glb.py delivery/conference_room.glb --contract rules/constraints.json --manifest delivery/conference_room.manifest.json --report delivery/glb_check.json
```

Il flag --reference e solo per la guida del kit. Non usarlo per dichiarare conforme l'asset finale. Una guida non supera il profilo production_asset.

## Esempi di righe manifest da compilare sul modello reale

```json
{
  "seats": [
    {
      "anchor": "seat_001",
      "stand": "stand_001",
      "allowed_occupants": ["person", "agent"],
      "position_blender_m": [0.0, 0.0, 0.5],
      "stand_blender_m": [0.0, -1.0, 0.0],
      "facing_blender": [0.0, -1.0, 0.0]
    }
  ],
  "colliders": [
    {
      "id": "col_example",
      "min_blender_m": [-1.0, -1.0, 0.0],
      "max_blender_m": [1.0, 1.0, 0.8],
      "role": "example_only"
    }
  ]
}
```

Questi valori sono esempi del formato, non una disposizione proposta e non collider da copiare nella consegna. Modificarli in base al modello. I punti numerici dei posti vengono aggiornati dall'exporter; le dimensioni e posizioni dei collider devono descrivere le geometrie reali e restano responsabilita dell'autore.
