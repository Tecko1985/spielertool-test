# ⚽ Spielertool

Bewertung und Förderung von Nachwuchsspielern im Vereinsbetrieb: Spieler
anlegen, regelmäßig bewerten, Profile vergleichen — und über eine
**Förder-/Beobachtungsschwelle** sichtbar machen, wer besondere Aufmerksamkeit
braucht.

> **Erprobungsstand des Spielertools.**

**➡️ [Spielertool öffnen](https://sc1911heiligenstadt.github.io/spielertool-test/)**

## Was drin ist

| Reiter | Wofür |
|---|---|
| **Dashboard** | Die Team-Übersicht auf einen Blick |
| **Spieler verwalten** | Spielerliste, neue Spieler und Mannschaften anlegen |
| **Bewertung** | Eine neue Bewertung erfassen |
| **Spielerprofil & Vergleich** | Das Profil eines Spielers und der direkte Spielervergleich |
| **Mannschaften und Gewichtung** | Mannschaftsliste, **Altersgewichtungen** und die Förder-/Beobachtungsschwelle |
| **Einstellungen** | Speicherort (Nextcloud-Verbindung) und JSON-Export; JSON-Import, Excel-Import und das automatische Backup darin sind der Administration vorbehalten |
| **Info** | Was die App tut, die Änderungen und der Datenschutz-Hinweis |

## Altersgewichtung und Schwelle

Ein Spieler wird nicht gegen den Verein gemessen, sondern gegen seinen
Jahrgang: Die **Altersgewichtungen** stellen ein, wie stark eine Altersklasse
zählt. Wer die **Förder-/Beobachtungsschwelle** über- oder unterschreitet, fällt
in der Übersicht auf — daraus wird die Förderentscheidung, nicht aus einer
einzelnen Bewertung.

## Feldspieler und Torhüter

Jeder Spieler trägt einen **Spielertyp**. Bei einem Torhüter tritt der Bereich
*Torwartspiel* mit sieben eigenen Kriterien an die Stelle von *Technik &
Taktik* — Athletik, Mentale Stärke und Charakter & Sozial gelten unverändert für
beide. Gewichtung und Förderschwelle bleiben dieselben, es muss also nichts
umgestellt werden. Profil, Diagramme und der PDF-Export zeigen bei Torhütern von
selbst die Torwart-Kriterien, und der Vergleich bietet nur denselben Spielertyp
an.

## Profil als PDF

Aus dem Spielerprofil lässt sich ein PDF erzeugen, das die letzten drei
Bewertungen gegenüberstellt — für das Gespräch mit Spieler und Eltern oder für
die Ablage.

## Sensible Daten

Es geht um Bewertungen minderjähriger Spieler. Die Sichtbarkeit dieses
Werkzeugs ist deshalb eng gesteckt, und im Repo stehen keine dieser Daten — sie
liegen ausschließlich in der Vereins-Nextcloud.

## Wichtig: nicht die Spielersichtung

Hier werden **eigene** Spieler bewertet und gefördert. Die Beobachtung
**fremder** Spieler läuft über die
[Spielersichtung](https://sc1911heiligenstadt.github.io/spielersichtung/).

## Zugang

Die Anmeldung läuft über die [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) — dort einmal anmelden, danach ist dieses Werkzeug offen.

Die Rechte gelten in drei Stufen: **Sehen** (Dashboard, Spielerprofile und Vergleich ansehen), **Bearbeiten** (Spieler pflegen und bewerten — dazu gehört auch der Reiter *Einstellungen* mit dem eigenen Speicherort und dem JSON-Export) und **Administrieren** (JSON-Import, Excel-Import und das automatische Backup innerhalb der Einstellungen). Wer welche Stufe hat, legt die Tools-Übersicht fest. Der Reiter *Info* ist für alle sichtbar.

Wird die App stattdessen ohne Anmeldung mit einer lokalen Datei betrieben, gelten diese Stufen nicht.

## Lokal starten

Über den Eintrag `spielertool-test` in `E:\.claude\launch.json` — der Server läuft dann auf `http://localhost:8771/`.

## Technik

Vanilla JavaScript ohne Build-Schritt — die Dateien werden so ausgeliefert, wie sie im Repo liegen. Veröffentlicht über GitHub Pages. Die Daten liegen in der Vereins-Nextcloud; die Synchronisierung läuft automatisch und funktioniert auch am Handy.

---

Ein Werkzeug des 1. SC 1911 Heiligenstadt. Alle Werkzeuge auf einen Blick: [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/) · Erklärungen im [Toolbox Wiki](https://sc1911heiligenstadt.github.io/Vereinswiki/).
