# Modello esportato della sala e della lounge

Versione di lavoro del 15 novembre 2026, Blender 5.3.0, contratto 1.0.0. Stato: versione visiva accettata da Juri ed esportata su sua richiesta; verifiche tecniche manuali ancora parziali come dichiarato in VALIDATION.json.

La sala contiene 13 posti al tavolo: 6 per lato e 1 relatore, con 13 PC rivolti alle sedie. Tavolo, lavagna e piante sono centrati a X=-5,4 m sul tratto muro ovest–ascensore. La parete della lavagna ha 14 pannelli alternati; la parete divisoria vetrata e a X=3,6 m, con porta centrale separabile larga 1,8 m e alta 2,6 m. Sul muro sud sono state aggiunte finestre con davanzali e montanti come sui lati corti. Le quattro lampade della sala condividono il modello geometrico delle lampade della lounge.

La lounge esterna, affidata da Juri al modellatore, comprende 2 divanetti biposto, 2 poltrone, 3 tavolini, 4 piante, una consolle e 4 lampade sospese. I 6 posti lounge hanno ancoraggi distinti e `role=lounge`; i 13 posti della riunione conservano la disposizione richiesta. Il manifest distingue i due conteggi.

Riferimento consultato per il raggruppamento delle sedute e dei tavolini: [Steelcase, Adaptable Reception Area](https://www.steelcase.com/space-planning-ideas/workplace/support-spaces/adaptable-reception-area-zs8yu4nc), consultato il 15 novembre 2026. La geometria e procedurale e originale; non sono stati importati modelli di mobili o risorse esterne.

## File e riproduzione

`conference_room.blend` e il sorgente modificabile. La scena dell'asset e `AOP_Sala_Riunioni_v01`; la scena predefinita separata resta nel sorgente ma e esclusa dal GLB. Le guide e i collider sono raccolte distinte fuori dal root esportato. La scena live di Blender e stata aggiornata senza cancellare quella preesistente.

Conservare `delivery/` dentro il kit: lo script usa il template in `templates/`, mentre export e controlli riusano `scripts/` e `rules/`. Nessuna dipendenza Python da installare. Dalla radice del kit, con l'eseguibile Blender disponibile:

```text
blender --background --python delivery/build_scene.py -- --output-dir work/nuova_ricostruzione
blender --background delivery/conference_room.blend --python delivery/export_checked.py
blender --background --python delivery/check_reimport.py
blender --background delivery/conference_room.blend --python delivery/render_views.py
```

La ricostruzione richiede una nuova destinazione e non sovrascrive file esistenti. Il collaudo della ricostruzione e stato realmente eseguito; il log e incluso in `work/repro_square_lights.log`. Le ricostruzioni intermedie restano nel progetto di lavoro originale. Il GLB e stato reimportato in una scena separata, conservata in `work/reimport_check.blend`.

`export_checked.py` applica il contratto dell'exporter del kit, azzerando prima anche le selezioni nelle altre scene. La prima prova aveva rilevato il cubo predefinito selezionato in una scena estranea; l'errore e conservato in `work/glb_initial_export_check.json`. L'export corretto e controllato in `glb_check.json`; gli script originali del kit e il contratto non sono stati modificati.

## Copertura e punti aperti

`scene_check.json`, `glb_check.json` e `reimport_check.json` riportano i controlli automatici realmente svolti: perimetro, gerarchia, ancoraggi, materiali, coordinate, UV, 13 monitor orientati verso le sedie, assenza di triangoli nel vano ascensore e percorsi verso gli stand su griglia con collider a box.

La prova dei percorsi assume la porta della sala aperta e lo dichiara esplicitamente. Il collider della porta chiusa e separato con `active_when=door_closed`. Apertura, interazioni, lavagna dinamica, meteo interno e materiali toon richiedono l'integrazione applicativa successiva.

Le immagini sono render della geometria reale. In `views/top.png` soffitto e lampade sono esclusi solo temporaneamente per mostrare la pianta; il soffitto resta nel sorgente e nel GLB. `views/lounge.png` e una vista aggiuntiva dell'area esterna. Non e stata eseguita una review completa da tutti i posti, una prova di scrittura dinamica sulla lavagna o un test nell'applicazione. `VALIDATION.json` mantiene `ready_for_delivery=false` finche la revisione richiesta non e completata.
