# Plugin & Skills

Apri **Impostazioni → Plugin & Skills** in Office 3D o Lite con un account amministrativo. Un collegamento vale per gli agenti di tutti i piani, compresi quelli creati in seguito. Gli agenti consultano il catalogo durante l’incarico. Il browser dell’amministratore può essere chiuso.

| Collegamento | Operazioni disponibili nella prima versione |
| --- | --- |
| Google Drive | Ricerca per nome, elenco paginato, lettura di Google Docs e di file di testo o Markdown fino a 256 KiB |
| Canva | Ricerca ed elenco paginato dei progetti, lettura dei dettagli e dei collegamenti di un progetto |
| Revisione Markdown | Istruzioni condivise per controllare struttura, collegamenti e fonti, attivabili dalla pagina |

## Collegare gli account

**Google Drive.** L’amministratore abilita la Drive API nel proprio progetto Google Cloud, configura il consenso e crea un client OAuth di tipo **Applicazione web**. Registra esattamente l’URI indicato in **Plugin & Skills → Google Drive → Configurazione applicazione Google**. Inserisci client ID e client secret in Office e premi **Applica**. Questa configurazione rimane sulla VM anche quando scolleghi l’account. Se il progetto Google è in modalità test, aggiungi l’account agli utenti di test. [Configurazione OAuth di Google](https://developers.google.com/identity/protocols/oauth2/web-server)

Per autorizzare gli agenti, premi **Accedi con Google**, scegli l’account sul sito Google e concedi la lettura di Drive. Office richiede l’accesso offline e conserva la concessione nel container condiviso. Google può chiedere password, passkey o secondo fattore secondo le impostazioni dell’account.

**Collaudo su IP senza DNS.** Google accetta il loopback come indirizzo di ritorno. Dal PC dell’amministratore apri il tunnel indicato nella pagina, quindi **Apri Office su localhost**. Accedi a Office e premi **Accedi con Google** nella stessa pagina delle impostazioni. L’URI da registrare con la porta suggerita è `http://127.0.0.1:4600/api/plugins/callback/drive`. Tieni il tunnel aperto fino alla conferma dell’account collegato. Gli agenti potranno poi usare Drive dalla VM anche dopo la chiusura del tunnel. Con un dominio HTTPS autorizzato si può effettuare l’intero accesso direttamente dall’indirizzo registrato. [Indirizzi di ritorno accettati da Google](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation)

**Canva.** Registra l’indirizzo di ritorno mostrato nella pagina presso il fornitore. Usa un’app con accesso utente e gli ambiti `profile:read` e `design:meta:read`. Inserisci client ID e client secret, premi **Accedi al servizio** e apri la pagina di accesso. Torna alla scheda Office dopo il consenso. [Autenticazione Canva](https://www.canva.dev/docs/connect/authentication/)

**Scollega account** elimina il collegamento locale per tutti gli agenti. Per revocare anche l’autorizzazione presso il fornitore usa la gestione accessi di Google o Canva. Ricollegando un account, il precedente rimane operativo fino alla verifica della nuova identità.

## Container e aggiornamenti

Quando è configurato il runtime Docker rootless degli agenti, Office avvia in background un container dedicato. Riutilizza l’immagine Node già presente per gli agenti, con un processo e un filesystem separati. Il pacchetto applicativo include il servizio e le skill sotto `bin/plugin-skills/`. Il container ha limiti di 0,5 CPU, 192 MiB di RAM e 64 processi e usa la politica di riavvio Docker `unless-stopped`.

Il servizio comunica con Office attraverso un socket Unix privato. La directory `$AGENT_OFFICE_CODEX_RUNTIME/plugin-skills/data/` conserva le credenziali e le attivazioni anche quando il container viene ricreato. Va protetta nei backup della singola installazione. L’immagine distribuibile contiene il catalogo iniziale. La VM effettua le chiamate a Google e Canva via Internet.

Il server MCP `agent-office` espone `list_office_tools` per scoprire il catalogo e `use_office_tool` per eseguire un’operazione o leggere una skill attiva. Gli agenti con la sola CLI hanno i comandi equivalenti `office-workers tools` e `office-workers use`. La prima introduzione di questi strumenti in una sessione che ha già caricato la precedente versione del server MCP richiede il riavvio della sessione a turno concluso. Le successive attivazioni dalla pagina sono consultabili nella stessa sessione.

Per distribuire una skill di istruzioni, aggiungi `bin/plugin-skills/skills/<id>/SKILL.md` con un identificativo composto da lettere minuscole, numeri e trattini, una `description` su una riga nel frontmatter e un titolo Markdown di primo livello. Le skill nuove partono disattivate.
