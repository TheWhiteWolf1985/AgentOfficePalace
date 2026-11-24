# Agent Office Palace

Applicazione collaborativa con frontend TypeScript/Three.js e backend Node.js. Comprende Atrio al piano terra, uffici per progetto, Sala server al penultimo piano e Sala riunioni all'ultimo piano, accessibili anche senza uffici configurati.

## Funzioni applicative

- Navigazione 3D e vista 2D, ascensore e sedute.
- Avatar maschili/femminili, acconciature e colori; due presenze alla reception.
- Pannello dell'Atrio personalizzabile da Impostazioni → Logo atrio.
- Lavagna condivisa nella Sala riunioni e negli uffici, chat, voce e condivisione schermo.
- Account, ruoli e preferenze personali; collegamenti GitHub/Forgejo.
- Profili grafici, caricamento differito e risorse statiche compresse.

Ogni agente Codex dispone di un proprio container Docker rootless e di un workspace persistente. Per installare il software su una VM Debian 13 amd64, seguire la [guida all’installazione](deploy/debian/DISTRIBUZIONE.md).

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

Impostare `AGENT_OFFICE_PASSWORD` nell'ambiente del processo oppure configurare gli account dell'applicazione. Dati, credenziali e configurazioni locali restano esterni al checkout. Le istruzioni per la VM sono in [deploy/debian/DISTRIBUZIONE.md](deploy/debian/DISTRIBUZIONE.md); le opzioni applicative in [docs/configuration.md](docs/configuration.md). Per voce e schermo al di fuori di localhost è richiesto un contesto HTTPS sicuro.

Forgejo ospita lo sviluppo. Il branch GitHub `main` ne rispecchia il codice e il branch `release` identifica le versioni distribuite. Nelle installazioni gestite il timer Debian controlla le release stabili. L'istanza di sviluppo può continuare a usare il checkout e i deploy di prova.

## Repository e documentazione

- GitHub: `git@github.com:TheWhiteWolf1985/AgentOfficePalace.git`.
- [Struttura del codice](docs/code-layout.md), [funzionamento](docs/how-it-works.md), [funzioni](docs/features.md) e [comandi](docs/controls.md).
- [Atrio](docs/atrium.md), [Sala server](docs/server-room.md), [Sala riunioni](docs/conference-room.md), [avatar](docs/user-character.md), [prestazioni](docs/performance.md) e [connessioni](docs/connections.md).
- `Personaggi/`, `sala_atrio/` e `sala_riunioni/` conservano le consegne Blender versionate. I modelli utilizzati dal browser sono in `src/client/models/`.

Licenza [MIT](LICENSE). Provenienza e attribuzioni in [docs/UPSTREAM.md](docs/UPSTREAM.md).
