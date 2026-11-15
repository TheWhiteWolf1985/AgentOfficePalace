# Istruzioni vincolanti — sala Blender Agent Office Palace

## Ingresso

Leggere nell'ordine: README_INIZIA_QUI.md, rules/CONSTRAINTS.md, rules/constraints.json, rules/DELIVERY.md, reference/INTEGRATION_NOTES.md. Questo e un incarico di asset 3D portatile; non e il checkout dell'applicazione.

## Autorita e liberta del design

- I vincoli tecnici HARD del contratto sono obbligatori. Le istruzioni esplicite successive di Juri prevalgono, ma ogni deroga va indicata con ID, motivazione e impatto nel manifest, senza fingere conformita al contratto originale.
- Non modificare constraints.json o gli script di verifica per far diventare verde un asset non conforme. Le modifiche di contratto devono essere esplicite e versionate come deroga, non nascoste.
- Stile, colori, materiali visivi, arredamento, disposizione, numero di posti e altezza desiderata spettano a Juri. Se mancano, creare soltanto lo scheletro tecnico; non scegliere autonomamente un progetto visivo finito e non bloccare il lavoro tecnico possibile con domande ripetute.
- Le raccomandazioni SOFT non diventano limiti rigidi. Non fissare arbitrariamente cinque sedie, un rapporto 16:9, un tetto alto 6,8m o un budget numerico di poligoni non richiesto.

## Confini dell'incarico

- Produrre un .blend modificabile, un .glb e i documenti/prove di consegna. Non accedere a server, repository remoti o credenziali; non installare agenti/CLI e non fare deploy.
- Non intervenire sul software applicativo o sul Second Brain. Non copiare documenti locali, segreti o configurazioni personali dentro l'asset.
- Conservare i file preesistenti di Juri. Usare work/ per gli intermedi. Nessun reset/cancellazione della scena aperta o sovrascrittura del .blend senza verificare la destinazione e l'autorizzazione gia fornita dall'incarico.
- Il modello sostituisce l'interno del locale sul tetto: non ricreare bar, DJ, giochi, bevande, cane, fumo o travestimenti senza una richiesta di design esplicita. Scale/pali, meteo/giorno-notte e celebrazioni dell'app rimangono; non incorporarli nel GLB come effetti duplicati.

## Metodo

- Perimetro metrico e volume ascensore devono restare riconoscibili per tutta la lavorazione. Guide in una raccolta separata non esportata.
- Ogni parte interattiva rimane separabile; la lavagna ha una superficie UV dedicata, i posti hanno ancoraggi e uscita, il soffitto si puo gestire separatamente.
- Consegnare uno script build_scene.py riproducibile e dichiarare la versione Blender utilizzata. Non limitarsi a screenshot di una scena irricostruibile.
- Eseguire validate_scene.py e inspect_glb.py, controllare l'asset reimportato e produrre le immagini richieste. Uno script non eseguito non e un test passato. Non rimuovere errori, non promuovere verifiche manuali non svolte a PASS.
- Se l'ambiente non consente Blender o un controllo, consegnare il lavoro possibile indicando il controllo non eseguito. Non dichiarare la consegna pronta all'integrazione finche rimangono requisiti HARD o review obbligatorie non verificati.
