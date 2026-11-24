# Integrazione dell'ufficio ridisegnato

Versione2026-11-23-r06. Base applicativa di provenienza066fda8644f7d7896c5ddf1dd16c61f3d377a449. I sorgenti applicativi storici, i generatori del vecchio ufficio e le vecchie viste non fanno parte di questa cartella attiva. Il sorgente grafico corrente è ufficio.blend.

## Coordinate e parti conservate

Metri, origine al centro del piano. Ambiente36×26m, pavimentoZ0 Blender, soffitto6,80m, interpiano7,10m. Soppalco9×5m aZ3m, ascensore2,60×2,40m. Conversione Three/glTF→Blender(x,-z,y). Le64 ancore di gruppo/seduta/portatile/stage delle16 scrivanie base coincidono con la provenienza entro1mm. Preservati boss-chair, sedute della saletta e del salotto, ante e pivot dell'ascensore e della saletta. Le ali conservano le postazioni17–20 e gli esportati usano gli ID canonici anche dove Blender aggiunge suffissi per distinguere le alternative.

## Modifiche intenzionali richieste da Juri

| Elemento | Stato corrente e intervento applicativo |
|---|---|
| Scala esterna, uscita verde, terrazza e porta vetrata | Rimossi; vani richiusi con parete e battiscopa. Disattivare vecchi accessi, ante, sedute esterne, salto dal balcone, percorsi e collider delle strutture esterne rimosse. |
| Gong | Geometria rimossa; disattivare interazione/animazione collegate. |
| station-issues, station-pulls, station-queue | Tre chioschi rimossi. Le quattro lavagne operative rimangono; non ricreare chioschi o agenti/punti d'uso invisibili. |
| superficie_macchina | Monitor rimosso. Non cercare questo nodo nel GLB e non ricrearlo automaticamente. |
| Cartello expand | Rimosso anche dalle ali; l'eventuale comando d'espansione va gestito dal software senza ripristinare il cartello. |
| Pianta zona ampliamento | Rimossa quella a Three(x14,2,z-12,2). |
| Libreria bookshelf | Centro Blender(-4;-12,79;0), Three(-4;0;12,79). Tre campate da1,70m, ingombro massimo5,18×0,47×2,37m. Punto d'uso Three(-4;0;11,59), raggio originario1,60m. Applicare i nuovi ingombri e aggiornare BOOKSHELF/navigazione. |
| Insegne Mesh_342 e Mesh_343 | Capo Ufficio senza corona, testo in geometria. La targhetta CAPO sulla scrivania è invariata. |
| Pavimenti e arredi | Quote/agganci invariati; piani standard2,14×1,06m a0,78m e nuove forme. Allineare i collider forniti e collaudare il contatto degli avatar con le sedie. |

Queste sono deroghe esplicite alla conservazione del vecchio balcone/uscita/chioschi/nona superficie. Il verificatore originario che li richiedeva non è stato alterato per dichiarare conformità: è conservato nel backup del kit precedente. Il nuovo verificatore controlla la configurazione corrente dichiarata.

## Materiali e superfici aggiornabili

Mantenere i ruoli Parete_palette, Finitura_palette, Parquet_palette e i suffissi delle varianti. Il parquet corrente usa una texture incorporata con UV metriche, non una risorsa esterna. I nuovi materiali ufficio_coordinato_* e ufficio_insegna_* devono essere riconosciuti dal mapper del renderer; i colori/shader/texture incorporati sono il riferimento per evitare colori di ripiego o doppi effetti toon. La palette sRGB aggiornata è nel manifest e nel layout.

Il vetro condiviso ufficio_coordinato_server_v12_access_mat_glass ha alpha0,12 e modalitàBLEND nel GLB. Conservare trasparenza e ordine di rendering; i due campioni delle ali usano la stessa finitura. Non sostituirlo con un materiale opaco.

Le otto superfici indipendenti con UV sono superficie_issues, superficie_pulls, superficie_queue, superficie_services, superficie_tv, superficie_riunioni, superficie_targa_riunioni e superficie_lavagna_condivisa. I loro contenuti restano gestiti dall'app; le texture di anteprima non implementano servizi live.

## Collisioni, moduli e controlli ancora necessari

riferimenti/layout_ufficio.json contiene le configurazioni aggiornate con collider proposti: escluse terrazza/scala esterna/terreno esterno, chioschi, gong e pianta rimossa; chiusi i due vecchi vani; aggiornata la libreria e la larghezza dei nuovi piani. Non importare le vecchie collisioni dal backup. Le guide Blender sono ricostruite dagli stessi dati del piano base e sono solo consultive.

Il piano GLB include i soffitti separati; il renderer deve applicare la propria gestione di visibilità delle quote. Le varianti sostituiscono gruppi della base, non si sommano tutte insieme. Le chiusure permanenti delle vecchie porte restano nella base anche sostituendo un modulo di collegamento.

Eseguiti: riapertura del .blend, confronto con il disegno approvato, incorporamento immagini,64 ancore, otto superfici UV, struttura autosufficiente e reimportazione degli11 GLB, visione delle sei immagini. NON ESEGUITI: caricamento nell'app, mapper materiali finale, navigazione/collisioni, sedute degli avatar, porte/interazioni, tutte le combinazioni dei moduli a runtime. Nessuna pubblicazione dell'applicazione è inclusa.
