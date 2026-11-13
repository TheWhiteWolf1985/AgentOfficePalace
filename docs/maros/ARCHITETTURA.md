# Personalizzazioni MAROS

Snapshot del codice operativo sulla VM111 agent-office, 192.168.1.76, al 13 novembre 2026.
Nessuna modifica al comportamento applicativo e introdotta da questa importazione.

## Codice interno ad Agent Office

- src/server/forgejo.ts legge PR, diff, commenti e revisioni dal Forgejo del piano e chiama il servizio di merge.
- src/server/github.ts e il gestore WebSocket instradano le operazioni al provider corretto.
- src/client/ui/boards.ts e src/client/ui/github mostrano PR Forgejo e merge controllato.
- src/shared/protocol/github.ts trasporta lo SHA e l esito dei gate.
- src/server/codex.ts e workers/manager.ts riconoscono Codex pronto dopo una ripresa, senza nascondere vere richieste interattive.
- src/server/hooks/server.ts permette l ascolto del servizio agenti sulla rete dei container.

## Componenti esterni all applicazione

maros/pipeline conserva esattamente gli script operativi: comandi PR per ruolo,
valutazione delle revisioni, checker prima di approvazione e merge, servizio di merge,
pubblicazione unidirezionale main-verso-vault, sincronizzatore e test.
Gli script bin/codex e bin/office-pr avviano gli agenti nel rispettivo container
con l identita Forgejo assegnata. I sei specialisti usano l identita di lettura;
i tre responsabili hanno identita distinte. Il coordinatore richiede il merge al servizio.

Il Caporedattore coinvolge i due redattori; il Capo analista i due analisti;
il Capo editore i due editori. Un incarico usa un branch e una PR.
Un gate rosso richiede un nuovo commit e la ripartenza dall analisi.
Le approvazioni devono riguardare lo stesso SHA, nell ordine Analista-Editore.
L approvazione editoriale e il merge richiedono i tre checker.
Il servizio rifiuta branch arretrati rispetto a main e ricontrolla i gate prima del merge.
Dopo il merge elimina il branch e attende la pubblicazione del vault.

## Verifiche gia osservate sulla VM111

Diciannove test automatici della pipeline superati. PR6 del Forgejo locale:
fonte sintetica integrale, gate Analista rosso e correzione, gate Editore rosso,
correzione e nuovo ciclo Analista-Editore, merge, cancellazione del branch e vault identico a Git.
La PR7 ha rimosso la simulazione; il vault finale contiene 5851 file.
Riavvio completo VM e successiva risposta reale Codex verificati.
Il collaudo era controllato, con difetti noti, e riguarda un incarico alla volta;
non misura alla cieca la qualita documentale e non certifica carico o incarichi simultanei.

Le evidenze complete restano fuori da questo repository nella VM:
/srv/data/agent-office/evidenze/pipeline-completa.
La possibile espansione a 16 GB di RAM resta una valutazione futura.
