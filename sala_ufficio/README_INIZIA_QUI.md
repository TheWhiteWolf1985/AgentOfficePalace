# Ufficio — versione grafica approvata

Consegna del23novembre2026, versione2026-11-23-r06. Questa cartella contiene esclusivamente l'ufficio aggiornato e gli strumenti per usarlo, esportarlo e verificarlo. Le versioni precedenti sono conservate separatamente fuori dalla cartella attiva.

Aprire **ufficio.blend**. È il sorgente modificabile autosufficiente, con una sola scena Piano ufficio e immagini incorporate. Geometria, materiali, normali e UV del piano base coincidono con la revisione approvata in Blender. Il GLB base e i dieci moduli opzionali sono stati esportati e reimportati con verifica.

| Contenuto | Percorso |
|---|---|
| Modello Blender corrente | [ufficio.blend](ufficio.blend) |
| Modello GLB del piano base | [geometria/ufficio_base.glb](geometria/ufficio_base.glb) |
| Moduli alternativi aggiornati | [geometria/varianti/](geometria/varianti/) |
| Nodi, trasformazioni e materiali | [ufficio.manifest.json](ufficio.manifest.json) |
| Quote, interazioni e collider proposti | [riferimenti/layout_ufficio.json](riferimenti/layout_ufficio.json) |
| Interventi necessari nel software | [INTEGRAZIONE.md](INTEGRAZIONE.md) |
| Verifiche modello e reimportazioni | [riferimenti/VERIFICA.json](riferimenti/VERIFICA.json) |
| Confronto con il modello approvato | [verifiche/CONFRONTO_SCENA.json](verifiche/CONFRONTO_SCENA.json) |
| Viste aggiornate | [riferimenti/viste/](riferimenti/viste/) |
| Inventario SHA-256 completo | [CONTENUTO_SHA256.json](CONTENUTO_SHA256.json) |

## Aspetto approvato

Pavimento in legno caldo, scrivanie in legno chiaro con telai ardesia, sedute teal/arancio/malva con braccioli e rotelle. Finestre e vetrate trasparenti. Nessuna scala esterna, terrazza o relativa porta; i vani sono richiusi. Rimossi gong, tre chioschi, monitor macchina, cartello dell'ampliamento e una pianta nella stessa zona. Insegne superiori Capo Ufficio senza corona. Libreria Documenti a tre campate, centrata fra le finestre al posto della porta del terrazzo: larghezza5,18m e margini0,91m per lato.

## Uso delle collezioni

UFFICIO | Base contiene la configurazione approvata con16 scrivanie. Soffitto | Vista in pianta è nascosto nella vista di lavoro e rimane separato. VARIANTI | Attivare singolarmente contiene i dieci moduli opzionali: non attivarli tutti insieme. GUIDE | Quote e interazioni è consultiva e non viene esportata.

Per ala_1 o ala_2 sostituire Ala_0 e Piante_solo_ala_0 con una sola ala. Per collegamenti_primo/intermedio/ultimo sostituire Collegamenti_ufficio_unico e il relativo soffitto, conservando il resto del piano base. Gli altri campioni sono oggetti da istanziare su richiesta. La vecchia chiusura_piani_superiori è esclusa: il vano della porta esterna è ora chiuso permanentemente nella base.

## Verificare o riesportare

```text
blender -b --factory-startup -P strumenti/verifica_consegna.py -- <questa-cartella>
blender -b ufficio.blend -P strumenti/esporta.py -- <questa-cartella>
blender -b -P strumenti/viste.py -- <questa-cartella>
```

Il primo comando verifica anche il .blend e reimporta tutti gli11 GLB. Con Python ordinario lo stesso verificatore controlla inventario e struttura dei GLB, senza i controlli Blender. L'esportatore usa il .blend corrente; dopo qualsiasi variazione rigenerare manifest, verifiche e inventario. Gli strumenti non ricostruiscono vecchi arredi cancellati.

L'approvazione grafica e i controlli del pacchetto sono completati. Integrazione, camminata, collisioni, sedute, interazioni e combinazioni delle varianti nell'applicazione sono ancora da collaudare. La consegna non modifica il software e non distribuisce una nuova versione dell'app.
