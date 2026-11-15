# Applicazione su Debian senza agenti

Questo avvio esegue soltanto il server Node.js e il frontend compilato di Agent
Office Palace su un host Debian 13. Non usare gli
installer generali del progetto per questa configurazione: installano anche
strumenti degli agenti.

## Percorsi e prerequisiti

- Repository software: l'URL Git del proprio checkout di Agent Office Palace.
- Checkout: `/opt/agent-office-palace/source`, a un commit pubblicato e verificato.
- Node.js 22 ufficiale: `/opt/node22`, collegamento alla versione installata.
- Utente di servizio: `agentoffice`, senza sudo e con home
  `/var/lib/agent-office-palace`.
- Stato dell'applicazione: `/var/lib/agent-office-palace/office`.
- Cartella dei futuri progetti: `/var/lib/agent-office-palace/projects`.

Servono Git, certificati CA, curl e xz per acquisire sorgenti e runtime. Il runtime
Node include npm. Verificare il checksum SHA256 dell'archivio Node contro il file
ufficiale `SHASUMS256.txt` della medesima versione prima di estrarlo.

Non installare CLI degli agenti, Docker, Forgejo, proxy o componenti della
pipeline documentale. Partire da una home applicativa nuova, senza lavoratori o
sessioni da ripristinare.

## Preparazione e avvio

Nel checkout, con il runtime Node nel PATH, eseguire come `agentoffice`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

Il file root-only `/etc/agent-office-palace.env` deve contenere
`AGENT_OFFICE_PASSWORD` con una password dedicata. Non usare la password di root
e non versionare il file. La unit legge il file tramite systemd.

Installare la unit di questa directory in
`/etc/systemd/system/agent-office-palace.service`, quindi eseguire:

```sh
systemctl daemon-reload
systemctl enable --now agent-office-palace.service
systemctl status agent-office-palace.service
```

L'applicazione risponde su `http://<indirizzo-DHCP-VM>:4600`. Nessun proxy e
previsto. Per consultare la password, root puo leggere il file ambiente nella
console della VM. La configurazione non crea agenti o account applicativi.

## Verifica e aggiornamenti

Controllare pagina di login, accesso all'ufficio dal browser e collegamento
WebSocket. Verificare inoltre che non siano presenti lavoratori e che i comandi
`codex`, `claude` e gli altri agenti non siano installati.

Prima di aggiornare il checkout, pubblicare le modifiche sul Forgejo indicato e
confrontare lo SHA remoto. Ripetere installazione dipendenze se cambia il lockfile,
eseguire i controlli e la build, poi riavviare soltanto questa unit. Il servizio
usa il frontend compilato: le modifiche diventano visibili dopo la build e il
riavvio. Stato e credenziali rimangono esterni al checkout.
