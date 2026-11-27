# Canva: cartella di scrittura e creazioni gestite

In **Impostazioni → Plugin & Skills → Canva → Cartella di scrittura Canva**, l'amministratore imposta nome e ID di una cartella esistente e preme **Applica**. Office verifica la corrispondenza e l'accesso mediante il server MCP ufficiale. L'ID non viene preconfigurato nella distribuzione. Senza una policy valida, Canva rimane disponibile per le letture classificate, comprese le esportazioni; le scritture sono bloccate.

La regola si applica a tutti gli agenti che usano la connessione condivisa. Le credenziali rimangono nel container Plugin & Skills. Le risorse preesistenti fuori cartella sono in sola lettura; le sottocartelle non sono incluse. La verifica di appartenenza legge le pagine dell'elenco corrente, senza una lista di design autorizzati conservata indefinitamente.

## Creazione e spostamento

Gli strumenti di creazione classificati possono creare nella destinazione predefinita di Canva. Il servizio registra il flusso prima della richiesta, associa gli output restituiti dal provider e li sposta automaticamente nella cartella configurata. Solo la verifica della presenza di tutti gli output conclude il flusso. Le sorgenti esterne usate per una copia o come riferimento restano inalterate.

`create-design` puo restituire un job. Office ne conserva l'identificativo e il token di continuazione nel proprio stato privato e prosegue le letture di stato rispettando l'attesa del provider. Al completamento, lo spostamento parte dal servizio senza richiedere un altro prompt. Il recupero dopo riavvio richiede lo stesso account e la stessa revisione della policy.

Un errore o una risposta persa non avviano nuovamente la creazione. Gli output noti rimangono pendenti e sono visibili agli amministratori nel pannello. **Verifica creazione pendente** riconcilia gli stati conosciuti; prima di ripetere uno spostamento dall'esito incerto il servizio verifica la presenza in cartella. Se l'esito non e ricostruibile, segnala il problema senza cancellazioni automatiche. `canva.creation-status` permette a ciascun agente di leggere soltanto i propri flussi pendenti.

## Operazioni classificate

| Gruppo | Comportamento |
| --- | --- |
| Ricerca, design, pagine, contenuti, cartelle, Brand Kit/template, commenti e risposte in lettura | Lettura delle risorse accessibili all'account, con parametri e schema verificati |
| Esportazione | Lettura dell'originale ed esportazione; nessuna nuova risorsa Canva |
| Creazione, copia, brand template, importazione URL, autofill e resize | Output di design gestiti con creazione, spostamento e verifica; uno schema incompatibile o un output non riconciliabile blocca il flusso |
| Transazioni di modifica, commit e commenti | Solo sui design direttamente nella cartella; transazioni associate ad agente, piano, connessione e revisione della policy |
| Generazione legacy a candidati, upload/generazione immagini e trasformazioni di asset | Bloccati: non e implementato un contratto completo di finalizzazione dei relativi output |
| Spostamenti arbitrari, cartelle, condivisioni, pubblicazione, cancellazioni e strumenti sconosciuti | Bloccati anche per chiamata diretta; lo spostamento dei nuovi output e un'operazione interna del servizio |

Una nuova autorizzazione OAuth invalida l'associazione della policy precedente; il rinnovo ordinario del token la conserva. Per il nuovo collegamento occorre verificare nuovamente la cartella. Le transazioni incerte non possono essere confermate una seconda volta; e consentito annullare una transazione gestita senza attribuire permessi di modifica al suo design.

## Confini e recupero

La protezione riguarda il connettore Office, non i permessi dell'intero account sul sito Canva o su altre applicazioni. L'abbonamento rimane invariato. Una verifica di cartella e una mutazione non sono atomiche rispetto a uno spostamento manuale contemporaneo sul sito: le operazioni Office sono serializzate e ripetono i controlli, ma questo rischio residuo non e eliminato da un vincolo lato Canva.

Policy e associazioni sono nel volume privato del container, in `canva-policy.json`; l'audit ruotato e in `canva-audit.jsonl`. L'audit include identificativi, operazione ed esito, non prompt, contenuti dei design, token o URL firmati. In caso di recupero verso una versione precedente al controllo, disabilitare le scritture Canva o il collegamento prima di avviare il vecchio codice: un prompt non sostituisce questa protezione.

Le prove automatiche usano risposte simulate e spie sul trasporto. Il consenso reale e il risultato grafico sul vostro account sono una verifica distinta: nessun esito simulato certifica quel collaudo.
