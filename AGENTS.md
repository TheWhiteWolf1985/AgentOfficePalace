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
