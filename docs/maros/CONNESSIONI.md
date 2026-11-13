# Collegamenti GitHub, Forgejo e gestione agenti

Le Impostazioni offrono due voci distinte, anche nella vista 2D:

- **GitHub e Forgejo**: server, account e repository.
- **Gestione agenti**: elenco degli agenti di tutti gli uffici, ricerca,
  proprietà individuali e assegnazioni delle identità remote.

La precedente voce **Agenti** conserva i valori generali dell'ufficio.
Queste pagine amministrative richiedono una sessione amministratore.

## Collegamento

Registrare il server con nome, provider e indirizzo HTTP/HTTPS. Si possono
registrare più istanze Forgejo e più account sullo stesso server.
Per un account si inseriscono etichetta, nome utente e token; la verifica
controlla l'identità tramite API. GitHub.com offre anche un accesso tramite
codice dispositivo nel browser, senza usare il terminale. Il token ottenuto
viene salvato esclusivamente sul server. Per altri indirizzi usare un token.

Un token Forgejo usato per scoprire l'identità e le repository deve consentire
le letture di utente, repository e issues. Un token limitato esclusivamente a
singole repository puo non consentire la scoperta dell'identità tramite /user.
I permessi di scrittura devono essere concessi sul servizio remoto soltanto
alle identità che li richiedono: assegnare un ruolo nell'Office non cambia i
permessi dell'account su GitHub o Forgejo.

Selezionando un account verificato si caricano le repository visibili a quella
credenziale. **Verifica accesso Git** controlla con `git ls-remote` che funzioni
anche la lettura Git; i permessi di scrittura mostrati sono quelli dichiarati
dal server e non costituiscono una prova di push. La lettura API, il Git e il
push sono verifiche distinte.

Una repository si puo collegare a un ufficio il cui origin corrisponde, oppure
clonare in un nuovo ufficio. Il percorso dei nuovi checkout include l'ID del
server per evitare collisioni fra repository omonime di server differenti.
PR e issues delle repository collegate usano il provider selezionato, senza
richiedere il login GitHub per una repository Forgejo.

## Identità degli agenti

In Gestione agenti ogni ufficio ha valori per i ruoli lettura, Caporedattore,
Capo analista e Capo editore. Il singolo agente eredita il proprio ruolo oppure
usa un account specifico verificato sul medesimo server. La pagina distingue
l'account configurato da quello effettivamente acquisito dalla sessione.

L'identità viene fissata all'avvio del processo: modificare le impostazioni
non sostituisce le credenziali di un incarico già in esecuzione. Ogni processo
riceve unicamente il proprio token. Non viene modificato un login Git globale.
Gli account ancora assegnati o usati da una sessione non si possono eliminare.
L'account ha un file distinto, in formato `TOKEN="..."`, letto e scritto
dall'applicazione; i segreti non vengono restituiti dalla pagina di elenco.

Nome, colore e scrivania compatibile sono modificabili. Provider, modello,
ragionamento e istruzioni iniziali seguono la validazione dei provider nativi.
Le modifiche al motore o alle istruzioni richiedono, se la sessione gira, la
conferma di una nuova sessione. Lo storico del terminale viene conservato.
Turni attivi, domande aperte e riunioni impediscono i riavvii incompatibili.
Identificativi, stato, sessione, worktree e dati generati restano in sola lettura.

## Persistenza della VM111

`/srv/data/agent-office/connessioni` e montata solo nel servizio Office come
`/var/lib/agent-office/connections`; `AGENT_OFFICE_CONNECTIONS_DIR` ne indica il
percorso. Contiene metadata connections.json, accounts/ID.env e public/policies.json.
Il servizio merge vede solo la directory public in sola lettura, senza token.
Gli agenti non montano l'archivio delle connessioni né credenziali di altri ruoli.
Segreti e configurazione runtime restano esterni al repository del software.

Il runner usa i nove container persistenti già predisposti; per nuovi agenti
crea un container dedicato alla sessione, rimosso automaticamente all'uscita.
I dati di lavoro, autenticazione Codex e conversazioni restano nei volumi dati.

La migrazione iniziale degli account esistenti si esegue con
`python3 -B maros/tools/migrate_connections.py`, prima in verifica e poi con
`--apply`. Non sovrascrive un archivio già creato e non stampa token. Se il token
del lettore non consente di identificare l'utente, l'applicazione crea sulla
sola istanza Forgejo della VM111 un token di lettura con scope read:user,
read:repository e read:issue. Gli account di scrittura restano quelli esistenti.

## Pipeline documentale

Il collegamento della repository documentale mantiene l'indicazione controlled:
non puo essere trasformato in un collegamento generico per aggirare i gate.
I revisori configurati devono essere distinti. Non si cambiano le loro identità
mentre sono aperte PR documentali. Il servizio di merge legge i nomi dei revisori
dalla policy amministrativa e ricontrolla commit, ordine e checker come prima.
Le protezioni Forgejo restano efficaci e devono consentire i revisori scelti.
La pagina non modifica automaticamente utenti o permessi del servizio remoto.

Nessuna connessione autorizza scritture dirette nel vault. I materiali degli
incarichi e la pubblicazione continuano a seguire la pipeline documentale.
