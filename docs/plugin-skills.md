# Plugin & Skills

Apri **Impostazioni → Plugin & Skills** in Office 3D o Lite con un account amministrativo. Un collegamento vale per gli agenti di tutti i piani, compresi quelli creati in seguito. Gli agenti consultano il catalogo durante l’incarico. Il browser dell’amministratore può essere chiuso.

| Collegamento | Operazioni disponibili nella prima versione |
| --- | --- |
| Google Drive | Ricerca per nome, elenco paginato, lettura di Google Docs e di file di testo o Markdown fino a 256 KiB |
| Canva | Profilo collegato, ricerca dei progetti e lettura dei dettagli e dei collegamenti |
| HeyGen | Verifica del collegamento al servizio MCP con l’account web |
| LinkedIn | Nome e identificativo del membro che ha collegato l’account |
| Revisione Markdown | Istruzioni condivise per controllare struttura, collegamenti e fonti, attivabili dalla pagina |
| PDF e OCR | Estrazione del testo nativo, riconoscimento di scansioni in italiano e inglese, anteprima della pagina originale |

## PDF e OCR

Attiva **PDF e OCR** in **Impostazioni → Plugin & Skills**. L'attivazione vale per tutti i piani. Trascina un PDF nel terminale dell'agente oppure scegli un PDF già presente nel suo workspace. Per esempio, «Leggi le prime tre pagine del PDF allegato, trascrivi anche le scansioni e salva un verbale Markdown nella libreria del piano. Indica la pagina accanto a ogni decisione».

La skill usa `pdf.text`, `pdf.ocr` e `pdf.render` su una pagina alla volta, numerata da 1. Ogni risposta indica il numero totale di pagine. Il riconoscimento usa italiano e inglese insieme, oppure una lingua scelta con `ita` o `eng`. La dimensione massima per documento è 16 MiB. Il container elabora una pagina per volta e, se occupato, invita a riprovare. L'agente può confrontare la trascrizione con l'immagine originale prima di salvare il Markdown nel proprio workspace. La libreria Documenti lo mostra sul piano dell'agente.

Quando invii un messaggio dal terminale di una scrivania Codex, Office indica all'agente come trovare il catalogo aggiornato. Le chat aperte prima dell'introduzione degli strumenti MCP di Office possono avere ancora l'elenco precedente. A turno concluso, in **Impostazioni → Gestione agenti → Modifica proprietà**, scegli **Ferma container** e poi **Avvia container**. Codex riprende la conversazione e carica gli strumenti aggiornati. Le successive attivazioni valgono nella stessa chat.

## Collegare gli account

**Google Drive.** L’amministratore abilita la Drive API nel proprio progetto Google Cloud, configura il consenso e crea un client OAuth di tipo **Applicazione web**. Registra esattamente l’URI indicato in **Plugin & Skills → Google Drive → Configurazione applicazione Google**. Inserisci client ID e client secret in Office e premi **Applica**. Questa configurazione rimane sulla VM anche quando scolleghi l’account. Se il progetto Google è in modalità test, aggiungi l’account agli utenti di test. [Configurazione OAuth di Google](https://developers.google.com/identity/protocols/oauth2/web-server)

Per autorizzare gli agenti, premi **Accedi con Google**, scegli l’account sul sito Google e concedi la lettura di Drive. Office richiede l’accesso offline e conserva la concessione nel container condiviso. Google può chiedere password, passkey o secondo fattore secondo le impostazioni dell’account.

**Accesso su IP senza DNS.** Registra in Google Cloud l’URI esatto `http://127.0.0.1:4600/api/plugins/callback/drive`. Apri Office in HTTPS sul PC con cui darai il consenso.

1. Premi **Prepara tunnel di accesso**, poi **Copia comando**. Eseguilo in PowerShell sullo stesso PC, con il client OpenSSH e la porta locale 4600 libera.
2. Al prompt inserisci un utente SSH della VM autorizzato a raggiungere il socket privato del servizio. Al primo collegamento verifica l’impronta SSH nella console della VM. Le credenziali SSH vengono richieste sul PC.
3. Quando compare `Tunnel-OK`, premi **Accedi con Google** in Office. Scegli l’account e concedi l’accesso. Il browser torna all’istanza Office per confermare il collegamento.
4. Il comando termina al ritorno da Google, premendo **Annulla accesso** in Office o dopo dieci minuti. Se chiudi Google prima del consenso, puoi annullare dalla pagina Office. La concessione salvata permette agli agenti di usare Drive anche a PC spento.

Il container crea un socket Unix privato e temporaneo per quel callback OAuth. Il browser che ha avviato la richiesta completa lo scambio del codice. Il profilo Drive fissa porta e percorso. Altri provider possono usare lo stesso modulo amministrativo dopo la registrazione del proprio profilo. Con un dominio HTTPS autorizzato il browser può completare l’accesso direttamente. [Regole Google per gli indirizzi di ritorno](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation) · [Inoltro locale OpenSSH](https://man.openbsd.org/ssh.1#L)

**Canva.** Registra l’indirizzo di ritorno mostrato nella pagina presso il fornitore. Usa un’app con accesso utente e gli ambiti `profile:read` e `design:meta:read`. Inserisci client ID e client secret, premi **Accedi al servizio** e apri la pagina di accesso. Torna alla scheda Office dopo il consenso. [Autenticazione Canva](https://www.canva.dev/docs/connect/authentication/)

**HeyGen.** Premi **Accedi con HeyGen**. Su una VM raggiunta tramite IP, prepara prima il tunnel mostrato nella scheda. Al primo accesso il container registra il proprio callback presso HeyGen e apre il consenso dell’account web. Dopo il collegamento gli agenti possono chiedere «Verifica il collegamento HeyGen» (`heygen.status`). La verifica legge il catalogo remoto. [Accesso MCP HeyGen](https://www.heygen.com/model-context-protocol)

**LinkedIn.** Nella tua app LinkedIn abilita il prodotto *Sign In with LinkedIn using OpenID Connect*, registra l’URL di ritorno indicato da Office e inserisci client ID e client secret nella scheda. Con il consenso `openid profile` gli agenti possono usare `linkedin.profile`. Se LinkedIn rilascia solo un token a scadenza, Office mostra **Ricollega account** quando scade. [Accesso LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)

**Scollega account** elimina il collegamento locale per tutti gli agenti. Per revocare anche l’autorizzazione presso il fornitore usa la gestione accessi del rispettivo fornitore. Ricollegando un account, il precedente rimane operativo fino alla verifica della nuova identità.

## Container e aggiornamenti

Office esegue tutte le skill e tutti i connettori in un unico container Docker rootless dedicato. Un'eccezione richiede un limite tecnico documentato e l'autorizzazione esplicita del gestore dell'istanza. Il pacchetto in `bin/plugin-skills/` costruisce l'immagine `aop-plugin-skills`, che include il servizio, le skill, Poppler, Tesseract e i modelli linguistici. Alla prima costruzione Docker scarica la base e i pacchetti Debian. Office riusa l'immagine locale finché il pacchetto resta identico. Il container dispone di 1 CPU, 512 MiB di RAM e 64 processi e usa la politica di riavvio Docker `unless-stopped`. I programmi per i PDF girano con un utente separato e ricevono il file attraverso lo standard input. Office verifica l'identità dell'agente e inoltra i byte del solo file richiesto.

Il servizio comunica con Office attraverso un socket Unix privato. La directory `$AGENT_OFFICE_CODEX_RUNTIME/plugin-skills/data/` conserva le credenziali e le attivazioni anche quando il container viene ricreato. Va protetta nei backup della singola installazione. L’immagine distribuibile contiene il catalogo iniziale. La VM effettua le chiamate ai fornitori collegati via Internet.

Il server MCP `agent-office` espone `list_office_tools` per scoprire il catalogo e `use_office_tool` per eseguire un’operazione o leggere una skill attiva. Gli agenti con la sola CLI hanno i comandi equivalenti `office-workers tools` e `office-workers use`. La prima introduzione di questi strumenti in una sessione che ha già caricato la precedente versione del server MCP richiede il riavvio della sessione a turno concluso. Le successive attivazioni dalla pagina sono consultabili nella stessa sessione.

Per distribuire una skill di istruzioni, aggiungi `bin/plugin-skills/skills/<id>/SKILL.md` con un identificativo composto da lettere minuscole, numeri e trattini, una `description` su una riga nel frontmatter e un titolo Markdown di primo livello. Le skill nuove partono disattivate.
