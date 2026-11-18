# Avatar nell’applicazione

Gli utenti usano le basi Concept 01 maschile e femminile. **Impostazioni → Tu → Il tuo personaggio** permette di cambiare modello, acconciatura e nove colori. La base femminile mantiene il fiocco anche con Senza capelli e ne offre il colore separato. La bozza resta nell’anteprima fino al salvataggio. I colori espliciti già salvati vengono riapplicati e Colori originali ripristina la palette del nuovo modello.

Entrambe le basi usano `AOP_CHAR_RIGID_1`, in metri e con origine ai piedi. Camminata, sedute, scale e pali usano il controller esistente. Le mani in prima persona mantengono la geometria esistente e adottano i colori del personaggio. Le due figure alla reception usano Concept 02, con le posizioni precedenti e scala 1,15 applicata alle istanze.

## Agenti

Nel modulo di creazione, **Aspetto dell’agente** parte da Casuale alla creazione. Personalizza permette di scegliere base maschile o femminile, una delle sette acconciature e i colori, con anteprima 3D. Anche l’assegnazione di una scheda a una scrivania vuota e i posti nella riunione di progetto offrono la scelta. La coda e le altre creazioni automatiche ottengono una combinazione dalle palette consegnate.

Il server valida e fissa modello, acconciatura e colori nel record del worker. Gli utenti collegati vedono la stessa scelta e il valore si conserva nel file `workers.json`. Gli agenti salvati prima dell’aggiunta ricevono un aspetto derivato dal proprio ID. Il colore dell’indicatore sul petto segue lo stato operativo. I colori del volto digitale aggiornano anche l’emissione. Le sessioni shell continuano a usare la figura procedurale.

L’app adatta i pivot del rig umano alle pose del worker a scrivania, in piedi, in cammino e durante le celebrazioni. I materiali sono privati per istanza. Geometrie e acconciature usano la cache condivisa e i corpi agente si caricano al primo utilizzo.

## Importazione

Eseguire `python -B scripts/import_characters.py` dalle quattro consegne in `Personaggi/`. L’importer verifica gli inventari SHA-256, i pivot, i materiali, gli accessori e l’identità delle acconciature tra pacchetti. Copia i sei corpi e i sei componenti capelli con geometria. Senza capelli usa un gruppo vuoto. Genera inoltre i dati delle due istanze all’Atrio e le palette dell’app.

Il contratto Blender originale prevede 8 materiali e 24 primitive. Le consegne riportano il superamento di questi limiti. L’importer usa limiti runtime specifici per i sei asset e verifica gli agenti sul rig umano esteso con pupille e indicatore. I rapporti Blender originali e il loro esito restano consultabili nelle quattro consegne.
