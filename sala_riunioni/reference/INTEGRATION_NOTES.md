# Confine fra asset e software

La modellazione non implementa la sala nell'applicativo. Il commit di riferimento ha un tetto @roof condiviso, senza un Floor di progetto: meeting, dati e lavagna attuali sono associati ai progetti. L'integrazione dovra definire sessioni della sala e provenienza dei progetti; il modello non deve scegliere un progetto implicito.

Le attuali riunioni agenti arrivano a5 worker: e un limite logico da adattare al futuro design, non un limite di sedie imposto da questo kit. La lavagna usa Excalidraw in una finestra e ne mostra il disegno sulla superficie3D. Dimensioni del modello e risoluzione della texture saranno disaccoppiate; non produrre texture statiche giganti della lavagna.

Il codice attuale genera ascensore, soletta e piano del tetto. Prima di aggiungere l'asset si sostituiranno il vecchio pavimento visibile e l'interno bar/DJ per evitare superfici sovrapposte; il volume ascensore e il suo accesso restano del software. Non correggere questa integrazione spostando l'ascensore nel modello.

Un soffitto chiuso deve comportare riparo locale da pioggia/neve; oggi il roof e trattato come esterno. La funzione di meteo/giorno-notte globale rimane. L'implementazione gestira camera/collisioni, materiali toon, sedute umane/agenti, sincronizzazione lavagna ed eventuale screen sharing.

Da mantenere nell'app: scale/pali, meteo/giorno-notte, celebrazioni, strumenti di lavoro, avatar essenziali e stato dei worker. Da eliminare nel distinto incarico di pulizia: emote/telescopio, festivita/costumi, auto/circuito, cane, videogiochi, jukebox, caffe/fumo. Non e richiesto al modellatore di eseguire tale pulizia, né alcun deploy.

I nomi/schema di questo pacchetto sono un contratto nuovo per l'asset. Il loader specifico del nuovo asset non e ancora scritto: non dichiarare che basta copiare il GLB per avere riunioni operative.
