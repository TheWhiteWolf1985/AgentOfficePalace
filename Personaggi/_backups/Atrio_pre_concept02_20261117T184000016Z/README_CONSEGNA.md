# Due donne voxel sorridenti — prima versione per revisione

Revisione grafica del 16 novembre 2026, contratto AOP_CHAR_RIGID_1 / kit 1.0.0.

`reception_a` è la donna con capelli lunghi biondi e occhi azzurri; `reception_b` ha capelli castani a caschetto e occhi verdi. Entrambe hanno gonna, scarpe con tacco a blocco, giacca scura, camicia chiara, volto sorridente e occhi disegnati a mandorla con iride, pupilla e riflesso. Corpo e capelli conservano il linguaggio squadrato richiesto. Abiti, palette e dettagli sono una prima proposta modificabile, non un'approvazione artistica finale di Juri.

Entrambi gli asset sono `profile=human`. Sono figure decorative in piedi, senza mansioni, percorsi, AI, sessioni, terminali o logica implementata. Questa consegna contiene soltanto i due NPC: non include human_base, agent_base o first_person_hands.

## File e viste

- `reception_a.blend`, `reception_b.blend`: sorgenti separati con controlli contrattuali, geometria e allestimento fotografico. Solo la gerarchia char_root viene esportata; camere, luci e piano fotografico restano esclusi dal GLB.
- `reception_a.glb`, `reception_b.glb`: asset autosufficienti, origin locale al suolo, root identità e scala 1. Nessun arredo, skin, armatura, morph, clip o root motion.
- `*.manifest.json`, `*.check.json`: provenienza, materiali, nodi, SHA-256 e controllo sul GLB finale.
- `*.reimport.blend`: reimportazioni separate in scene vuote, con allestimento di revisione.
- `pair_review.blend`: confronto dei due asset reimportati. Suffissi creati dall'importazione di due rig nella stessa scena sono limitati a questa scena di confronto.
- `reception_fit.reimport.blend`: scena separata con l'Atrio originale e i GLB finali, esclusivamente per la prova di ingombro. L'Atrio non è incorporato nei GLB né nei .blend sorgente dei personaggi.
- `views/front.png`, `side.png`, `back.png`, `pair_three_quarter.png`, `faces_closeup.png`: viste reali degli asset esportati e reimportati.
- `views/reception_from_visitor.png`: camera visitatore a quota 1,40 m, istanze NPC a scala 1,15.
- `views/poses.png`: prima riga bionda, seconda castana; colonne riposo, due fasi cammino, seduta, presa, carta/libro, scala, palo. I fogli individuali `reception_a_poses.png` e `reception_b_poses.png` seguono lo stesso ordine, quattro colonne e due righe. Nessun oggetto di scena è richiesto per queste prove dei pivot.
- `views/*_visibility.png`: testa/capelli/occhi/bocca e braccia/mano nascosti, torso e gambe mantenuti visibili.
- `VALIDATION.json`, `BUILD_REPORT.json`, `BLENDER_QA.json`: risultati e limiti effettivi. QA applicativa NOT_RUN.

## Scala e fit

Un'unità corrisponde a un metro. GLB +Y alto, fronte +Z; Blender +Z alto, fronte -Y. La statura locale è circa 1,7655 m, circa 2,0303 m nelle sole istanze reception. I pivot del kit non sono stati spostati. Il margine fra braccia sollevate e testa/capelli è ottenuto modificando la geometria sotto i controlli.

`reception.placements.json` è copiato senza modifiche dal kit. La scala 1,15 si applica esclusivamente alle due istanze nella scena di prova e nella futura integrazione. Non è incorporata nei vertici o nel root dei GLB. Banco, monitor, sedie, pannello e Atrio originale sono preservati. La vista dal visitatore mostra entrambi i sorrisi e gli occhi sopra il banco; gonne e tacchi sono verificabili nelle viste a figura intera.

## Ricostruzione portabile

Il design è descritto interamente in `build_scene.py`: cuboidi, piani dei lineamenti, ellissi delle iridi, silhouette dei capelli, abiti e scarpe. Lo scaffold è soltanto la sorgente della gerarchia. Tutti i moduli necessari sono qui inclusi; nessun download o pacchetto Python aggiuntivo è richiesto. Serve Blender con import/export glTF (collaudato con 5.3.0).

Dalla directory di questa consegna, con Blender disponibile come comando:

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
blender --background --factory-startup --python qa_scene.py -- --out rebuilt
python -B verify_delivery.py
```

Per ricostruire anche il fit, aggiungere al primo comando `--atrium PERCORSO_AL_KIT/reference/atrium_reference.glb`. Il file originale resta un input esplicito separato: lo script ne confronta SHA-256 con il placement prima di usarlo. Senza tale argomento ricostruisce entrambi i personaggi e le viste individuali, non l'ambiente. `--skip-views` ricostruisce solo sorgenti e GLB.

`contact_sheets.py` assembla i PNG senza dipendenze esterne. `qa_scene.py` verifica le rotazioni effettive, i materiali, la visibilità e l'isolamento di due importazioni in Blender. Questi controlli non certificano l'adattatore o il renderer dell'app.

## Materiali, licenze e limiti

Pelle, abiti e capelli hanno materiali uniformi distinti e ricolorabili; occhi, camicia, dettagli e scarpe restano separati per ruolo. Le facce disegnate sono geometria, non una texture che incorpora i colori dinamici. I due asset usano 12 mesh, 23 primitive e 8 materiali ciascuno, entro il contratto. I triangoli sono inferiori al target raccomandato perché il design voxel richiede poche facce.

Geometria e lineamenti creati appositamente per Juri; nessuna skin o texture di Minecraft è inclusa. L'immagine allegata dall'utente è stata usata come riferimento estetico e non è ridistribuita. Scaffold e script derivati dal kit conservano la licenza MIT in `resources/LICENSE_SOURCE.txt`.

Le pose sono prove tecniche delle parti rigide, senza gomiti o ginocchia deformabili e senza animazioni consegnate. La verifica visiva riguarda i render elencati, non ogni angolo possibile. La resa toon, i colori e le pose indipendenti nel runtime, nonché la presenza permanente degli NPC senza uffici, richiedono l'adattatore e la QA successivi. L'aspetto resta in revisione con Juri.

`checksums.json` contiene SHA-256 di tutti gli altri file della cartella. Esclude soltanto sé stesso per evitare un riferimento ricorsivo; il checksum dell'archivio esterno copre anche questo inventario. Non sono stati eseguiti commit, push, merge, deploy o installazioni nell'app.
