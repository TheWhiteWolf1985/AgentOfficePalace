# Agenti Concept 05 — pacchetto Blender e personalizzazione

Data: 17 novembre 2026. Approvazione artistica PASS: Juri, «Bene». Proposta tecnica separata ancora PROPOSED_NOT_APPROVED; la pubblicazione del pacchetto non certifica compatibilita col vecchio profilo agent. Nessuna modifica all'applicazione, agli utenti o ai NPC Atrio.

## Modelli

Due basi nelle dimensioni e proporzioni degli utenti approvati: agent_male_base e agent_female_base, scala1:1, origine ai piedi, altezza circa1,7655m. Stile voxel, volto grafite con occhi umanizzati e sorriso digitali ciano, giacca asimmetrica melanzana, dettagli ciano, camicia chiara. Uomo con pantaloni/scarpe basse e short iniziale; donna con gonna/tacchi, long iniziale e fiocco fisso. Corpi, controlli e acconciature derivati dal metodo geometrico degli utenti, mantenendo le parti indipendenti. I sorgenti del nuovo design sono inclusi, non richiedono i pacchetti degli utenti per ricostruire la bozza.

## Distinzione tecnica obbligatoria

Il profilo agent originale AOP_CHAR_RIGID_1 prescrive altezza massima1,35m, pivot braccia/mano diversi, piedi e occhi direttamente sotto char_body, non il rig umano. La richiesta di usare i corpi utenti alti1,7655m non e compatibile con quel profilo. Il contratto originale e i suoi validatori NON sono stati modificati.

Questi asset sono percio esplicitamente agent_humanoid_draft, con proposta separata AOP_AGENT_HUMANOID_DRAFT_1 in PROPOSED_AGENT_PROFILE.json, stato PROPOSED_NOT_APPROVED. Non vengono dichiarati conformi al profilo agent originale. Si eredita il rig umano per mantenere dimensioni/pivot/parti delle basi utenti e si aggiungono char_pupil_negx/posx sotto i rispettivi occhi e char_status sotto il torso. I socket umani rimangono; mappatura dei socket/controlli del vecchio Worker e nuovo contratto devono essere definiti nell'integrazione applicativa futura. Non sono stati creati alias fittizi per fare passare il validatore originale.

I rapporti assets/*.legacy_agent_check.json conservano FAIL effettivi per altezza, pivot, parentela, controlli mancanti e budget. I controlli della proposta verificano solo coerenza interna della bozza, non approvazione del nuovo contratto o compatibilita del controller esistente. Il rig mani in prima persona non viene modificato.

## Personalizzazione

Conservati i nove ruoli esatti: skin→char_mat_skin, hair→char_mat_hair, eyebrows→char_mat_eyebrows, iris→char_mat_iris, clothing→char_mat_clothing, shirt→char_mat_shirt, tie→char_mat_tie, pants→char_mat_pants, shoes→char_mat_shoes.

Skin colora l'involucro grafite (testa, mani e gambe visibili), clothing soltanto giacca/pannelli, pants anche i pantaloni superiori collegati al torso maschile oppure la gonna femminile, tie la chiusura superiore, shoes esclusivamente le scarpe. Sopracciglia esterne ai capelli e sotto la testa. Il fiocco femminile ha bow/char_mat_bow, resta sotto la testa e fuori dal gruppo capelli. Accent/char_mat_accent colora i bordi della giacca; mouth/char_mat_mouth il sorriso digitale, indipendente dagli occhi. Char_mat_dark e char_mat_white restano dettagli facciali separati. Tutti i colori personalizzabili sono uniformi, senza texture incorporate.

Pupille e iridi sono su mesh separate sotto i nuovi controlli pupilla; gli occhi le contengono, cosi scala/blink dell'occhio agisce anche sulla pupilla. Muovere la pupilla non muove sopracciglia o bocca. Colori di occhi, sopracciglia e sorriso usano baseColor e emissione PBR standard: l'adattatore deve aggiornare entrambi; intensita visiva0,35. Il catalogo descrive questa regola, non e una modifica gia installata nell'app.

Char_status e un indicatore piccolo sul petto con solo char_mat_status, emissivo e visibile anche senza luci. Nessun nome/stato/task stampato. Materiale di stato escluso dalle palette casuali: verra controllato dall'applicazione. Non confondere colore dell'aspetto e stato operativo dell'agente.

## Capelli e aspetto casuale

Set condiviso per entrambe le basi: short, long, bun, spiky, curly, ponytail, bald. Ogni componente hair/*.glb ha una sola mesh con char_mat_hair, aggancio char_hair con traslazione/rotazione locali nulle e scala1. Bald e senza geometria capelli; testa e sopracciglia rimangono complete, il fiocco femminile resta presente. Una sola acconciatura attiva per volta. Fit del fiocco nei casi estremi non e certificato da un controllo visivo completo.

APPEARANCE_CATALOG.json elenca asset ID, ruoli e palette RGB lineari. appearance.py produce dati di esempio deterministici per seed, usando Python3 random.Random(str(seed)); non promette lo stesso risultato con un generatore JavaScript diverso. L'app potra consumare questi dati o adottare un algoritmo condiviso. Ogni istanza deve avere materiali clonati, mentre le geometrie possono essere condivise quando appropriato.

SAMPLE_LOOKS.json e sei GLB/render dimostrano combinazioni scelte con seed ripetibile. Coprono short/long/bun/curly/ponytail/bald; spiky e incluso nel set e nelle verifiche. Le tinte inizialmente uguali restano materiali indipendenti. I campioni sono esempi visivi, non agenti software creati o randomizzazione installata.

## File e ricostruzione

- assets/agent_male_base.* e agent_female_base.*: sorgenti singoli, GLB autosufficienti, manifest esplicitamente draft, reimport separati e verifica del profilo agent originale.
- agents_concept05.review.blend: confronto uomo/donna.
- agents_variations.review.blend: sei varianti visive.
- hair/: componenti e sorgenti delle sette acconciature.
- build_scene.py, male_design.py, female_design.py, concept_style.py, support.py, hair_runtime.py, appearance.py, resources/: metodo completo locale di generazione. Gli scaffold e i tool originali sono inclusi; nessun percorso assoluto al PC autore richiesto in esecuzione.
- assemble_asset.py: solo assemblaggio Blender dell'asset, non CLI per creare processi/agenti software.
- DRAFT_VALIDATION.json, VARIANTS_QA.json, VALIDATION.json e PORTABILITY.json: esiti effettivi, limiti e SHA dei file verificati.
- qa_assemblies/: esportazioni di prova delle14combinazioni, separate dai due asset iniziali.
- views/: render reali dopo reimportazione, gaze/blink, pose, prima persona, capelli nascosti e stato senza luci.

```text
blender --background --factory-startup --python build_scene.py -- --out rebuilt
blender --background --factory-startup --python assemble_asset.py -- --asset agent_female_base --seed 2371 --out sample.glb
blender --background --factory-startup --python qa_variants.py
```

Tutti i moduli geometrici derivati sono inclusi; la ricostruzione non richiede i pacchetti utenti o un percorso al PC autore. La ricostruzione da una copia di codice/risorse in una seconda directory ha prodotto15GLB (due basi, sette capelli, sei esempi) byte-identici: PASS. --skip-views ricostruisce gli asset senza render. I dati di verifica dell'inventario si riferiscono alla consegna immutabile e non sono rigenerati automaticamente dal builder.

verify_package.py controlla GLB finali, rig proposto, colori/emissioni dei campioni, prove delle14combinazioni e inventario SHA256. Eseguire python -B verify_package.py. L'exit0 indica integrita e controlli funzionali interni passati: i FAIL del contratto agent originale e dei budget restano esposti nel JSON.

checksums.json contiene SHA256 di tutti gli altri file del pacchetto; il suo hash e nella ricevuta esterna di pubblicazione. Non sono inclusi cache, log, backup automatici Blender o snapshot dei contesti AI. I GLB in qa_assemblies sono prove riproducibili, non varianti da registrare come nuovi agenti nel sistema.

## Esiti e limiti

PASS funzionale interno della bozza: rig proposto/TRS/metri/scala1, indipendenza colori, parti separate, capelli/accessori, otto pose corpo e otto prove agente per trasformazioni finite. Gaze/blink, braccia alzate, digitazione, squash/celebrazione sono prove tecniche, non clip esportate. Quattordici combinazioni base/capelli esportate e reimportate: corpo e materiali non capelli invariati, uno stile attivo.512seed ripetibili verificati, palette valide e stato escluso dalla randomizzazione. Materiali di due importazioni Blender distinti: PASS; non equivale a clonazione gia verificata nel runtime.

FAIL: compatibilita con il profilo agent originale, come sopra. Budget effettivo maschile14materiali/32primitive, femminile15/33, contro8/24 originali; anche il precedente riferimento utenti11/25 e superato. I limiti non sono modificati e le deroghe non sono dichiarate approvate. Triangoli e dimensione file rimangono piccoli, ma non compensano un budget superato.

NOT_RUN: approvazione nuovo contratto, verifica completa delle intersezioni in tutte le pose, integrazione e assegnazione casuale nell'applicazione, QA applicativa. Copia/pubblicazione documentata separatamente nella ricevuta. Nessun commit/push/merge/deploy/installazione eseguito.

Provenienza: design originale per Juri, scaffold/tool MIT come resources/LICENSE_SOURCE.txt. Le consegne attive utenti/NPC e i tre profili originali restano intatti.
