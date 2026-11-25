# Gestione piani

Gli amministratori aprono **Impostazioni → Gestione piani**. Un nuovo ufficio propone un repository privato nell'organizzazione Forgejo dell'installazione. Il nome «Ufficio documenti» propone `Uff_documenti`. Si può scegliere un nome diverso oppure collegare esplicitamente un repository privato già presente. Il pulsante **Applica** conferma creazione e modifiche.

La cartella indicata è quella del progetto sulla VM. Lasciandola vuota in creazione viene assegnata una nuova sottocartella. Per spostarla scegli una destinazione libera sotto la radice configurata in **Edificio**. Ferma gli agenti di quel piano e concludi gli incarichi attivi. Viene conservata la copia precedente, inclusi i file locali. I container mantengono il proprio `/workspace`. Cambiare il remoto di un checkout Git mantiene i suoi file, i commit e il branch locale; la sincronizzazione delle storie resta un'operazione Git esplicita.

La rimozione conserva per impostazione predefinita repository e cartella locale. Per eliminare un remoto creato dall'applicazione occorre selezionare l'opzione e digitare il nome completo. I repository importati si possono scollegare. Per ricostruire un ufficio sul lavoro conservato si usa **Collega repository privato esistente**.

Se Office ha già copiato la cartella ma l'apertura fallisce, il messaggio indica dove recuperare la copia. La destinazione richiesta torna disponibile per riprovare. Se il repository è già stato creato, seleziona **Collega repository privato esistente**.

I test di integrazione di `npm test` usano cartelle temporanee, Git reale e un servizio Forgejo simulato. Con Chrome installato, `npm run test:floor-ui` verifica anche il pannello, le conferme e il recupero delle modifiche in bozza.

## Configurazione del backend

Predisporre un'organizzazione privata sul Forgejo dell'installazione e un account tecnico ordinario proprietario dell'organizzazione. Per il backend usare un token dedicato con accesso a repository e organizzazione. Registrare in **GitHub e Forgejo** il server HTTPS e un secondo token dello stesso account con soli permessi di lettura di utente, repository e segnalazioni. Verificarlo e recuperarne l'identificativo. Il runtime Node e il client Git del servizio devono riconoscere la CA di quel Forgejo.

`AGENT_OFFICE_FLOOR_FORGEJO` indica un file JSON riservato al backend con campi `url`, `organization`, `token` e `readerAccountId`. Impostare anche `AGENT_OFFICE_FLOOR_READER` con lo stesso ID per escludere quell'identità tecnica dalle sessioni degli agenti. Su Debian il file può essere fornito tramite `LoadCredential` di systemd. Workspace, credenziali e metadati di produzione sono esterni al repository del software.

## Identità Forgejo degli agenti

In **Impostazioni → Gestione agenti**, un amministratore sceglie tipo e ruolo. Per una scrivania già presente occorre scegliere esplicitamente il tipo e premere **Applica**. Da **Identità repository** si vedono l’utente personale, il repository e l’esito. Il pulsante **Riprova accesso Forgejo** riprende una configurazione interrotta.

| Agente permanente | Branch di lavoro del piano | Apertura e revisione PR | Merge sul branch principale |
| --- | --- | --- | --- |
| Operatore | Lettura e scrittura | — | — |
| Capo operatore | Lettura e scrittura | Sì | — |
| Capo ufficio | Lettura e scrittura | Sì | Dopo un’approvazione sul commit corrente |

Le scrivanie temporanee lavorano nel proprio workspace locale. Il backend genera le credenziali delle identità permanenti, le conserva fuori dalle directory montate nei container e usa token limitati al repository privato collegato al piano. Ogni scrivania interroga `office_repository` con `operation: info` per configurare il remoto Git e conoscere la propria identità. I comandi Git nel container passano dal socket Office e arrivano a Forgejo con l’utente della scrivania. Una modifica al documento richiede una nuova approvazione. Nella pipeline Documenti, il Capo editore verifica il commit della PR finale aperta dal Capo ufficio.

Un cambio di ruolo revoca il token precedente. La rimozione disabilita l’identità e conserva la paternità delle PR. Quando cambia il repository del piano, Office toglie prima l’accesso al precedente. Se la protezione esistente del branch principale è incompatibile, la scheda mostra l’errore e l’amministratore può esaminare la regola prima di riprovare.

Su Debian, il servizio riceve il percorso del token amministrativo dedicato in `AGENT_OFFICE_FORGEJO_AGENT_ADMIN`, mediante una credenziale systemd. Quando questa è attiva le scrivanie eseguono i processi nei container isolati. Il collaudo su un’istanza Forgejo e un database SQLite temporanei si avvia, come utente ordinario, con `bash scripts/test-forgejo-roles.sh /percorso/forgejo`. Impostando `AOP_TEST_DOCKER_SOCKET` si include la prova Git e MCP nel container rootless.
