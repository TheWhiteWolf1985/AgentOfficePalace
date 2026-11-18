# Base femminile e acconciature modulari — versione 2 — gonna e tacchi

Consegna del 17 novembre 2026. Riferimento tecnico e stilistico: `human_base` maschile revisione 02 con materiali indipendenti. Il pacchetto maschile originale, locale e nella cartella condivisa `Utenti_maschio`, è preservato. Lavoro limitato ad asset e verifiche Blender; QA applicativa **NOT_RUN**.

## Base femminile

`female_base.blend` e `female_base.glb` contengono la base femminile completa con lo stile iniziale **short**. Correzione esplicita di Juri: la figura femminile indossa giacca, camicia, cravatta, gonna e scarpe con il tacco a blocco, riprendendo le NPC dell’Atrio. Non sono presenti pantaloni sulla base femminile. Il canale stabile pants / char_mat_pants colora la gonna; shoes / char_mat_shoes colora i tacchi; skin / char_mat_skin colora anche le gambe scoperte. Giacca sagomata alla vita, fianchi e mandibola differenziano la figura senza modificare la superficie superiore comune della testa.

Profilo `human`, controlli `AOP_CHAR_RIGID_1`: stessi nomi, parentela, trasformazioni locali, pivot e socket del riferimento. Scala 1:1, unità metri, origin ai piedi, GLB +Y alto/+Z avanti. Altezza con short circa 1,7655 m; bald circa 1,72 m perché manca il volume dei capelli. Bun arriva a 1,83 m, spiky a 1,84 m e curly a 1,815 m. Gli ingombri completi a riposo rispettano l'AABB originale del kit. I limiti AABB del contratto riguardano il riposo, non il volume percorso dagli arti durante una posa.

Nessuna armatura, skin, morph target, clip, root motion o logica applicativa. Torso/gambe restano visibili quando si nascondono ricorsivamente testa e braccia. Le pose di seduta utilizzano i pivot originali; posizionamento su sedie e controller dell'app restano da integrare e verificare nell'app.

## Colori

La palette iniziale è quella della revisione 02. I nove canali indipendenti sono:

| Ruolo | Materiale |
|---|---|
| skin | `char_mat_skin` |
| hair | `char_mat_hair` |
| eyebrows | `char_mat_eyebrows` |
| iris | `char_mat_iris` |
| clothing, soltanto giacca | `char_mat_clothing` |
| shirt | `char_mat_shirt` |
| tie | `char_mat_tie` |
| pants, gonna sulla base femminile / pantaloni sulla maschile | `char_mat_pants` |
| shoes | `char_mat_shoes` |

`char_mat_dark` e `char_mat_white` restano i materiali accessori del volto. Colori uniformi PBR, nessuna texture che incorpori le tinte personalizzabili. Le sopracciglia sono una mesh sotto `char_head`, esterna a `char_hair`. La testa è completa e chiusa anche senza capelli.

## Componenti capelli e sostituzione

Gli ID stabili sono **short, long, bun, spiky, curly, ponytail, bald**. Ogni stile ha `.blend`, GLB autonomo e manifest sotto `hair/`. `hair/CATALOG.json` definisce il catalogo e la compatibilità con entrambe le basi. Lo short riprende esattamente la geometria e il colore del riferimento maschile.

Ogni componente non vuoto contiene una sola mesh, una sola primitive e il solo materiale `char_mat_hair`. `hair_component_root` ha TRS locale identità: posizione `(0,0,0)`, quaternione `(0,0,0,1)`, scala `(1,1,1)`. I vertici sono già nello spazio locale del pivot `char_hair` (quota del pivot della testa 1,32 m). Non applicare una seconda conversione di assi o traslazioni correttive.

Per sostituire lo stile: rimuovere la mesh capelli corrente sotto `char_hair`, poi agganciare il componente scelto con TRS locali identità. Deve essere attivo un solo stile. Lo script Blender `assemble.py` esegue questa operazione e produce un GLB completo e relativo manifest.

**Bald** è un GLB con root vuoto e zero geometria: la configurazione rimuove tutti i capelli e conserva testa e sopracciglia. Il materiale PBR hair può rimanere inutilizzato nel GLB per conservare la palette del canale; non sono presenti mesh o primitive invisibili. Ricolorare hair in bald non produce una modifica visibile finché non viene scelto uno stile con geometria.

La superficie di aggancio comune è la parte superiore della testa: Blender X ±0,27 m, Y da -0,30 a +0,27 m, sommità Z=1,72 m; pivot Z=1,32 m. Il contatto intenzionale dei capelli con lo scalpo è distinto da un'intersezione con occhi, sopracciglia, bocca, naso, spalle, mani o vestiti.

## Avatar assemblati e budget

`assemblies/` contiene i 14 GLB e sorgenti `.blend` di verifica: due basi × sette stili. Quelli maschili sono copie di prova per l'assemblaggio; non sostituiscono o alterano il pacchetto maschile originale. La geometria, i materiali e le normali del corpo maschile sono confrontati con il riferimento, escludendo soltanto la mesh capelli. In assemblaggio vengono ripristinate le normali originali se il roundtrip Blender ne introduce un arrotondamento, senza modificare vertici o topologia.

Budget della richiesta corrente: massimo **11 materiali e 25 primitive** per avatar con un solo stile. Tutti gli altri limiti originali restano invariati: 12.000 triangoli, 24 mesh, 4 MiB, AABB e rig del profilo human. Gli avatar di questa consegna restano vicini alla complessità del riferimento: meno di 1.000 triangoli, 13 mesh, 11 materiali, 25 primitive (12 mesh e 24 primitive con bald).

Il validatore originale e `resources/constraints.json` non sono stati modificati. I risultati `*.original_check.json` conservano il **FAIL rispetto ai vecchi limiti 8 materiali/24 primitive** e alla dichiarazione di deviazione. I distinti `*.check.json`, `STRUCTURAL_QA.json` e `VALIDATION.json` valutano il budget 11/25 esplicitamente richiesto per questa consegna. Non sono lo stesso controllo. Il validatore del rig completo non si applica a un componente capelli isolato: i componenti hanno verifiche separate, inclusa la reimportazione in Blender.

## Verifiche eseguite e limiti

Ogni stile è verificato su entrambe le basi nelle otto pose: riposo, cammino A/B ±0,70 rad, seduta gambe -1,35/braccia -0,55 rad, presa -1,65 rad, carta/libro, scala, palo. Queste otto pose sono incrociate con nove orientamenti della testa: neutra, yaw ±25°, pitch ±15°, roll ±10°, due combinazioni yaw/pitch. Totale **1.008 casi**. Sono controllate le intersezioni delle superfici triangolate dei capelli con corpo/vestiti/mani; viso e naso sono verificati separatamente. Il normale contatto con lo scalpo è escluso dal test delle collisioni. Questi intervalli sono il dominio verificato, non una garanzia per qualsiasi rotazione arbitraria.

Sono inoltre controllati: roundtrip dei sette componenti e dei 14 avatar, tutti i controlli/local TRS, un solo stile attivo, palette, nove canali indipendenti, gonna e gambe scoperte sulla femminile, pantaloni sul maschile, tacchi, testa chiusa, sopracciglia sotto la testa, prima persona, risorse incorporate e conservazione del riferimento maschile.

**NOT_RUN nell'app:** adattatore ai controller, renderer toon, clonazione dei materiali tra istanze, selettore di acconciature, movimento/navigation e posizionamento effettivo su sedute. Nessuna di queste funzioni viene aggiunta dai modelli.

## Ricostruzione portabile

Tutti i moduli e gli input sono inclusi. Serve Blender (collaudato 5.3.0), nessun pacchetto Python aggiuntivo o download. Dalla cartella del pacchetto:

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
blender --background --factory-startup --python qa_components.py -- --out rebuilt
blender --background --factory-startup --python qa_assemblies.py -- --out rebuilt --render
blender --background --factory-startup --python presentation.py -- --out rebuilt
python -B verify_assets.py rebuilt
python -B verify_package.py
```

Esempio di assemblaggio di uno stile:

```text
blender --background --factory-startup --python assemble.py -- --base female_base.glb --component hair/hair_long.glb --style long --out assembled_long.glb
```

Il sorgente `female_design.py` ricostruisce la figura, `hair_design.py` ricostruisce gli stili; non sono soltanto importatori di scaffold. `resources/male_reference.glb` e il relativo manifest sono copie in sola lettura del riferimento, con SHA-256 registrato. `PORTABILITY.json` riporta la ricostruzione da una cartella separata.

## Immagini e lettura dei rapporti

`views/skirt_heels_detail.png` e `views/heels_side_detail.png` mostrano la gonna, le gambe scoperte e la sagoma dei tacchi. La v1 con pantaloni è preservata nel backup separato; questa consegna la sostituisce nella cartella femminile attiva.

- `views/male_female_comparison.png`: riferimento a sinistra, base femminile a destra, short.
- `views/styles_comparison.png`, `styles_side_comparison.png`, `styles_back_comparison.png`: riga superiore maschile, inferiore femminile; colonne short, long, bun, spiky, curly, ponytail, bald.
- `views/poses/*_sheet.png`: otto pose per ogni combinazione; quattro colonne e due righe nell'ordine delle pose elencate sopra. Sono inclusi anche i render individuali.
- `views/head/`: due orientamenti combinati della testa per ogni combinazione.
- `views/nine_color_channels.png`: colori temporanei di test in magenta, ordine skin/hair/eyebrows/iris/clothing/shirt/tie/pants/shoes. I file finali mantengono la palette iniziale.
- `views/first_person_visibility.png`: torso e gambe mantenuti dopo la rimozione visiva di testa e braccia.

`STRUCTURAL_QA.json` separa componenti e avatar assemblati. `COMPONENT_ROUNDTRIP.json`, `ASSEMBLY_QA.json`, `BUILD_REPORT.json`, `MALE_REFERENCE_PROTECTION.json`, `PORTABILITY.json`, `VALIDATION.json` e i manifest contengono esiti e hash. `checksums.json` copre tutti gli altri file, escludendo sé stesso e le cache Python generate.

Geometria originale creata per Juri; short e base tecnica derivano dal riferimento approvato. Scaffold e strumenti derivati mantengono la licenza MIT in `resources/LICENSE_SOURCE.txt`. Nessuna skin/texture esterna, modifica dell'applicazione, commit, push, merge o deploy.
