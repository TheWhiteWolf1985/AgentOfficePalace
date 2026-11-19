# Agenti Codex in Docker

In **Impostazioni → Gestione agenti → Crea agente Codex**, scegli l’ufficio e l’aspetto, oppure lascia generare l’avatar. Se l’edificio è vuoto puoi creare qui un ufficio locale. La creazione occupa una scrivania libera. Puoi anche assumere Codex dalla scrivania di un ufficio.

Apri le proprietà dell’agente per collegare un abbonamento ChatGPT tramite codice dispositivo o inserire una chiave API OpenAI tramite HTTPS. Il codice dispositivo deve essere abilitato nelle impostazioni dell’account o del workspace ChatGPT. Ogni agente dispone di un accesso separato. Il modulo invia la chiave a `codex login --with-api-key` tramite stdin. Login e codici dispositivo passano dal pannello amministrativo. Completa il primo avvio e l’approvazione degli hook nel terminale dell’agente.

**Ferma container** conserva la scrivania, la copia di lavoro, l’accesso e le sessioni. **Avvia container** ricrea il processo e riprende la sessione nota. Il riavvio dell’applicazione riconosce un container già attivo e rispetta un arresto manuale. Nelle proprietà puoi cambiare nome, colore, avatar e scrivania. Per cambiare modello o istruzioni ferma prima il container. **Rimuovi agente** libera la scrivania ed elimina credenziali e sessioni. I file del progetto restano recuperabili nella directory `workers/<id>/workspace` del runtime.

## Workspace e accessi

La prima creazione importa la revisione Git dell’ufficio in un clone privato con metadati Git indipendenti. Un ufficio locale vuoto parte con un nuovo repository. Ciascun agente lavora in `/workspace`. Le modifiche e i commit restano nella sua copia anche quando il container viene ricreato. La pubblicazione sul repository dell’ufficio, le riunioni con worktree condiviso e le attività multi-repository richiedono un’integrazione successiva. Le chiavi Git dell’ufficio rimangono sul server. I file incollati nel terminale sono accessibili nel mount di sola lettura `/office-drops`.

La distribuzione di prova è pensata per un ufficio fidato. Chi controlla il terminale può svolgere attività usando l’identità Codex associata. Gli amministratori gestiscono gli accessi. La vista 3D segue gli eventi del terminale come negli altri uffici.

## Runtime della VM 112

L’applicazione continua a girare come servizio Debian. Ogni nuovo agente Codex ha un container Docker rootless, un nome stabile e label per l’installazione e il worker. Il motore è raggiungibile solo tramite socket Unix. Il container riceve la sua home, il workspace, gli allegati e il socket dedicato ai soli eventi Codex. Gli eventi sono autenticati per worker. Il filesystem dell’immagine è di sola lettura.

| Impostazione del servizio | Funzione |
| --- | --- |
| `AGENT_OFFICE_CODEX_RUNTIME` | Directory privata del servizio, esterna ai repository. Abilita il runtime per le nuove assunzioni Codex. |
| `AGENT_OFFICE_DOCKER_SOCKET` | Socket del motore rootless usato anche dalla lavagna Docker. |
| `AGENT_OFFICE_CODEX_SECCOMP` | Percorso assoluto del profilo seccomp amministrato sul server. |
| `AGENT_OFFICE_CODEX_CPUS`, `AGENT_OFFICE_CODEX_MEMORY` | Limiti per container. I valori iniziali sono 1 CPU e 2 GiB, con 256 processi. |
| `AGENT_OFFICE_MAX_WORKERS` | Tetto facoltativo agli agenti e terminali registrati negli uffici, secondo la capacità già gestita dall’applicazione. |

L’immagine `aop-codex:0.154.0` si costruisce da `deploy/codex-agent`. Il profilo per Docker Engine 26.1.5 su Debian amd64 si genera con `python3 deploy/codex-agent/seccomp.py > codex-seccomp.json`. Lo script verifica l’hash SHA-256 della base Moby. Codex usa il proprio sandbox Bubblewrap all’interno del container. La sola capability aggiunta dopo la rimozione delle capability predefinite, `SETFCAP`, permette la mappatura dell’UID 0 nel namespace figlio. Il processo esterno opera con un UID non privilegiato sulla VM e con `no-new-privileges`. Rivalidare il profilo e una scrittura dentro e fuori dal workspace quando si aggiorna Engine o CLI.

Per disattivare il runtime ferma i container dagli uffici prima di rimuovere la configurazione del servizio. Conserva la directory dati per una successiva riattivazione.
