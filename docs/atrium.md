# Atrio e ordine dei piani

L'Atrio è il piano terra permanente (`@lobby`), accessibile dall'ascensore anche
senza progetti. Gli uffici occupano i piani intermedi, dal primo in su, e la
Sala riunioni (`@roof`) rimane sempre sopra l'ultimo ufficio. Con zero uffici
l'edificio contiene comunque Atrio e Sala riunioni. Nessuno dei due spazi può
essere rimosso come un progetto.

La destinazione d'ingresso già esistente ora apre il modello in
`sala_atrio/delivery/atrium.glb`: reception, due salottini con dieci posti
utilizzabili, consolle, quattordici piante e superficie per il futuro logo.
Il pannello logo resta vuoto. WASD permette di girare; E usa l'ascensore o una
seduta. Posizione e spazio vengono ripristinati dopo la riconnessione.

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
si usa l'ascensore. Il loro collegamento tra ambienti, il logo e le altre
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
