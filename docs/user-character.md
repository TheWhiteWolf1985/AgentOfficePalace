# Personaggio e colori degli utenti

`Personaggi/Utenti_maschio/` conserva la consegna Blender revisione 02 immutata, compresi
sorgenti, licenza e verifiche del produttore. `python -B scripts/import-human-base.py`
verifica l’inventario SHA-256 e copia il solo GLB nella cartella runtime.

Il rig rigido `AOP_CHAR_RIGID_1` resta in metri, scala 1:1, altezza 1,7655 m.
Movimento, sedute, lettura, oggetti, scale e pali usano il controller esistente.
NPC e agenti non cambiano. Le basi maschile e femminile condividono rig e
acconciature modulari. I sorgenti femminili sono in `Personaggi/Utenti_femmina/`.

## Nove colori

Impostazioni → Tu → Il tuo personaggio offre selettori colore e campi HEX per
pelle, capelli, sopracciglia, occhi, giacca, camicia, cravatta, pantaloni e scarpe.
L’anteprima usa una bozza privata. Salva applica i colori al personaggio e li
trasmette agli utenti collegati; chiudere senza salvare conserva le preferenze
precedenti. Colori originali ripristina la palette consegnata nella bozza.

`Look.colors` contiene una versione (`1`) e nove valori sRGB `#RRGGBB`, validati
con una lista chiusa di campi. In assenza del campo si mantiene la palette
precedentemente mostrata dal GLB, conservando anche i vecchi indici pelle,
capelli e stile. `Profile.color` continua a rappresentare il colore storico
usato anche dall’interfaccia; è distinto dal nuovo colore della giacca.
Versioni sconosciute o valori non validi mantengono i valori precedenti.

Le preferenze restano nel localStorage del browser, come il profilo esistente:
il salvataggio per account condiviso tra dispositivi non è parte di questa
modifica. Connessione iniziale, riconnessione e aggiornamenti WebSocket
trasportano tutti i colori. Le istanze hanno materiali indipendenti.

Le sopracciglia seguono la testa e sono separate dai capelli. Le scarpe hanno
un materiale indipendente dal volto; i pantaloni comprendono la parte superiore
solidale al torso e le due gambe. Pupille, contorni del volto e bianco degli
occhi/denti mantengono i colori originali. Le mani FPS conservano la geometria
precedente e usano i colori effettivi di pelle e giacca. Il sorriso resta statico.

## Validazione applicativa

La revisione contiene 522 triangoli, 13 mesh, 25 primitive e 11 materiali,
43.044 byte. Il contratto originale (8 materiali, 24 primitive) conserva il suo
FAIL documentato dal produttore. La policy applicativa `AOP_HUMAN_COLORS_1`, in
`scripts/policies/human-base-v02.json`, autorizza solo i due limiti aggiornati
per questa revisione umana e richiede i nove ruoli materiale. Rig, scala,
bounds, dimensione, assenza di skin/clip e tutti gli altri controlli rimangono.

L’importer verifica che gli unici errori originali siano i due budget e la
relativa dichiarazione. Riesegue poi il validatore con una copia in memoria
del contratto e del manifest, applicando i limiti autorizzati. Contratto,
validatori e rapporti originali non vengono riscritti; il log distingue il
FAIL originale dal PASS della policy applicativa.

Le geometrie GLB restano condivise nella cache, i materiali toon sono privati
per istanza. La chiusura dell’anteprima e la rimozione dei peer liberano le
risorse proprie senza eliminare le geometrie degli altri personaggi.


## Basi e acconciature

Il selettore Modello offre Maschile e Femminile. Look.model usa gli ID stabili
male/female; Look.hairstyle usa short, long, bun, spiky, curly, ponytail, bald.
Sono campi opzionali: i vecchi profili mantengono maschile/corti, indipendentemente
dal vecchio indice style che in precedenza non modificava il GLB. La femminile
usa long quando non è stato scelto esplicitamente uno stile. Una scelta esplicita
rimane valida passando da una base all’altra. Il salvataggio resta per browser.

La femminile consegnata comprende gonna, gambe scoperte, tacchi e fiocco fisso.
Il canale pants colora la gonna (etichetta Gonna); skin colora anche le gambe.
Il campo opzionale Look.colors.bow personalizza soltanto il fiocco sulla testa;
il nastro al collo conserva tie. Il controllo Fiocco appare soltanto sulla base
femminile. Il fiocco resta sotto char_head con ogni stile, inclusa l’opzione
Senza capelli, e si nasconde insieme alla testa in prima persona. Sopracciglia
e fiocco sono esterni a char_hair.

I corpi e sei componenti capelli sono precaricati. Ogni avatar visualizza una
sola acconciatura; bald rimuove solo i figli di char_hair. I componenti riusano
il materiale capelli privato dell’istanza e geometrie condivise della cache.
Il cambio corpo preserva l’oggetto root e l’identità del rig del controller,
trasferisce libro/carta tenuti e mantiene nome, microfono e posa. La prima
persona rileva il cambio del body e riapplica la visibilità e le proporzioni.

## Importazione femminile

`python -B scripts/import-female-avatar.py` verifica i 358 checksum della
consegna, le sette componenti e le quattordici combinazioni corporee. Copia nel
runtime solo female_base.glb e i sei componenti non vuoti; il maschile rimane
byte per byte invariato dopo la rinomina della cartella in Utenti_maschio.

La policy AOP_FEMALE_COLORS_1, in scripts/policies/female-avatar-v03.json,
autorizza per questa revisione femminile 12 materiali e 26 primitive, richiesti
dal fiocco con colore indipendente. Richiede i nove ruoli originali più bow,
rig e vincolo del fiocco fisso. La policy maschile 11/25 resta invariata. Il
contratto originale e i rapporti del produttore conservano i FAIL di budget;
il PASS applicativo viene registrato separatamente. Le componenti capelli
hanno controlli propri e non vengono certificate come corpi completi.

I rapporti Blender coprono il dominio dichiarato dal produttore; i test runtime
coprono le quattordici combinazioni con il controller effettivo, il cambio
corpo in prima persona, colori/fiocco e rilascio delle geometrie condivise.
