# Manifest operativi della VM111

compose.vm111.yml e compose.forgejo.vm111.yml sono copie dei manifest effettivamente usati.
I Dockerfile in live sono quelli conservati sulla VM; fanno riferimento a immagini locali
preesistenti e non costituiscono da soli una build autonoma da una macchina vuota.
La ricetta upstream del container rimane in deploy/container/Dockerfile.

I manifest sono specifici della VM111 (192.168.1.76 e percorsi /srv/data).
Non eseguire docker compose senza adattare e verificare prima percorsi, immagini,
identita, repository documentale, credenziali e rete della destinazione.
I manifest distinguono i container Office, nove agenti, merge, sincronizzazione e Forgejo.

Corrispondenza dei percorsi nel repository:
- maros/pipeline -> /srv/data/agent-office/pipeline
- maros/agents/AGENTS.md -> /srv/data/agent-office/data/home/.codex/AGENTS.md
- compose.vm111.yml -> /srv/data/agent-office/docker-compose.yml
- compose.forgejo.vm111.yml -> /srv/data/forgejo/docker-compose.yml

Dati persistenti e identita sono esterni ai container e non versionati qui.
Servono gli account Forgejo, chiavi SSH e token per ruolo, autenticazione ChatGPT di Codex,
le impostazioni dell ufficio e un checkout del repository documentale.
Il codice usa Codex CLI 0.167.2 con modello GPT-6.1 Terra e ragionamento alto sui nove agenti.
I tre checker e i contratti documentali provengono dalla wiki separata: la versione fidata
va predisposta in data/risorse/wiki/strumenti e confrontata con il checkout della wiki.
Template, baseline e documenti della wiki sono dipendenze esterne, non inclusi in questo repository.
Non copiare auth.json, sessioni, password, token o directory identita dentro Git.

## Allineamento Git della VM111

Il checkout /srv/data/agent-office/source deve essere pulito e avere origin
sul Forgejo aziendale AgentOfficePalace. upstream identifica il progetto GitHub.
Una chiave SSH dedicata della VM consente fetch/push nel solo repository del
software; la privata resta nella home codex della VM e non e montata negli agenti.
Dopo un intervento confrontare HEAD con main remoto ed eseguire:
python3 -B source/maros/tools/check_runtime.py --root /srv/data/agent-office --check-image
Il controllo confronta anche gli script e i manifest operativi esterni al checkout.
Nessun controllo periodico viene installato. Le credenziali non vanno copiate qui.

Il lockfile e stato allineato a quello del container operativo: le versioni dei
413 record del lock sono invariate, cambiano solo i metadati libc di dieci pacchetti.
