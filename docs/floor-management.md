# Gestione piani

Gli amministratori aprono **Impostazioni → Gestione piani**. Un nuovo ufficio propone un repository privato nell'organizzazione Forgejo dell'installazione. Il nome «Ufficio documenti» propone `Uff_documenti`. Si può scegliere un nome diverso oppure collegare esplicitamente un repository privato già presente. Il pulsante **Applica** conferma creazione e modifiche.

La cartella indicata è quella del progetto sulla VM. Lasciandola vuota in creazione viene assegnata una nuova sottocartella. Per spostarla scegli una destinazione libera sotto la radice configurata in **Edificio**. Ferma gli agenti di quel piano e concludi gli incarichi attivi. Viene conservata la copia precedente, inclusi i file locali. I container mantengono il proprio `/workspace`. Cambiare il remoto di un checkout Git mantiene i suoi file, i commit e il branch locale; la sincronizzazione delle storie resta un'operazione Git esplicita.

La rimozione conserva per impostazione predefinita repository e cartella locale. Per eliminare un remoto creato dall'applicazione occorre selezionare l'opzione e digitare il nome completo. I repository importati si possono scollegare. Per ricostruire un ufficio sul lavoro conservato si usa **Collega repository privato esistente**.

## Configurazione del backend

Predisporre un'organizzazione privata sul Forgejo dell'installazione e un account tecnico ordinario proprietario dell'organizzazione. Per il backend usare un token dedicato con accesso a repository e organizzazione. Registrare in **GitHub e Forgejo** il server HTTPS e un secondo token dello stesso account con soli permessi di lettura di utente, repository e segnalazioni. Verificarlo e recuperarne l'identificativo. Il runtime Node e il client Git del servizio devono riconoscere la CA di quel Forgejo.

`AGENT_OFFICE_FLOOR_FORGEJO` indica un file JSON riservato al backend con campi `url`, `organization`, `token` e `readerAccountId`. Impostare anche `AGENT_OFFICE_FLOOR_READER` con lo stesso ID per escludere quell'identità tecnica dalle sessioni degli agenti. Su Debian il file può essere fornito tramite `LoadCredential` di systemd. Workspace, credenziali e metadati di produzione sono esterni al repository del software.
