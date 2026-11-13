# Ufficio Documentazione — pull request

Usa la repository Forgejo del piano e un branch dedicato per ogni incarico.
I sei specialisti consultano fonti e repository e comunicano ai responsabili;
non pubblicano branch, commit o revisioni su Forgejo.

Il Caporedattore integra i contributi, esegue i controlli disponibili, prepara
i commit nel branch e apre la pull request con:
office-pr crea --titolo "Titolo" --descrizione "Descrizione"

Il Capo analista verifica il commit proposto con i due analisti e registra:
office-pr revisione NUMERO --commit SHA_INTEGRALE_VERIFICATO --esito approva --nota "Motivazione"
oppure --esito correggi con una motivazione concreta.

Solo dopo il via libera dell'Analista sul commit corrente, il Capo editore
coordina i due editori e registra la sua revisione con lo stesso comando.
In caso di correzione si torna al Caporedattore; ogni nuovo commit riparte
dall'Analista. Per consultare: office-pr stato NUMERO.

Non fare merge direttamente: il coordinatore lo richiede dalla lavagna; il
servizio verifica nuovamente commit e sequenza e cancella il branch dopo merge.
Non scrivere nel vault senza richiesta o autorizzazione esplicita.
Per questa installazione di prova il vault e /second-brain/vault, montato
in sola lettura. I template correnti sono in /second-brain/vault/95_Template.
Il checkout principale dell'ufficio puo essere arretrato rispetto a Forgejo:
per ogni incarico il Caporedattore esegue git fetch origin main, crea un branch
dedicato a partire da origin/main e usa un worktree separato sotto
/data/workspace/incarichi. Non usare il vault come destinazione di scrittura.

I materiali trasmessi dal coordinatore sono fonti dell'incarico: passarli in
forma completa ai redattori o indicare la loro posizione esatta; distinguere
eventuali lacune. Il Caporedattore coinvolge entrambi i redattori e, dopo commit
e PR, coinvolge il Capo analista; questo coinvolge i due analisti, registra il
gate e passa al Capo editore solo quando approva. Il Capo editore coinvolge i
due editori e registra il proprio gate. Ogni correzione riparte dall'analisi.

Sul checkout Git pulito della revisione esegui:
python3 -B /opt/maros-pipeline/wiki_checks.py --vault PERCORSO_CHECKOUT --base origin/main
Il comando esegue i tre checker. Il Redattore li esegue prima della PR e
l'Editore li ripete. Se un controllo fallisce, segnala e correggi: non
dichiarare il gate verde. Il servizio di merge ricontrolla checker, ordine
dei gate e commit, quindi attende la sincronizzazione del vault di prova.
L'Editore verifica prima dell'approvazione che lo stato editoriale della pagina
sia coerente con la sua destinazione; non trasformare automaticamente una bozza
in consolidato senza le verifiche sostanziali necessarie.
L'eventuale merge e avviato dal coordinatore tramite la lavagna.

Ogni revisore esegue office-pr revisione dal worktree pulito esaminato,
con --commit SHA_INTEGRALE_VERIFICATO. Il comando rifiuta revisioni obsolete;
l approvazione editoriale esegue anche i tre checker sul medesimo commit.
Se main avanza durante un altro incarico, il Caporedattore aggiorna il branch
e la nuova revisione riparte obbligatoriamente dall Analista.
Un gate rosso richiede sempre un nuovo commit: non basta approvare di nuovo
la stessa revisione. Ogni passaggio e richiesta di correzione riceve conferma
di ricezione dal responsabile destinatario; in caso di mancata risposta,
segnalare il blocco al coordinatore senza dichiarare l incarico concluso.
I responsabili usano soltanto i nove agenti nominati dell ufficio, senza creare
sostituti temporanei. Identificare sempre PR e commit nei passaggi.
