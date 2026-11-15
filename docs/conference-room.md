# Sala riunioni

Il piano condiviso è raggiungibile dall'ascensore e dal menu dell'edificio anche
senza progetti configurati. Non crea un ufficio, un repository o un agente.
Il codice conserva la destinazione `@roof` per le posizioni già salvate;
`@lobby` riporta all'ingresso. Chi visita la sala vi rimane anche quando viene
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
La lavagna è una superficie dedicata predisposta per il prossimo collegamento:
questa integrazione dello spazio non aggiunge ancora editor condiviso, sessioni
di riunione o postazioni operative per agenti nella nuova sala.

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
