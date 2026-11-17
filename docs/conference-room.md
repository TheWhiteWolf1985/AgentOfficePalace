# Sala riunioni

Il piano condiviso è raggiungibile dall'ascensore e dal menu dell'edificio anche
senza progetti configurati. Non crea un ufficio, un repository o un agente.
Il codice conserva la destinazione `@roof` per le posizioni già salvate;
`@lobby` riporta all'[Atrio al piano terra](atrium.md). Chi visita la sala vi rimane anche quando viene
rimosso l'ultimo piano ufficio.

La stanza usa il GLB consegnato in `sala_riunioni/delivery/`: 13 sedute al tavolo,
6 posti lounge, soffitto a 5,2 metri, grande superficie lavagna e porta vetrata.
L'ascensore è quello applicativo, nel volume riservato dal modello. La porta
interna si apre automaticamente da entrambi i lati quando qualcuno si avvicina.
WASD muove il personaggio; E presso una sedia permette di sedersi o alzarsi.
Il meteo e il ciclo giorno/notte restano attivi all'esterno.

Gli ancoraggi e gli 87 collider sono convertiti dal manifest Blender `(X,Y,Z)`
alle coordinate applicative `(X,Z,-Y)`. Il GLB esportato è già Y-up e non riceve
un'altra rotazione globale. I punti `stand` espliciti evitano di alzarsi dentro
il tavolo o altre sedie. Il percorso verso i colleghi usa gli arredi della sala.

Il modello conserva nomi, materiali, colori e UV della consegna. I materiali
vengono adattati al rendering toon, mantenendo la trasparenza della vetrata.
I pannelli blu delle finestre esterne del modello vengono convertiti nel vetro
trasparente usato dagli uffici, con riflessi leggeri e senza ombre opache.
L'adattamento vale anche per la sala vista dai piani inferiori; il pacchetto
Blender originale e le collisioni delle finestre rimangono invariati.
La lavagna è condivisa fra i visitatori della Sala riunioni anche con zero uffici.
Avvicinati al pannello e premi E, oppure apri “Lavagna Sala riunioni” dalla palette
Ctrl+K. L'editor Excalidraw permette testo, disegno, forme, cancellazione, annulla e
immagini, con cursori e partecipanti in diretta. Chi ha l'editor chiuso vede il
contenuto sul pannello 3D. La lavagna degli uffici rimane separata.

Scena e immagini sono conservate in `<dataDir>/shared/conference-room/whiteboard/`;
il riavvio ordinato svuota il salvataggio differito. La rimozione dell'ultimo
ufficio non elimina la lavagna comune. Sulla VM112 il dataDir è
`/var/lib/agent-office-palace/office/.agent-office`. Il salvataggio della scena
è differito di circa due secondi; l'ultimo tratto può andare perso con un arresto
brutale. Restano i limiti esistenti delle lavagne: 20.000 elementi,16 MB di scena,
6 MB per immagine come data URL,64 MB complessivi di immagini.

Il pannello usa una sola texture canvas,2048×691 pixel, adattata alle UV glTF
con flipY=false e materiale leggibile anche di notte. Cornice, geometria,
sedute, vetri e collider non cambiano. Ogni visita all'editor cattura il proprio
spazio: cache immagini, upload e messaggi wb.* sono contestualizzati, e invii o
anteprime obsoleti vengono scartati durante il cambio piano. I messaggi legacy
senza scope restano compatibili; il nuovo client invia sempre il board esplicito.

Le modifiche contemporanee sono riconciliate per elemento/versione/nonce come
negli uffici. Non è un editor dei singoli caratteri in tempo reale. Non vengono
aggiunte sessioni automatiche di riunione o postazioni operative per agenti.

La scena del vecchio locale, bar, bevande, effetti di ubriachezza, DJ, musica,
freccette e lancio dell'ascia sono rimossi, insieme ai rispettivi comandi e dati
di protocollo. I vecchi messaggi di interazione dedicati vengono ignorati.
Il gong e le celebrazioni dei piani ufficio rimangono, così come i suoni e gli
effetti di atterraggio di scale e pali e il suono delle estensioni ufficio.

Per aggiornare gli asset, dalla radice del repository:

```sh
python3 scripts/import-conference-room.py
npm run typecheck
npm test
npm run build
```

Lo script verifica dimensioni e SHA-256 degli elementi elencati nel manifest
del pacchetto, copia il GLB e rigenera `src/shared/conference-room-data.ts`.
Il pacchetto originale, compresi `.blend`, script, regole e rapporti, è
conservato senza conversioni delle terminazioni di riga. La sua `VALIDATION.json`
rimane la dichiarazione del produttore; i controlli applicativi successivi non
la riscrivono né trasformano le review manuali parziali in verifiche complete.
