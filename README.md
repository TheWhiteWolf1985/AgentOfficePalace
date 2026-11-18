# Agent Office Palace

Applicazione collaborativa con frontend TypeScript/Three.js e backend Node.js. Comprende Atrio al piano terra, uffici per progetto e Sala riunioni all'ultimo piano, accessibili anche senza uffici configurati.

## Funzioni applicative

- Navigazione 3D e vista 2D, ascensore e sedute.
- Avatar maschili/femminili, acconciature e colori; due presenze alla reception.
- Pannello dell'Atrio personalizzabile da Impostazioni → Logo atrio.
- Lavagna condivisa nella Sala riunioni e negli uffici, chat, voce e condivisione schermo.
- Account, ruoli e preferenze personali; collegamenti GitHub/Forgejo.
- Profili grafici, caricamento differito e risorse statiche compresse.

Il codice esistente per lavoratori, terminali, code e provider rimane parte dell'applicazione. La futura integrazione degli agenti in container sarà valutata separatamente; questa versione non installa CLI degli agenti né prepara Docker o servizi cloud.

## Sviluppo e verifiche

Usare Node.js22 e il lockfile del repository:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

Per lo sviluppo interattivo: `npm run dev`. Per avviare la build compilata:

```sh
node bin/agent-office.js --home /percorso/dati --host 127.0.0.1 --port 4600 --no-open
```

Impostare `AGENT_OFFICE_PASSWORD` nell'ambiente del processo oppure configurare gli account dell'applicazione. Dati, credenziali e configurazioni locali restano esterni al checkout. I dettagli dell'avvio nativo usato dal progetto sono in [deploy/debian/README.md](deploy/debian/README.md); le opzioni applicative in [docs/configuration.md](docs/configuration.md). Per voce e schermo al di fuori di localhost è richiesto un contesto HTTPS sicuro.

Gli aggiornamenti sono gestiti dal deployment: pubblicazione del commit verificato, build qualificata e riavvio controllato del servizio. L'applicazione non si auto-installa o auto-aggiorna e non gestisce chiavi SSH o configurazioni dell'host. La pipeline GitHub esistente verifica e pubblica il pacchetto software compilato.

## Repository e documentazione

- Forgejo: `ssh://git@192.168.1.8/Juri/AgentOfficePalace.git`.
- GitHub: `git@github.com:TheWhiteWolf1985/AgentOfficePalace.git`.
- [Struttura del codice](docs/code-layout.md), [funzionamento](docs/how-it-works.md), [funzioni](docs/features.md) e [comandi](docs/controls.md).
- [Atrio](docs/atrium.md), [Sala riunioni](docs/conference-room.md), [avatar](docs/user-character.md), [prestazioni](docs/performance.md) e [connessioni](docs/connections.md).
- `Personaggi/`, `sala_atrio/` e `sala_riunioni/` conservano le consegne Blender versionate. I modelli utilizzati dal browser sono in `src/client/models/`.

Licenza [MIT](LICENSE). Provenienza e attribuzioni in [docs/UPSTREAM.md](docs/UPSTREAM.md).
