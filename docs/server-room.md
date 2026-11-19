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

Il tastierino e gli schermi delle postazioni mantengono la geometria predisposta.
PIN, collegamenti ad agenti e animazione delle ventole sono interventi futuri.
I pannelli non diventano lavagne condivise degli uffici. La lavagna e la
presentazione della Sala riunioni restano separate e operative.

## Pannelli operativi

Partendo dall'ascensore: **1 Stato VM**, **2 Console VM**, **3 Servizi Docker**.
L'ordine fisico è inverso ai suffissi Blender: 003, 002, 001. Clic oppure E apre
una finestra ridimensionabile; Esc la chiude. Tutti i contenuti amministrativi,
incluse le anteprime 3D, richiedono il ruolo amministratore anche sul backend.

Il primo pannello mostra CPU, RAM e filesystem della macchina che esegue Node:
nel deployment nativo sono le risorse della VM, non quelle del nodo Proxmox.
La RAM Linux usa MemAvailable. Il filesystem predefinito è `/`; si può scegliere
con `AGENT_OFFICE_METRICS_PATH`. Lo storico conserva al massimo 60 campioni in RAM.
Le letture sono condivise e limitate a una ogni cinque secondi, su richiesta;
fuori dalla stanza o con scheda nascosta il browser sospende il polling. Se la
raccolta fallisce, i dati precedenti non vengono presentati come attuali.

Il secondo pannello usa la console seriale **esistente** della VM Proxmox, tramite
termproxy e WebSocket autenticato dal backend. Non crea worker o processi agente.
La sessione richiede il normale login Debian; nessun accesso root automatico.
È consentito un solo utilizzatore per istanza applicativa, con chiusura del
collegamento quando finestra, account o applicazione vengono chiusi/revocati.
Il terminale conserva la normale sessione della console Debian: per terminare un
login usare `exit` prima di disconnettersi. L'anteprima viene svuotata alla chiusura.
Se la VM o l'applicazione sono irraggiungibili, usare direttamente Proxmox.

Configurazione soltanto sul server, fuori dal repository, in
`/etc/agent-office-palace/console.json` oppure nel file indicato da
`AGENT_OFFICE_SERVER_CONSOLE_FILE`:

```json
{
  "origin": "https://proxmox.example:8006",
  "node": "proxmox",
  "vmid": 112,
  "token": "PVEAPIToken=ACCOUNT!TOKEN=SECRET",
  "caFile": "/etc/agent-office-palace/proxmox-ca.pem"
}
```

Il token deve avere soltanto `VM.Console` su `/vms/112`; la console serial0 deve
già essere configurata nella VM e in Debian. Il certificato remoto viene verificato
con la sua CA esistente, senza disabilitare TLS o modificare il trust dei client.
Limitare la lettura del file al servizio applicativo e all'amministratore.

Il terzo pannello legge l'Engine Docker **locale**, dal socket Unix predefinito
`/var/run/docker.sock` oppure `AGENT_OFFICE_DOCKER_SOCKET`. Esegue soltanto GET
`/containers/json?all=true`: include i container fermi, raggruppamento Compose,
stato, salute se configurata, immagine e descrizione dell'attività. Non espone
variabili d'ambiente o dati completi di inspect. Il pannello distingue Docker
assente, non raggiungibile, accesso negato e daemon attivo senza container.
Il deploy non installa Docker e non aggiunge l'utente al gruppo docker. Quando
sarà predisposto, preferire un socket filtrato che autorizzi solo questa lettura.
Un bind mount del socket marcato `read-only` non limita i comandi dell'API.

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
