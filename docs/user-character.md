# Personaggio e colori degli utenti

`Personaggi/Utenti/` conserva la consegna Blender revisione 02 immutata, compresi
sorgenti, licenza e verifiche del produttore. `python -B scripts/import-human-base.py`
verifica l’inventario SHA-256 e copia il solo GLB nella cartella runtime.

Il rig rigido `AOP_CHAR_RIGID_1` resta in metri, scala 1:1, altezza 1,7655 m.
Movimento, sedute, lettura, oggetti, scale e pali usano il controller esistente.
NPC e agenti non cambiano. Il modello maschile e l’acconciatura corta sono le
uniche varianti disponibili in questa consegna.

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
