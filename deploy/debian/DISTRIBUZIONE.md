# Agent Office Palace su Debian 13

## Crea la VM dal nodo Proxmox

Dalla shell root del nodo Proxmox VE amd64 esegui il comando del candidato:

```bash
script=$(curl -fsSL https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases/download/v0.1.280-rc.3/proxmox.sh) && bash -c "$script"
```

Lo script propone ID libero, nome, storage e bridge e aspetta conferma. Puoi scegliere un nome diverso quando nel cluster esiste già `agent-office-palace`. Crea una VM Debian 13 ufficiale con 4 vCPU, 16 GiB RAM, disco da 30 GiB, DHCP e avvio automatico. Il nodo deve poter raggiungere Debian Cloud e GitHub. La VM deve poter raggiungere i repository Debian e GitHub. Il piccolo secondo disco contiene la configurazione del primo avvio, senza password.

Al termine compaiono l’URL HTTPS e il comando Proxmox per leggere la password applicativa. Per impostare una password per la console Debian usa `qm guest passwd ID root` dal nodo. In caso di errore dopo la creazione, controlla la console seriale e `/var/log/cloud-init-output.log` nella VM. La creazione ripetuta richiede un nuovo ID e un nome disponibile.

Per un'installazione non interattiva passa `--yes` e, se necessario, `--vmid`, `--name`, `--storage`, `--bridge`. Ogni release incorpora nel suo `proxmox.sh` il tag e il checksum del manifest. Dopo la prima promozione stabile l'URL permanente sarà `https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases/latest/download/proxmox.sh`.

## Prima installazione

Il punto di partenza è una VM Debian 13 amd64 con systemd, rete in uscita e accesso root. Per una macchina con due agenti puoi partire dalla configurazione di prova con 4 vCPU, 16 GiB di RAM e 30 GiB di disco. Lascia spazio aggiuntivo per workspace e immagini. Lancia il comando nella console della VM. Il percorso pubblico diventa disponibile con la prima GitHub Release che contiene `install.sh`.

```bash
apt-get update && apt-get install -y ca-certificates curl && curl -fLsS https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases/latest/download/install.sh -o /root/agent-office-install.sh && bash /root/agent-office-install.sh
```

Per trasportare una consegna, copia nella stessa cartella `install.sh`, `agent-office-release.py`, `release.json`, `agent-office-linux-amd64.tgz` e `codex-agent-linux-amd64.tgz`. Dalla cartella esegui `bash ./install.sh "$PWD"`. Per i prerequisiti Debian serve accesso ai repository APT o a un mirror aziendale. Node 22, dipendenze applicative e immagine Codex sono già nella consegna.

Apri **https://IP-DELLA-VM:4643**. La password originale è nel file `/etc/agent-office-palace.env`, leggibile da root. L'app genera un certificato per il primo avvio. La configurazione del certificato aziendale e del connettore Proxmox per la console della sala server appartengono alla singola installazione. Per collegare la lavagna del terminale vedere [Console della sala server](../../docs/server-room.md). Ogni utente collega i propri accessi Codex tramite l'app.

I file del programma sono in `/opt/agent-office-palace/releases`. Il link `current` identifica la versione attiva. Dati degli uffici, workspace, accessi e dati del motore rootless sono nella home `/var/lib/agent-office-palace`. Per il backup includi anche la configurazione locale in `/etc`. Se una macchina contiene una precedente installazione di Agent Office Palace, usa una VM nuova per affiancarla, oppure pianifica la migrazione dei dati separatamente.

## Aggiornamenti

Ogni istanza gestita controlla GitHub circa una volta all'ora e dopo l'avvio. Il timer usa una connessione HTTPS in uscita. I download vengono verificati contro il manifest della versione. Una nuova immagine viene caricata nel motore rootless prima del cambio applicativo. I container già in esecuzione conservano la loro immagine. Al riavvio dell'app le interfacce dei browser possono riconnettersi.

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

1. Sviluppa e collauda il candidato su Forgejo. Finché la VM 112 usa il checkout di sviluppo rimane disponibile per le prove su branch.
2. Dopo il merge aggiorna GitHub `main` con un normale push fast-forward del main Forgejo. Questo esegue i controlli della pipeline.
3. Quando approvi una stabile, promuovi lo **stesso commit** con `git push github <SHA_APPROVATO>:refs/heads/release`. Controlla che sia già presente in GitHub main. La pipeline verifica la provenienza, compila, esegue i test e pubblica un tag con gli archivi e il manifest. I branch di lavoro continuano a essere gestiti su Forgejo.
4. Controlla la GitHub Release e confronta versione e commit con `agent-office-release status` sulle installazioni. Le istanze del lavoro e di casa condividono software e immagine, ciascuna con i propri dati.
