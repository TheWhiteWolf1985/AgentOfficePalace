# Personaggio base degli utenti

`Personaggi/Utenti/` conserva la consegna Blender originale, compresi sorgenti,
licenza e verifiche del produttore. `python -B scripts/import-human-base.py`
verifica checksum e contratto del kit e copia il solo GLB nella cartella runtime.
Il modello pesa circa 41 kB e contiene 522 triangoli, senza texture o animazioni.

Il modello `human_base` viene precaricato e usato per utente locale, utenti remoti
e anteprima del profilo. Il rig rigido `AOP_CHAR_RIGID_1`, in metri, usa scala 1:1
e altezza 1,7655 m. Il controller esistente muove testa, braccia e gambe per
camminare, sedersi, leggere, portare oggetti e usare scale/pali. Non applicare la
scala 1,15 dei due receptionist agli utenti.

In questa prima integrazione l’aspetto è quello consegnato: abito nero, camicia
bianca, cravatta rossa e capelli castani. Le preferenze estetiche dei profili
rimangono salvate e trasmesse, ma non modificano questo modello. L’anteprima
mantiene il nome e rinvia esplicitamente i controlli estetici. Personalizzazione
di pelle, capelli, vestiti e varianti sarà un intervento successivo. In caso di
mancato caricamento resta disponibile il precedente personaggio procedurale.

La prima persona riutilizza busto e gambe del modello, nascondendo temporaneamente
testa e braccia. Le mani FPS conservano la geometria precedente e adottano i
colori effettivi del modello: non è stato consegnato un asset FPS. Il sorriso
rimane statico; indicatore microfono, voce e movimento della testa restano attivi.
Agenti e NPC non cambiano.

`human-base.ts` adatta i nodi di controllo al `PersonRig`. Le geometrie GLB restano
condivise nella cache; i materiali toon sono isolati per istanza, mantenendo i
colori originali e le primitive del volto. `Person.dispose()` libera le risorse
proprie senza eliminare geometrie condivise quando si chiude l’anteprima o
si disconnette un utente.

I test applicativi coprono identità del GLB, rig, colori, pose, prima persona e
rilascio risorse. I rapporti Blender del produttore restano immutati e distinti
dai controlli dell’applicazione.
