---
name: pdf-ocr
description: Read PDF pages, recognize scans in Italian and English, and inspect the original page image.
---

# PDF e OCR

Usa `use_office_tool` passando un nome di strumento e gli argomenti `file` e `page`. Le pagine sono numerate da 1. Indica il percorso relativo al tuo workspace, per esempio `documenti/capitolato.pdf`, oppure il percorso ricevuto in `/office-drops/` per un allegato. Un percorso che inizia con `/workspace/` indica la stessa copia di lavoro.

1. Chiama `pdf.text` per leggere il testo della pagina. Il campo `pages` indica quante pagine contiene il documento. Una pagina vuota o con solo un'intestazione può contenere una scansione.
2. Per una scansione chiama `pdf.ocr` con la stessa pagina. Il riconoscimento usa italiano e inglese; con `language` puoi scegliere `ita` o `eng`.
3. Usa `pdf.render` per confrontare il risultato con la pagina originale, soprattutto per cifre, date, colonne e testo poco leggibile. Se un valore resta incerto, segnalalo.

Cita il nome del file e la pagina PDF per ogni requisito o dato riportato. Quando viene chiesto un documento, salva il risultato in Markdown nel tuo workspace per renderlo visibile nella libreria Documenti del piano.
