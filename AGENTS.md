# AgentOfficePalace - istruzioni di progetto

Fork privato MAROS di AgentSystemLabs/agent-office. Conservare LICENSE e provenienza upstream.
Il codice TypeScript e in src, i componenti documentali MAROS in maros/pipeline,
i manifest della VM111 in maros/deploy e le istruzioni degli agenti in maros/agents.
L origine e le personalizzazioni sono descritte in docs/maros/ARCHITETTURA.md.

Per modifiche successive all importazione iniziale usare branch codex/ dedicati e pull request sul Forgejo aziendale.
Non pubblicare al remoto upstream senza richiesta esplicita. Nessun deploy o riavvio implicito.
Prima di pubblicare eseguire i controlli adeguati alla modifica; per TypeScript usare
npm run typecheck, npm test e npm run build. Per la pipeline:
python3 -B -m unittest discover -s maros/pipeline -p 'test_*.py'.
Per cambiamenti grafici verificare anche il risultato nell interfaccia.

Credenziali, token ChatGPT/Codex/Forgejo, chiavi SSH, database, sessioni e dati del vault
restano esterni a Git. Non aggiungere dati runtime per rendere una prova verde.
Le istruzioni originali upstream sono conservate in docs/upstream/AGENTS.original.md come riferimento storico.
Le istruzioni del progetto non autorizzano scritture nella wiki o modifiche ai servizi di produzione.


## Collegamento al progetto LLM Wiki e obbligo Git

Decisione dell utente del 13/11/2026: ogni modifica al codice, alle configurazioni
versionabili e alle istruzioni operative di AgentOfficePalace deve avere commit
e push sul Forgejo aziendale, con confronto dello SHA remoto prima della chiusura.
Non dichiarare concluso un intervento se la VM111 contiene modifiche operative
non riportate nel repository o se il push non e confermato.

Il progetto Codex LLM Wiki mantiene la radice IT/RAG per la continuita; questo
checkout AgentOfficePalace e il repository del software. Non cambiare origin
del repository storico RAG_maros e non mescolare le cronologie.
La mappa delle destinazioni e in maros/project-link.json.
Il repository documentale degli agenti e separato: i documenti seguono i loro
gate e la pubblicazione nel vault; non vanno aggiunti al repository del software.

Flusso: modifica nel repository, controlli pertinenti, commit/push e PR su main;
allineamento della VM al commit pubblicato e verifica della corrispondenza.
Se una diagnosi richiede una correzione diretta sulla VM, riportarla subito
nel repository nello stesso incarico e chiudere con commit/push verificati.
Credenziali, autenticazione, database, sessioni, vault e dati degli incarichi
rimangono esterni a Git. Non creare commit vuoti per attivita in sola lettura.
Il controllo finale sulla VM e:
python3 -B /srv/data/agent-office/source/maros/tools/check_runtime.py --check-image
Questo obbligo non introduce job periodici o pubblicazioni implicite nella wiki.
