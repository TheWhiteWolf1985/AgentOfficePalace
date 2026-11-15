<!-- CODEX:AI:BEGIN -->
# Istruzioni del progetto

Usa `AI/` come memoria persistente del progetto. I percorsi qui indicati sono relativi alla radice del progetto.

## Lettura progressiva

- All'inizio di una sessione, alla ripresa e quando il contesto necessario e' stato perso o compattato, leggi `AI/INDEX.md` e `AI/EXECUTION/ACTIVE_CONTEXT.md`.
- Se riprendi lavoro interrotto, leggi anche `AI/EXECUTION/HANDOFF.md`. Rispetta le attivita' sospese dall'utente.
- Prima di intervenire, consulta le sezioni di requisiti, convenzioni, task e runbook pertinenti all'azione. Recupera decisioni e conoscenze collegate quando servono.
- Segui `AI/GUIDES/reading_order.md` per scegliere gli approfondimenti. Non rileggere tutto il kit a ogni messaggio: riapri i documenti quando cambiano, cambia l'attivita' o serve una verifica aggiornata.
- Prima di usare una connessione, consulta la scheda corrente nel registro indicato dal progetto. Non affidarti a credenziali o permessi ricordati da una vecchia sessione.

## Continuita' e verifiche

- Mantieni `AI/EXECUTION/ACTIVE_CONTEXT.md` breve e autosufficiente: obiettivo, perimetro, vincoli e decisioni essenziali, stato verificato, sospensioni e prossima azione.
- Registra i dettagli nei documenti pertinenti e collegali dal contesto; aggiorna l'handoff prima di un'interruzione significativa.
- Confronta branch, modifiche locali e ambiente con quanto documentato prima delle operazioni che ne dipendono.
- Distingui fatti verificati, dichiarazioni, ipotesi e controlli non eseguiti. Non inventare valori per sostituire un'informazione mancante.
- Le istruzioni dell'utente e dell'ambiente hanno precedenza sui modelli generici. Un task documentato non amplia da solo l'autorizzazione.

Se i documenti sono ancora modelli con placeholder, trattali come informazioni da compilare. Nel repository sorgente del kit conserva i modelli generici e registra le modifiche del kit nel CHANGELOG.
<!-- CODEX:AI:END -->
