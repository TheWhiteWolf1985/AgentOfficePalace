# Sala server

La Sala server è un piano permanente (`@server-room`), indipendente dai progetti.
Dal basso l'edificio contiene Atrio, zero o più uffici, Sala server e Sala riunioni.
Ascensore, elenco dei piani, menu, palette e vista 2D consentono di raggiungerla
anche senza uffici. Aggiungere o rimuovere progetti non elimina gli spazi comuni.
La posizione viene ripristinata nella stessa stanza alla riconnessione.

La stanza usa la consegna v12 in `sala_server/`: 36 × 26 m, soffitto a 5,2 m,
60 rack, sei estrattori statici, parete vetrata, due postazioni con sedute,
banco manutenzione e tre pannelli interni. Il GLB è già Y-up; soltanto i dati
del manifest passano da Blender `(X,Y,Z)` a `(X,Z,-Y)`. Colori, UV, vetri e
trasformazioni del modello rimangono quelli consegnati.

WASD permette di camminare; E presso una sedia permette di sedersi o alzarsi.
Il banco, i rack, la parete vetrata e il perimetro partecipano alle collisioni.
La cabina dell'ascensore è applicativa, nel vano riservato dalla consegna.
La porta della partizione si apre automaticamente quando qualcuno si avvicina
da uno dei due lati, lasciando visitabile la zona rack. Questo comportamento
provvisorio non implementa controllo degli accessi o verifica di codici.

Il tastierino, gli schermi delle postazioni e i tre pannelli di monitoraggio
mantengono la geometria predisposta. PIN, autorizzazioni, monitoraggio dinamico,
collegamenti ad agenti/container e animazione delle ventole sono interventi futuri.
I pannelli non diventano lavagne condivise degli uffici. La lavagna e la
presentazione della Sala riunioni restano separate e operative.

Il modello completo si carica alla prima visita e viene riutilizzato. Dagli
altri piani si scarica soltanto un involucro derivato da circa 147 KB, senza
buffer di rack o attrezzature, rispetto ai circa 3,5 MB del GLB originale.
I materiali e i buffer dell'involucro sono condivisi fra le copie. Il batching
del modello percorribile conserva la porta mobile, le sedute, il tastierino,
gli schermi e i pannelli; le porte decorative dei rack sono statiche.
L'altezza fra Sala server e Sala riunioni segue il soffitto consegnato e la
soletta, senza introdurre uno spazio vuoto alto quanto un piano ufficio.

Per importare nuovamente la stessa consegna:

```sh
python3 -B sala_server/verify_delivery.py
python3 -B scripts/import-server-room.py
npm run typecheck
npm test
npm run build
```

L'import verifica i 25 elementi elencati nell'inventario originale (27 file
complessivi), copia il GLB e genera `server-room-data.ts` e l'involucro compatto.
Sorgenti Blender, manifest, script, viste e rapporti del produttore sono
versionati senza modificarne i byte. `VALIDATION.json` rimane la dichiarazione
del produttore: le prove applicative sono registrate separatamente.
