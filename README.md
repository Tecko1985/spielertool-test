# ⚽ Spieler-Scouting & Förderung (v1.0)

Web-App zur Bewertung und Förderung von Nachwuchsspielern im Vereinsbetrieb. Läuft komplett im Browser (kein Server/Backend nötig), als installierbare PWA nutzbar.

## Funktionen

- **Dashboard** – Team-Übersicht mit Filter nach Mannschaft, Zeit seit letzter Bewertung und einer Förder-/Beobachtungsschwelle.
- **Spieler verwalten** – Spieler anlegen, suchen, filtern (Position, Geburtsdatum) und direkt in der Liste bearbeiten. Mannschaftszuordnung erfolgt automatisch über das Geburtsdatum.
- **Bewertung** – Neue Bewertungen je Spieler erfassen (Kategorien, Notizen, Bewerter, Datum), mit Vergleich zur letzten Bewertung oder zum Bestwert.
- **Spielerprofil & Vergleich** – Entwicklung eines Spielers über die Zeit (Linien- & Radar-Chart), Bewertungsverlauf als Tabelle, PDF-Export der letzten 3 Bewertungen, Vergleich von bis zu 4 Spielern im Radar-Chart.
- **Mannschaften und Gewichtung** – Mannschaften mit Geburtsjahrgang anlegen (automatische Alterszuordnung), Altersgewichtungen je Kategorie (Technik & Taktik, Athletik, Mental, Charakter) und Förder-/Beobachtungsschwellen je Altersstufe einstellen.
- **Einstellungen** – Speicherort verwalten, JSON-Export/-Import als Sicherungskopie, Spieler-Import aus Excel (.xlsx), automatisches Backup beim App-Start in einen gewählten Ordner.
- **Änderungswünsche** – Feedback/Ideen/Fehler direkt in der App einreichen, inkl. Versionshistorie.

## Datenspeicherung

Die Spielerdaten liegen in einer JSON-Datei, die auf zwei Wegen verbunden werden kann:

- **Automatische Nextcloud-Synchronisierung über die zentrale Anmeldung** (auch am Handy) — einmal in der [Tools-Übersicht](https://tecko1985.github.io/ToolsUebersicht/) anmelden, danach werden die Spielerdaten automatisch über einen zentralen Cloudflare Worker geladen und gespeichert. Kein WebDAV-Passwort mehr auf dem Gerät nötig; die Zugriffsrechte werden serverseitig anhand der Gruppen-Sichtbarkeit geprüft.
- **Lokale Datei** über die File-System-API (z.B. am Desktop ohne Login; Browser merkt sich die Zugriffsberechtigung).

## Tech-Stack

Reines HTML/CSS/JavaScript ohne Build-Step. Externe Bibliotheken per CDN: [Chart.js](https://www.chartjs.org/) (Diagramme), [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable (PDF-Export), [SheetJS/xlsx](https://github.com/SheetJS/sheetjs) (Excel-Import).
