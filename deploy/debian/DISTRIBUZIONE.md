# Agent Office Palace su Debian 13

## Crea la VM dal nodo Proxmox

Dalla shell root del nodo Proxmox VE amd64 esegui il comando del candidato:

```bash
script=$(curl -fsSL https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases/download/v0.1.301-rc.6/proxmox.sh) && bash -c "$script"
```

Lo script propone ID libero, nome, storage e bridge e aspetta conferma. Puoi scegliere un nome diverso quando nel cluster esiste giÃ  `agent-office-palace`. Crea una VM Debian 13 ufficiale con 4 vCPU, 16 GiB RAM, disco da 30 GiB, DHCP e avvio automatico. Il nodo deve poter raggiungere Debian Cloud e GitHub. La VM deve poter raggiungere i repository Debian e GitHub. Il piccolo secondo disco contiene la configurazione del primo avvio, senza password.

Al termine compaiono lâ€™URL HTTPS e il comando Proxmox per leggere la password applicativa. Per impostare una password per la console Debian usa `qm guest passwd ID root` dal nodo. In caso di errore dopo la creazione, controlla la console seriale e `/var/log/cloud-init-output.log` nella VM. La creazione ripetuta richiede un nuovo ID e un nome disponibile.

Per un'installazione non interattiva passa `--yes` e, se necessario, `--vmid`, `--name`, `--storage`, `--bridge`. Ogni release incorpora nel suo `proxmox.sh` il tag e il checksum del manifest. Dopo la prima promozione stabile l'URL permanente sarÃ  `https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases/latest/download/proxmox.sh`.

## Prima installazione

Il punto di partenza Ã¨ una VM Debian 13 amd64 con systemd, rete in uscita e accesso root. Per una macchina con due agenti puoi partire dalla configurazione di prova con 4 vCPU, 16 GiB di RAM e 30 GiB di disco. Lascia spazio aggiuntivo per workspace e immagini. Lancia il comando nella console della VM. Il comando seguente installa lo stesso candidato su Debian già predisposta.

```bash
apt-get update && apt-get install -y ca-certificates curl && curl -fLsS https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases/download/v0.1.301-rc.6/install.sh -o /root/agent-office-install.sh && bash /root/agent-office-install.sh
```

Per trasportare una consegna, copia nella stessa cartella `install.sh`, `agent-office-release.py`, `release.json`, `agent-office-linux-amd64.tgz` e `codex-agent-linux-amd64.tgz`. Dalla cartella esegui `bash ./install.sh "$PWD"`. Per i prerequisiti Debian serve accesso ai repository APT o a un mirror aziendale. Node 22, dipendenze applicative e immagine Codex sono giÃ  nella consegna.

Apri l'URL HTTPS con l'IPv4 mostrato a fine installazione. Nginx riceve Office sulla porta 443 e reindirizza dalla porta 80 conservando percorso e parametri. La password originale Ã¨ nel file `/etc/agent-office-palace.env`, leggibile da root. L'installer usa l'IPv4 dell'interfaccia LAN selezionata dalla rotta predefinita e permette di confermarlo in una sessione interattiva. Prenota l'indirizzo DHCP per mantenere gli URL. La CA Ã¨ specifica della VM. Per la fiducia dei client distribuisci il solo certificato pubblico `/etc/agent-office-proxy/ca.crt` attraverso un canale autenticato.

Dopo un cambio di IP, oppure per rinnovare il certificato server prima della scadenza annuale, esegui come root `agent-office-proxy`. Per scegliere l'interfaccia usa `--ip INDIRIZZO`. La CA viene conservata. Per la creazione dei repository dei piani, il bootstrap configura sul Forgejo locale l’organizzazione privata `uffici` e il suo proprietario tecnico ordinario `office-piani`. I token di gestione e lettura sono distinti. Prima di creare uffici riserva l’IP: i checkout e le connessioni Git usano questo indirizzo. Il connettore Proxmox per la console della sala server appartiene alla singola installazione. Per collegare la lavagna del terminale vedere [Console della sala server](../../docs/server-room.md). Ogni utente collega i propri accessi Codex tramite l'app.

I file del programma sono in `/opt/agent-office-palace/releases`. Il link `current` identifica la versione attiva. Dati degli uffici, workspace, accessi e dati del motore rootless sono nella home `/var/lib/agent-office-palace`. Per il backup includi anche la configurazione locale in `/etc` e i repository e il database SQLite di Forgejo in `/var/lib/forgejo`. Acquisisci una copia coerente con i servizi fermi oppure con uno snapshot coordinato. Se una macchina contiene una precedente installazione di Agent Office Palace, usa una VM nuova per affiancarla, oppure pianifica la migrazione dei dati separatamente.

## Aggiornamenti

Il candidato mette gli aggiornamenti in pausa. Dopo la pubblicazione di una stabile approvata puoi eseguire `agent-office-release resume`. Ogni istanza sul canale stabile controlla GitHub circa una volta all'ora e dopo l'avvio. Il timer usa una connessione HTTPS in uscita. I download vengono verificati contro il manifest della versione. Una nuova immagine viene caricata nel motore rootless prima del cambio applicativo. I container giÃ  in esecuzione conservano la loro immagine. Al riavvio dell'app le interfacce dei browser possono riconnettersi.

| Operazione da root | Comando |
|---|---|
| Visualizzare versione, commit e pausa | `agent-office-release status` |
| Cercare e applicare subito la stabile | `agent-office-release update` |
| Sospendere i controlli durante una prova | `agent-office-release pause` |
| Tornare al canale stabile | `agent-office-release resume` e poi `agent-office-release update` |
| Riattivare la versione precedente | `agent-office-release rollback` |
| Consultare l'esito del timer | `journalctl -u agent-office-palace-update.service` |

Il rollback automatico scatta se l'avvio della nuova versione o il controllo di salute falliscono. Dopo il ripristino automatico, il timer attende un altro commit. Il comando manuale di aggiornamento permette di riprovare. Il rollback manuale mette in pausa gli aggiornamenti. Il ripristino riguarda programma e riferimento all'immagine. Per una futura release che migri il formato dei dati serve una migrazione reversibile o un backup coerente. Un'istanza spenta recupera la stabile al controllo successivo.

## Come pubblicare

1. Sviluppa e collauda il candidato su Forgejo. FinchÃ© la VM 112 usa il checkout di sviluppo rimane disponibile per le prove su branch.
2. Dopo il merge aggiorna GitHub `main` con un normale push fast-forward del main Forgejo. Questo esegue i controlli della pipeline.
3. Quando approvi una stabile, promuovi lo **stesso commit** con `git push github <SHA_APPROVATO>:refs/heads/release`. Controlla che sia giÃ  presente in GitHub main. La pipeline verifica la provenienza, compila, esegue i test e pubblica un tag con gli archivi e il manifest. I branch di lavoro continuano a essere gestiti su Forgejo.
4. Controlla la GitHub Release e confronta versione e commit con `agent-office-release status` sulle installazioni. Le istanze del lavoro e di casa condividono software e immagine, ciascuna con i propri dati.
