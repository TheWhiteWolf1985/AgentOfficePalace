# Plugin & Skills

Apri **Impostazioni → Plugin & Skills** in Office 3D o Lite con un account amministrativo. Un collegamento vale per gli agenti di tutti i piani, compresi quelli creati in seguito. Gli agenti consultano il catalogo durante l’incarico. Il browser dell’amministratore può essere chiuso.

| Collegamento | Operazioni disponibili nella prima versione |
| --- | --- |
| Google Drive | Ricerca per nome, elenco paginato, lettura di Google Docs e di file di testo o Markdown fino a 256 KiB |
| Canva | Ricerca ed elenco paginato dei progetti, lettura dei dettagli e dei collegamenti di un progetto |
| Revisione Markdown | Istruzioni condivise per controllare struttura, collegamenti e fonti, attivabili dalla pagina |

## Collegare gli account

**Drive sulla LAN tramite IP.** Abilita la Drive API nel progetto Google Cloud. Condividi con l’indirizzo dell’account di servizio le cartelle che gli agenti devono poter leggere. In Office scegli **Google Drive → Collega account → Usa un account di servizio Google**, seleziona la sua chiave JSON e conferma. Office verifica l’identità con Google prima di salvare il collegamento. Questa modalità richiede che l’organizzazione consenta la creazione della chiave e la condivisione della cartella. [Account di servizio Google](https://developers.google.com/identity/protocols/oauth2/service-account)

**Accesso personale Google o Canva.** Registra l’applicazione presso il fornitore e copia l’esatto indirizzo di ritorno mostrato nella pagina. Per Google usa un client web con Drive API e ambito `drive.readonly`. Per Canva usa un’app con accesso utente e gli ambiti `profile:read` e `design:meta:read`. Inserisci client ID e client secret, premi **Accedi al servizio** e apri la pagina di accesso. Torna alla scheda Office dopo il consenso. Google esclude dal login web gli indirizzi IP diversi dal loopback. Anche per Canva l’indirizzo deve essere accettato e registrato nel portale del fornitore. [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation) · [Autenticazione Canva](https://www.canva.dev/docs/connect/authentication/)

**Scollega account** elimina il collegamento locale per tutti gli agenti. Per revocare anche l’autorizzazione presso il fornitore usa la gestione accessi di Google o Canva. Ricollegando un account, il precedente rimane operativo fino alla verifica della nuova identità.

## Container e aggiornamenti

Quando è configurato il runtime Docker rootless degli agenti, Office avvia in background un container dedicato. Riutilizza l’immagine Node già presente per gli agenti, con un processo e un filesystem separati. Il pacchetto applicativo include il servizio e le skill sotto `bin/plugin-skills/`. Il container ha limiti di 0,5 CPU, 192 MiB di RAM e 64 processi e usa la politica di riavvio Docker `unless-stopped`.

Il servizio comunica con Office attraverso un socket Unix privato. La directory `$AGENT_OFFICE_CODEX_RUNTIME/plugin-skills/data/` conserva le credenziali e le attivazioni anche quando il container viene ricreato. Va protetta nei backup della singola installazione. L’immagine distribuibile contiene il catalogo iniziale. La VM effettua le chiamate a Google e Canva via Internet.

Il server MCP `agent-office` espone `list_office_tools` per scoprire il catalogo e `use_office_tool` per eseguire un’operazione o leggere una skill attiva. Gli agenti con la sola CLI hanno i comandi equivalenti `office-workers tools` e `office-workers use`. La prima introduzione di questi strumenti in una sessione che ha già caricato la precedente versione del server MCP richiede il riavvio della sessione a turno concluso. Le successive attivazioni dalla pagina sono consultabili nella stessa sessione.

Per distribuire una skill di istruzioni, aggiungi `bin/plugin-skills/skills/<id>/SKILL.md` con un identificativo composto da lettere minuscole, numeri e trattini, una `description` su una riga nel frontmatter e un titolo Markdown di primo livello. Le skill nuove partono disattivate.
