# Atrio e ordine dei piani

L'Atrio è il piano terra permanente (`@lobby`), accessibile dall'ascensore anche
senza progetti. Gli uffici occupano i piani intermedi, dal primo in su, e la
Sala server (`@server-room`) occupa il penultimo piano fisso, seguita dalla
Sala riunioni (`@roof`) sempre in cima. Con zero uffici l'edificio contiene comunque
Atrio, Sala server e Sala riunioni. Nessuno dei tre spazi può
essere rimosso come un progetto.

La destinazione d'ingresso già esistente ora apre il modello in
`sala_atrio/delivery/atrium.glb`: reception, due salottini con dieci posti
utilizzabili, consolle, quattordici piante e pannello aziendale dietro la reception.
Il pannello dietro la reception può mostrare testo centrato o un logo aziendale. WASD permette di girare; E usa l'ascensore o una
seduta. Posizione e spazio vengono ripristinati dopo la riconnessione.

Dietro il banco sono presenti i due personaggi consegnati in `Personaggi/Atrio/`:
capelli biondi a sinistra e castani a destra guardando la reception. Sono presenze
decorative fisse, in piedi, senza compiti o interazioni; non sono utenti connessi
o processi agente e non occupano posti nei salottini. Sono visibili anche senza
uffici configurati e nelle rappresentazioni esterne dell'Atrio.

Le istanze sono a x ±1,10 m, y 0, z −10,80 m, rivolte verso +Z; solo le istanze
sono scalate a 1,15, mentre i GLB e i rig rimangono a scala 1. Le tinte originali
e i materiali multipli dei volti vengono adattati al toon con materiali separati
per istanza. I loro ingombri statici partecipano alle collisioni e ai percorsi
dell'Atrio. L'import riproducibile `python -B scripts/import-reception-staff.py`
verifica l'inventario SHA-256 della consegna, preserva gli originali e genera
soltanto i due asset runtime e `src/shared/reception-staff.ts`. Le verifiche del
produttore restano distinte dai successivi controlli nell'applicazione.

La cabina applicativa riempie il volume riservato dal modello. Le collisioni
comprendono i box del manifest e i limiti trasformati delle geometrie di
architettura, reception e arredi originali. Il GLB è già Y-up: la conversione
Blender `(x,z,-y)` si applica soltanto ai dati del manifest. Le vetrate usano
lo stesso vetro trasparente degli uffici; meteo e ciclo giorno/notte proseguono
all'esterno. La rappresentazione esterna dell'edificio include l'Atrio alla
quota della strada, con gli uffici e la Sala riunioni sopra.

Terreno e piazzale esterni lasciano libera l'impronta dell'edificio: il parquet
originale è a quota zero e i tre tappeti sono rialzati di pochi millimetri.
Un piano esterno sovrapposto coprirebbe questi dettagli; la geometria del GLB
rimane alla quota consegnata, senza compensazioni o spostamenti degli arredi.

Le scale del modello sono geometria collidibile; per passare ad altri piani
si usa l'ascensore. Il loro collegamento tra ambienti e le altre
rifiniture saranno interventi successivi. Questa integrazione non abilita
agenti, postazioni reception operative o la lavagna della Sala riunioni.

Per importare nuovamente la stessa consegna:

```sh
python3 scripts/import-atrium.py
npm run typecheck
npm test
npm run build
```

L'import verifica i 22 elementi elencati dal manifest del pacchetto (24 file
complessivi, inclusi i rapporti di copia), conserva GLB/Blender originali e
genera `src/shared/atrium-data.ts`. I rapporti del produttore non vengono
riscritti: i limiti delle sue verifiche restano distinti dai test applicativi.

## Pannello reception

Da **Impostazioni → Logo atrio**, un amministratore può scegliere Vuoto, Testo
oppure Logo direttamente nella scheda. Il pannello 3D non espone scorciatoie o
suggerimenti di interazione alla reception, lasciando libero questo spazio per i
futuri compiti degli NPC. Il testo è centrato sui due assi e si adatta
automaticamente alle dimensioni, anche su più righe (massimo 400 caratteri e 6 righe).
Il logo viene caricato dal computer in PNG/JPEG/WebP, fino a 2 MiB e 4096 × 4096 pixel,
centrato senza deformazioni o ritagli. L'anteprima consente di verificare il risultato
prima di salvare. Rimuovi logo elimina anche l'immagine salvata; cambiare modalità
conserva il testo e il logo per riutilizzarli.

La configurazione è unica per l'edificio, funziona anche senza uffici e si aggiorna
per tutti i visitatori. Viene salvata atomicamente in `<dataDir>/reception-sign.json`
con l'immagine; i WebSocket trasmettono soltanto i metadati. Il file immagine viene
servito dalla sessione autenticata tramite `/api/reception-sign/logo?id=<hash>`.
Il GLB e la sua superficie da 7,44 × 1,70 m restano invariati; una sola texture condivisa
aggiorna anche le rappresentazioni esterne dell'Atrio. La lavagna della Sala riunioni
è un intervento separato.
