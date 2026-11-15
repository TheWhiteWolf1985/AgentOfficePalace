# Contratto tecnico obbligatorio 1.0.0

I numeri di riferimento derivano dal software ab4040a. Nomi dei nodi e formato manifest sono un contratto di consegna introdotto da questo kit, non un importer gia presente nell'applicazione. Le indicazioni HARD vanno rispettate; SOFT sono consigli; DESIGN spetta a Juri.

## HARD-01 — Unita, origine e trasformazioni

Metri; 1 unita Blender = 1 metro, scale_length=1. Blender Z alto, nord +Y, fronte di chi siede -Y locale. Origine asset al centro del pavimento finito (0,0,0), non alla quota del tetto dell'intero edificio. Root aop_conference_room con posizione/rotazione zero e scala1. Applicare la scala delle mesh a1; mantenere le rotazioni/posizioni delle parti e l'orientamento degli Empty. Export glTF Y-up: app(x,y,z)=Blender(x,z,-y). Non applicare una seconda rotazione globale di90 gradi al modello.

## HARD-02 — Involucro

Perimetro di progetto X[-18,18], Y[-13,13] (36×26m). La sola architettura perimetrale puo occupare la fascia della soletta X da -18,3 a +18,3 e Y da -13,3 a +13,3; non e spazio aggiuntivo per arredi. Tutte le mesh devono rimanere nell'ingombro esterno. Pavimento finito Z0 con tolleranza0,01m; eventuale spessore va sotto, fino a Z-0,30. Altezza non fissata: dichiarare l'altezza interna effettiva nel manifest; soffitto separato e alto abbastanza per gli avatar. Non allargare o spostare l'edificio per far stare il design.

## HARD-03 — Ascensore e accesso

Riservare il volume verticale sopra X[7,2,9,8], Y[10,6,13] all'ascensore dell'app. Non esportare una seconda cabina/porta e non inserire arredi, muri o superfici di lavagna nel volume; il raccordo di pavimento/soffitto deve essere controllato per non ostruirlo. Porta sul piano Y10,6, centrata X8,5, larga1,4m e alta2,4m, passaggio verso-Y. Non spostare l'accesso e non creare gradini/blocchi davanti alla porta. L'effettiva assenza di intersezioni va verificata anche sulle mesh, non solo sui loro bounding box.

## HARD-04 — Struttura e parti separabili

Gerarchia esportata: root aop_conference_room, con gruppi architecture, furniture e anchors. Sono nomi di oggetti/nodi (Empty), non solo di collezioni Blender. Tutte le parti dell'asset discendono dal root. Pavimento/pareti/soffitto restano identificabili e separabili; indicarne i nomi nel manifest. Non fondere arredi mobili, porte, superficie lavagna o ancoraggi in un'unica mesh statica. Nessuna geometria o rig di persone/agenti: li aggiunge l'app.

## HARD-05 — Lavagna dinamica

Mesh dedicata whiteboard_surface, separata da cornice/supporto, materiale singolo mat_whiteboard_dynamic. Superficie rettangolare piana (un quad o due triangoli, quattro vertici) con UV da0 a1, complete e non specchiate. Non stampare scritte, UI, loghi o disegni nella superficie: il contenuto e dinamico. Normale rivolta verso la zona da cui si legge; verificare la visuale dalle sedute. Dimensioni/proporzioni le decide Juri, senza vincolo16:9 o4×2,2m. Se servono piu facce, una rimane whiteboard_surface e le altre sono dichiarate separatamente nel manifest. Evitare z-fighting con la cornice.

## HARD-06 — Posti e percorsi

Per ogni posto usare un Empty seat_001, seat_002... nel centro della seduta, con -Y locale verso la direzione dello sguardo. Abbinare stand_001, stand_002... a quota pavimento in un punto libero per alzarsi. Nomi e coordinate devono comparire nel manifest; nessun numero massimo di posti imposto dal kit. Nella consegna finale servono posti reali definiti dal design di Juri, non marker fittizi o numeri inventati per superare la verifica. Avatar di riferimento: altezza1,7m, diametro0,64m; un percorso dall'ascensore ai posti deve restare transitabile. Dislivelli oltre0,30m richiedono un percorso esplicito e vanno segnalati, non nascosti nel modello.

## HARD-07 — Collisioni, interni e meteo

Fornire volumi semplici di riferimento per pavimento/pareti/soffitto/arredi e indicarli nel manifest. I collider sono approssimazioni a box; non presumere collisioni automatiche con ogni triangolo del GLB. Helper col_* conservati nel .blend e riportati come box numerici nel manifest, esclusi dal GLB visibile. Pavimento, pareti e soffitto devono consentire una stanza chiusa e una copertura meteorologica coerente. Meteo e giorno/notte globali restano; il loro adattamento al nuovo interno e lavoro software successivo.

## HARD-08 — Materiali e risorse

Materiali con nomi stabili, mappa nome/colore/ruolo nel manifest. La superficie dinamica e esclusa dai materiali statici del design. GLB autosufficiente: nessun file immagine/buffer esterno, percorso locale o URL remoto. Niente Draco, KTX2 o estensioni obbligatorie che richiedano decoder non previsti. Il loader attuale sostituisce i materiali con toon: l'adattamento dei materiali del nuovo modello va dichiarato, non presentato come gia disponibile. Non usare il colore di un render per dimostrare che la palette dell'app e gia configurata.

## HARD-09 — Esportazione e separazione guide

GLB2.0, Y-up; esportare solo root e discendenti previsti. Escludere guide/ref_*, col_*, luci/camere di anteprima, animazioni non richieste, risorse runtime e oggetti preesistenti estranei. Conservare .blend, script riproducibile e manifest. Non sovrascrivere i file di riferimento del kit per far sembrare conforme il modello.

## HARD-10 — Prove e consegna onesta

Seguire DELIVERY.md. Eseguire controlli automatici e review manuali, reimportare il GLB e confrontare scala/posizioni/nodi/UV. Riportare errori e controlli non eseguiti. Il risultato degli script copre soltanto i controlli elencati; non e una certificazione automatica di collisioni, usabilita o integrazione applicativa. Nessuna consegna finale dichiarata conforme con controlli obbligatori pendenti o FAIL.

## SOFT — Raccomandazioni che non impongono il design

Lasciare circa2m davanti all'ascensore; corridoi1,5–2m facilitano il passaggio di piu avatar. Pochi materiali, geometrie riusate, pochi dettagli invisibili, mesh statiche accorpate per materiale. Non e fissato un budget hard di triangoli/MB senza valutare il modello e il client. Registrare statistiche, non inventare risultati prestazionali.

## DESIGN — Decisioni riservate a Juri

Capienza e numero delle sedute, disposizione, posizione/dimensioni della grande lavagna centrale, stile, colori, arredi, altezza desiderata, eventuali schermi aggiuntivi. Il kit non seleziona una soluzione visiva e non reintroduce elementi ludici. Le modifiche a un HARD richiedono un'istruzione esplicita successiva di Juri e una deroga tracciata.
