# Sala server — consegna asset v12

Consegna del 19 novembre 2026, Blender 5.3.0. Aspetto approvato da Juri con la richiesta di esportazione della versione corrente. Questo pacchetto contiene l'asset modificabile e le dipendenze necessarie per ricostruirlo e verificarlo.

## File principali

- `delivery/server_room.blend`: sorgente modificabile, con la sola scena `AOP_Sala_Server_v12`; include asset, guide e strumenti di anteprima separati. Le scene delle iterazioni precedenti sono conservate nel lavoro originale e non incluse qui.
- `delivery/server_room.glb`: GLB 2.0 autosufficiente della gerarchia `server_v12_root`. Guide, camere e luci di presentazione sono escluse.
- `delivery/server_room.manifest.json`: coordinate, nodi, materiali, ancoraggi, box di riferimento e predisposizioni per il software.
- `delivery/build_scene.py`, `build_racks.py`, `build_ventilation.py`, `build_partition.py`, `build_operations.py`: moduli originali di costruzione. Conservarli nella stessa cartella.
- `delivery/check_and_preview.py`, `render_corner_views.py`: controlli Blender, export, reimportazione e viste.
- `delivery/views/`: sei render della geometria consegnata, incluse le due postazioni operative, il banco manutenzione, i raccordi e i due angoli esterni.
- `delivery/DRAFT_CHECKS.json`: risultati effettivi dei controlli Blender. Il suo campo storico sull'approvazione artistica non include la successiva richiesta di esportazione; lo stato aggiornato è in `delivery/VALIDATION.json`.
- `verification/`: impronte di scena approvata, sorgente consegnato e ricostruzione indipendente; rapporto di confronto e strumento riproducibile.
- `PACKAGE_MANIFEST.json`, `COPY_VERIFICATION.json`, `verify_delivery.py`: inventario, ricevuta e verifica SHA-256 dei file del pacchetto.

## Contenuto e coordinate

Base interna 36 × 26 m, pavimento finito Z=0, altezza 5,20 m. Blender usa +Z in alto; GLB Y-up con trasformazione applicativa `(x,y,z)=(x,z,-y)`. Non aggiungere una seconda rotazione globale.

Tre file da 20 rack, totale 60, alti 2,20 m, con porte vetrate e apparati interni. Sei estrattori statici raccordati al soffitto. Tre superfici interne separate per il futuro monitoraggio. Pavimento grigio chiaro in tinta unita, modulo nominale 60 × 60 cm e fughe 4 mm. Tutte le 20 finestre perimetrali condividono il vetro trasparente della partizione.

La zona server è separata da una parete vetrata a X=6,10 m, con porta centrale e tastierino alla destra guardando dall'esterno (+X verso -X). Anta, pivot, maniglie, dodici tasti e display sono separati e descritti nel manifest. I due angoli esterni sud sono chiusi a 90°; il vetro perimetrale è diviso attorno al montante allineato alla divisoria, con giunti di raccordo.

All'esterno: due postazioni PC con quattro piccoli schermi rivolti agli operatori, due sedie con ancoraggi e uscita, banco manutenzione con server aperto, utensili e due armadi chiusi per ricambi e cavi. I grandi pannelli di monitoraggio rimangono i tre interni.

Il vano ascensore X[7,2;9,8], Y[10,6;13] è aperto fino al bordo esterno Y=13,3, attraverso pavimento, soffitto e parete. Cabina, porta e logica dell'ascensore appartengono all'applicazione. Non aggiungere tamponamenti nel vano.

## Ricostruzione e verifica

Non sono necessarie risorse online o dipendenze Python esterne. Dalla radice di una copia locale del pacchetto, usare una destinazione nuova:

```text
blender --background --factory-startup --python delivery/build_scene.py -- --output-dir work/ricostruzione
blender --background work/ricostruzione/server_room.blend --python delivery/check_and_preview.py
blender --background work/ricostruzione/server_room.blend --python delivery/render_corner_views.py
python -B verify_delivery.py
```

I generatori rifiutano di sovrascrivere un sorgente esistente. Le viste overview e angolari escludono temporaneamente la soletta per illustrare l'interno; il soffitto rimane nel `.blend` e nel GLB. Le luci di presentazione non costituiscono l'illuminazione runtime.

La scena consegnata coincide con quella approvata. Una ricostruzione da copia degli script è stata confrontata su geometria, normali, UV, materiali/shader, gerarchia, trasformazioni e proprietà con precisione numerica 1e-6: PASS. I nomi delle UV generate per le scritte sono impostati esplicitamente per eliminare una dipendenza dalla lingua di Blender. Non sono state cambiate forme o coordinate UV. I due GLB non sono identici byte per byte; tale differenza è conservata nel rapporto e non dichiarata PASS di identità binaria.

## Integrazione ancora da realizzare

Il pacchetto non modifica il software. Verifica del codice, autorizzazione, apertura e sincronizzazione della porta, hit test dei tasti, contenuti dinamici dei tre pannelli e delle postazioni, navigazione, collisioni runtime, animazione delle ventole e impianti termici richiedono l'integrazione applicativa. I collider nel manifest sono box geometrici di riferimento; quello della porta è condizionato allo stato chiuso. Le rappresentazioni hardware e degli estrattori non costituiscono un progetto impiantistico dimensionato.

I controlli automatici e la reimportazione sono PASS; l'approvazione artistica è registrata. QA applicativa e verifiche runtime restano non eseguite, come riportato in `VALIDATION.json`. Nessun deploy è stato effettuato.
