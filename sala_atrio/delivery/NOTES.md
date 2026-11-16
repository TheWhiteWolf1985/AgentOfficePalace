# Sala atrio — consegna asset v03

Versione del 16 novembre 2026, Blender 5.3.0. Modello dell'ingresso di Agent Office Palace, esportato su richiesta di Juri dopo le modifiche all'arredo e alla parete del logo.

## File da usare

- `delivery/atrium.blend`: sorgente modificabile, scena `AOP_Sala_Atrio_v03`.
- `delivery/atrium.glb`: GLB 2.0 autosufficiente della sola gerarchia `atrio_root`.
- `delivery/atrium.manifest.json`: misure, materiali, volume ascensore, scala, arredi, superficie logo, ancoraggi e box di riferimento.
- `delivery/build_scene.py` e `delivery/enrich_lobby.py`: costruzione riproducibile. Conservare i due script nella stessa cartella.
- `delivery/preview_and_export.py`, `delivery/render_views.py` e `delivery/geometry_fingerprint.py`: strumenti per esportare, reimportare, renderizzare e confrontare le geometrie.
- `delivery/VALIDATION.json` e `delivery/DRAFT_CHECKS.json`: esiti dei controlli e limiti effettivi.
- `delivery/views/entrance.png`, `reception.png`, `top.png`: viste della geometria consegnata. Nella pianta il soffitto è temporaneamente escluso.
- `delivery/reimport_check.blend`: prova della reimportazione in una scena separata.
- `verification/`: impronte della scena e della ricostruzione indipendente, con rapporto di confronto.
- `PACKAGE_MANIFEST.json` e `COPY_VERIFICATION.json`: inventario e verifica SHA-256 del pacchetto copiato.

## Contenuto del modello

Base interna 36 × 26 m, metri, pavimento finito Z=0, altezza interna proposta 5,2 m. Bancone curvo centrato sulla parete lunga nord; entrando dal lato sud, scale a sinistra e vano ascensore a destra. Colori e forme coerenti con la sala riunioni.

Arredo: due postazioni reception, due panche laterali, due divani, quattro poltrone, due tavolini centrali e due laterali, due consolle, tappeti, controsoffitti illuminati e quattordici piante totali. Dieci posti d'attesa aggiunti hanno ancoraggi `atrio_lounge_seat_*` e punti di uscita `atrio_lounge_stand_*` descritti nel manifest.

La scritta dietro il bancone è stata eliminata. `atrio_company_logo_surface` è una superficie rettangolare separata di 7,44 × 1,70 m, con UV 0..1 e materiale `atrio_mat_logo_blank`, senza immagine. Il caricamento del logo aziendale verrà realizzato in altra sede; il modello conserva soltanto la predisposizione geometrica. Il supporto è `atrio_logo_backing`.

Il vano ascensore è un intaglio libero come nella sala riunioni: X[7,2;9,8], Y[10,6;13], aperto anche attraverso pavimento, soffitto e parete perimetrale fino al bordo esterno. Non aggiungere portale, tamponamenti, fondale, cabina o porta nell'asset: l'ascensore viene generato dall'applicazione.

## Integrazione

Blender usa +Z in alto e nord +Y. Il GLB è Y-up: coordinate applicative `(x,y,z) = (x,z,-y)` da Blender. Non applicare una seconda rotazione globale. Nodi architettura, soffitto, arredi e ancoraggi rimangono separabili. Guide, camere e luci di presentazione sono escluse dal GLB. Le luci di anteprima non costituiscono l'illuminazione runtime.

Il manifest contiene box geometrici di riferimento, non un sistema di collisione implementato. La scala è una bozza a due rampe da 15 alzate ciascuna; arrivo superiore a 5,2 m. Collegamenti ai piani, navigazione, interazioni, materiali nel renderer applicativo e inserimento del logo richiedono l'integrazione software. Nessun test nell'applicazione o verifica normativa della scala è stato eseguito.

Il kit tecnico della sala riunioni non è il contratto dell'atrio: nomi, lavagna e requisiti specifici di quell'asset non sono stati imposti a questo modello. `ready_for_final_delivery=false` nel rapporto conserva i limiti della bozza tecnica e dei test applicativi; la copia del pacchetto è stata richiesta esplicitamente da Juri.

## Ricostruzione

Nessuna dipendenza Python esterna o risorsa online. Dalla radice del pacchetto:

```text
blender --background --factory-startup --python delivery/build_scene.py -- --output-dir work/ricostruzione
blender --background work/ricostruzione/atrium.blend --python delivery/preview_and_export.py
```

Usare una cartella nuova per la ricostruzione. Il builder rifiuta di sovrascrivere un file già presente. Il confronto fra scena live e ricostruzione indipendente ha verificato identità di geometria valutata, gerarchia, trasformazioni e materiali assegnati su 532 nodi.

## Perimetro della consegna

Il pacchetto contiene il modello attuale e le dipendenze per ricostruirlo e verificarlo. Non contiene la cronologia delle bozze, il contesto AI personale, credenziali, configurazioni di accesso o il codice dell'applicazione. L'esportazione non esegue deploy né integra automaticamente il modello nel software.
