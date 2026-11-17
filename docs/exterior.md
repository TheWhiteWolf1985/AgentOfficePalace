# Esterno aziendale

L'Atrio, gli uffici e la Sala riunioni mostrano lo stesso lotto essenziale: edificio aziendale, una strada perimetrale e quattro alberi. Non vengono costruiti quartieri, palazzi vicini, parchi lontani, parcheggi o skyline.

`src/shared/ground.ts` definisce strada, marciapiedi, percorsi pedonali, alberi e confini. Il lotto percorribile misura 84 x 76 m. La strada e larga 8 m e riserva spazio per entrambe le estensioni posteriori degli uffici, per il balcone e per le scale esterne. Client e server usano gli stessi confini; le posizioni salvate oltre il nuovo lotto vengono scartate e si rientra attraverso il normale punto di arrivo, conservando profilo e impostazioni.

`src/client/world/outside.ts` costruisce terreno e superfici usando quelle coordinate. Un piano erboso semplice raggiunge la foschia, evitando che il lotto sembri sospeso nel cielo: non contiene altri oggetti o suddivisioni del paesaggio. Il terreno ha un foro per l'Atrio, cosi non copre parquet e tappeti. Strada, marciapiedi e percorsi alimentano anche la scelta dei suoni dei passi.

`src/client/world/company-exterior.ts` compone il lotto e la torre della propria azienda per gli spazi comuni. Mantiene piani e ali, ma non il precedente generatore della citta. Il vero Atrio non costruisce una seconda copia nascosta di se stesso; i due receptionist sono presenti nel vero Atrio e non nelle copie degli interni viste da lontano.

Scale e pali dei vigili, ascensore, meteo, giorno/notte e celebrazioni rimangono disponibili. Tre piccoli gruppi di nuvole seguono il colore del meteo e la stessa quota rispetto al terreno. Sono stati rimossi i lampioni urbani e le luci dei vicini; rimane l'illuminazione dell'edificio. La destinazione legacy `@garage` continua a portare all'Atrio e non introduce un piano aggiuntivo nel menu ascensore.

La lavagna della Sala riunioni, il logo della reception, gli NPC e la personalizzazione degli avatar non cambiano. Il caricamento generale dei modelli, i menu degli spazi comuni e nuove funzioni di presentazione sono interventi separati.
