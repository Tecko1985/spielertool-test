const APP_VERSION = "1.0.0";

const APP_CHANGELOG = [
  {
    version: "1.0.0",
    groups: [
      {
        title: "Spieler & Mannschaften",
        items: [
          "Spieler anlegen, inline bearbeiten und suchen (Vor-/Nachname, Position, Geburtsdatum).",
          "Automatische Mannschaftszuordnung anhand des Geburtsdatums.",
          "Mannschaftsverwaltung mit Altersstufen-Filter, der über alle Tabs hinweg wirkt."
        ]
      },
      {
        title: "Bewertung",
        items: [
          "Bewertung je Spieler in den Bereichen Technik & Taktik, Taktik, Athletik, Mentale Stärke sowie Charakter & Sozial.",
          "Rubrik-Texte je Kriterium und Punktstufe als Orientierung.",
          "Anzeige der letzten Bewertung direkt im Bewertungs-Tab.",
          "Altersgerechte, frei editierbare Gewichtung der Bewertungsbereiche je Altersstufe.",
          "Frei einstellbare Förder-/Beobachtungsschwelle je Altersstufe."
        ]
      },
      {
        title: "Dashboard & Profil",
        items: [
          "Dashboard-Filter nach Alter der letzten Bewertung (3/6/9/12 Monate).",
          "Markierung von Spielern über der Förderschwelle, mit Sprung direkt zur Bewertung.",
          "Spielerprofil mit Verlaufs-Charts (Linie, Radar, Vergleich) über alle Bewertungszeitpunkte."
        ]
      },
      {
        title: "Daten & Speicherung",
        items: [
          "Spieler-Import aus Excel-Dateien (Vorname/Nachname/Position/Geburtsdatum, mit oder ohne Kopfzeile).",
          "Speicherort frei wählbar: lokale Datei per Datei-Picker (mit dauerhaft gemerkter Zugriffsberechtigung) oder Nextcloud (WebDAV) als mobile Alternative.",
          "Automatisches, datiertes Backup bei jedem App-Start."
        ]
      },
      {
        title: "Sonstiges",
        items: [
          "App ist installierbar (PWA) für app-ähnliche Nutzung ohne Browser-Adressleiste.",
          "Einstellungsbereich mit Autosave-/Autoload-Status, Versionsinfo und Änderungswünsche-Formular."
        ]
      }
    ]
  }
];

// Bewertungs-Konfiguration: Kategorien, Kriterien und Rubrik-Texte (1 / 5 / 10)
const SCORE_CATEGORIES = [
  {
    id: "t1",
    label: "Technik & Taktik",
    max: 70,
    criteria: [
      { key: "t1_passspiel", label: "Passspiel" },
      { key: "t1_ballannahme", label: "Ballannahme" },
      { key: "t1_dribbling", label: "Dribbling" },
      { key: "t1_torschuss", label: "Torschuss" },
      { key: "t1_kopfball", label: "Kopfball" },
      { key: "t1_spielintelligenz", label: "Spielintelligenz/Übersicht" },
      { key: "t1_positionierung", label: "Positionierung" }
    ]
  },
  {
    id: "t2",
    label: "Taktik",
    max: 20,
    criteria: [
      { key: "t2_spielintelligenz", label: "Spielintelligenz/Übersicht" },
      { key: "t2_positionierung", label: "Positionierung" }
    ]
  },
  {
    id: "t3",
    label: "Athletik",
    max: 50,
    criteria: [
      { key: "t3_zweikampfverhalten", label: "Zweikampfverhalten" },
      { key: "t3_umschaltspiel", label: "Umschaltspiel" },
      { key: "t3_kondition", label: "Kondition" },
      { key: "t3_schnelligkeit", label: "Schnelligkeit" },
      { key: "t3_koordination", label: "Koordination" }
    ]
  },
  {
    id: "t4",
    label: "Mentale Stärke",
    max: 70,
    criteria: [
      { key: "t4_verhalten", label: "Verhalten" },
      { key: "t4_trainingswille", label: "Trainingswille" },
      { key: "t4_mentale_staerke", label: "Mentale Stärke" },
      { key: "t4_disziplin", label: "Disziplin/Engagement" },
      { key: "t4_lernbereitschaft", label: "Lernbereitschaft" },
      { key: "t4_durchsetzung", label: "Durchsetzungsvermögen" },
      { key: "t4_frustrationstoleranz", label: "Frustrationstoleranz" }
    ]
  },
  {
    id: "t5",
    label: "Charakter & Sozial",
    max: 40,
    criteria: [
      { key: "t5_teamfaehigkeit", label: "Teamfähigkeit" },
      { key: "t5_kommunikation", label: "Kommunikationsfähigkeit" },
      { key: "t5_konfliktfaehigkeit", label: "Konfliktfähigkeit" },
      { key: "t5_fuehrung", label: "Führungsqualitäten" }
    ]
  }
];

const TOTAL_MAX_SCORE = SCORE_CATEGORIES.reduce((sum, c) => sum + c.max, 0);

// Altersstufen-Gewichtung: wie stark Technik(t1)/Taktik(t2)/Athletik(t3)/Mentale Stärke(t4)/
// Charakter & Sozial(t5) je Altersstufe in den gewichteten Gesamtwert einfließen (Summe je Stufe = 100).
// Diese Werte sind Startwerte und können im Tab "Mannschaften" jederzeit angepasst werden.
const AGE_GROUP_LABELS = {
  f_e: "F/E-Jugend (bis 10 Jahre)",
  d_c: "D/C-Jugend (11–14 Jahre)",
  a_b: "A/B-Jugend (15–18 Jahre)"
};

const DEFAULT_AGE_GROUP_WEIGHTS = {
  f_e: { t1: 45, t2: 5, t3: 15, t4: 5, t5: 30 },
  d_c: { t1: 35, t2: 25, t3: 20, t4: 8, t5: 12 },
  a_b: { t1: 20, t2: 35, t3: 30, t4: 8, t5: 7 }
};

// Förder-/Beobachtungsschwelle je Altersstufe: ab diesem gewichteten Gesamtwert (%) gilt ein
// Spieler als potenzieller Kandidat für genauere Beobachtung/stärkere Förderung. Startwerte,
// frei editierbar im Tab "Mannschaften und Gewichtung".
const DEFAULT_AGE_GROUP_THRESHOLDS = {
  f_e: 75,
  d_c: 75,
  a_b: 75
};

// Orientierungshilfe (kein fester Wert, nur Anhaltspunkt) je Altersstufe und Bereich:
// typische Spanne + Trainings-Fokus laut Jugendfußball-Literatur. t2 (Taktik) ist hier in der
// "Technik & Taktik"-Spanne (t1) bzw. "Taktik"-Spanne (t2) der jeweiligen Quelle zusammengefasst.
const AGE_GROUP_FOCUS = {
  f_e: {
    title: "G- & F-Jugend (Bambini bis U9/U10): Das Lernalter",
    intro: "In dieser Phase stehen Spaß, vielseitige Bewegung und das Erleben von Erfolg absolut im Vordergrund.",
    t1: { range: "Hoch (ca. 40–50%)", text: "Goldenes Lernalter! Ballgefühl, Dribbling, Koordination mit Ball (Finten, Passen, Schießen). Beidfüßigkeit ist entscheidend." },
    t2: { range: "Niedrig (ca. 0–10%)", text: "Minimale Individualtaktik (z.B. den freien Raum erkennen, 1 gegen 1). Keine komplexen Systeme." },
    t3: { range: "Mittel (ca. 10–20%)", text: "Spielerisch integriert (Koordination, Geschicklichkeit, Schnelligkeit in Spielformen). Keine isolierte Kondition." },
    t4: { range: "Niedrig (ca. 0–10%)", text: "Selbstvertrauen stärken, positive Rückmeldung, Fehler als Lernchance." },
    t5: { range: "Hoch (ca. 30–40%)", text: "Wertevermittlung (Fairplay, Respekt, Teamgeist), Zuhören, soziale Regeln, Umgang mit Gewinnen/Verlieren." }
  },
  d_c: {
    title: "D- & C-Jugend (U11 bis U15): Das Leistungsalter",
    intro: "Die Spieler sind lernwilliger und belastbarer. Technik bleibt zentral, aber Taktik und spezifische Athletik gewinnen an Bedeutung.",
    t1: { range: "Mittel bis hoch (ca. 30–40%)", text: "Festigen unter Zeit-, Gegner- und Präzisionsdruck. Positionsspezifische Technik (Flanken, Kopfball)." },
    t2: { range: "Mittel (ca. 20–30%)", text: "Individual- und Gruppentaktik (Freilaufverhalten, Verschieben, Überzahl/Unterzahl)." },
    t3: { range: "Mittel (ca. 15–25%)", text: "Koordinatives Schnelligkeitstraining. Erste spezifische Kraftübungen (Rumpfstabilität)." },
    t4: { range: "Mittel (ca. 5–10%)", text: "Einstellung (Wille, Konzentration), Umgang mit Druck und Rückschlägen." },
    t5: { range: "Mittel (ca. 10–15%)", text: "Eigenverantwortung fördern, Umgang mit der Pubertät, Konfliktlösung im Team." }
  },
  a_b: {
    title: "A- & B-Jugend (U17 bis U19): Das Spezialisierungsalter",
    intro: "Vorbereitung auf den Seniorenbereich. Alle Bereiche werden professioneller.",
    t1: { range: "Mittel (ca. 15–25%)", text: "Automatisierung unter höchstem Tempo und Druck. Perfektion der individuellen Stärken." },
    t2: { range: "Hoch (ca. 30–40%)", text: "Mannschaftstaktik, Spielsysteme, Standardsituationen. Gegneranalyse." },
    t3: { range: "Hoch (ca. 25–35%)", text: "Positionsgerechte Athletik. Maximalkraft, Schnelligkeitsausdauer, Verletzungsprophylaxe." },
    t4: { range: "Mittel (ca. 5–10%)", text: "Leistungspsychologie, Selbstregulation, mentale Wettkampfvorbereitung." },
    t5: { range: "Niedrig bis mittel (ca. 5–10%)", text: "Führungsrollen übernehmen, Umgang mit dem Umfeld (Beruf, Schule), Verantwortung für die Karriere." }
  }
};

const CRITERIA_RUBRIC = {
  t1_passspiel: {
    1: "Pässe sind unpräzise, zu langsam oder zu hart. Spielt fast nur Rückpässe oder einfache Querpässe. Nutzt nur einen Fuß.",
    5: "Spielt Pässe sicher und in den Fuß. Kann einfache Pressingsituationen mit Passspiel lösen. Beherrscht Standard-Pässe (kurz/lang).",
    10: "Beidfüßig, variiert Tempo und Schärfe optimal. Eröffnet Räume und überspielt mehrere Linien mit einem Pass. Hohe Quote auch unter höchstem Gegnerdruck."
  },
  t1_ballannahme: {
    1: "Ball verspringt regelmäßig, benötigt mehrere Kontakte zur Kontrolle. Verliert oft Zeit und Raum durch schlechte Annahme.",
    5: "Kontrolliert den Ball zuverlässig, benötigt einen klaren Kontakt. Annahme ist meist statisch und nur zur Ballkontrolle ausgerichtet.",
    10: "Nimmt den Ball in vollem Tempo an. Nutzt die Annahme, um den Gegenspieler auszuschalten (First-Touch). Beherrscht alle Oberflächen (Fuß, Brust, Kopf) perfekt."
  },
  t1_dribbling: {
    1: "Verliert den Ball bei hohem Tempo oder in engen Räumen. Kein Repertoire an Tricks oder Körpertäuschungen.",
    5: "Kann den Ball gegen einen Gegenspieler halten und einfache Dribblings auf der Außenbahn gewinnen. Setzt Täuschungen nur selten und meist ineffektiv ein.",
    10: "Überdurchschnittliche Ballkontrolle bei Höchstgeschwindigkeit. Schafft es regelmäßig, mehrere Gegenspieler auf engstem Raum auszuspielen. Setzt Körpertäuschungen effektiv und variabel ein."
  },
  t1_torschuss: {
    1: "Schüsse sind unplatziert, zu schwach oder führen nicht zum Torabschluss. Kaum Torgefahr aus der Distanz oder nach Bewegung.",
    5: "Trifft meist das Tor, aber wenig platziert. Nutzt nur den starken Fuß. Standard-Abschlüsse sind solide, aber vorhersehbar.",
    10: "Extrem präzise und wuchtige Abschlüsse. Kann beidfüßig aus schwierigen Positionen Torgefahr erzeugen. Wählt immer die bestmögliche Schusstechnik (Spann, Innenseite, Lupfer)."
  },
  t1_kopfball: {
    1: "Scheut Kopfbälle oder verliert fast alle Luftduelle. Kopfball-Richtung ist zufällig oder unkontrolliert.",
    5: "Gewinnt Duelle in der Defensive. Kann Bälle in der Offensive auflegen oder kontrolliert weiterleiten. Timing ist mittelmäßig.",
    10: "Überragendes Timing und Sprungkraft. Dominant in allen Kopfballduellen (Offensive/Defensive). Kann gezielte und wuchtige Torschüsse per Kopf erzielen."
  },
  t1_spielintelligenz: {
    1: "Agiert nur reaktiv, sieht Mitspieler erst kurz vor dem Anspiel. Entscheidungen sind oft falsch und verzögert.",
    5: "Trifft meist die richtige Entscheidung in der direkten Zone. Scant das Feld, aber nicht permanent. Findet die sichere Lösung.",
    10: "Proaktiv und antizipativ. Liest das Spiel, weiß, was als Nächstes passiert. Trifft optimale Entscheidungen, die Gegner überraschen und Räume öffnen. Permanent hoher Informationsstand."
  },
  t1_positionierung: {
    1: "Lässt die eigene Position häufig unbesetzt. Hält die Abstände zum Mitspieler nicht ein. Läuft unnötige Wege in leere Räume.",
    5: "Hält die Grundposition solide. Erfüllt die taktischen Anweisungen, ohne kreativ zu werden. Läuft nur die geforderten Wege.",
    10: "Erkennt, wann die Position verlassen werden muss. Besetzt stets die wichtigen Räume (offensiv wie defensiv). Korrigiert aktiv die Fehler von Mitspielern durch kluge Läufe."
  },
  t2_spielintelligenz: {
    1: "Agiert nur reaktiv, sieht Mitspieler erst kurz vor dem Anspiel. Entscheidungen sind oft falsch und verzögert.",
    5: "Trifft meist die richtige Entscheidung in der direkten Zone. Scant das Feld, aber nicht permanent. Findet die sichere Lösung.",
    10: "Proaktiv und antizipativ. Liest das Spiel, weiß, was als Nächstes passiert. Trifft optimale Entscheidungen, die Gegner überraschen und Räume öffnen. Permanent hoher Informationsstand."
  },
  t2_positionierung: {
    1: "Lässt die eigene Position häufig unbesetzt. Hält die Abstände zum Mitspieler nicht ein. Läuft unnötige Wege in leere Räume.",
    5: "Hält die Grundposition solide. Erfüllt die taktischen Anweisungen, ohne kreativ zu werden. Läuft nur die geforderten Wege.",
    10: "Erkennt, wann die Position verlassen werden muss. Besetzt stets die wichtigen Räume (offensiv wie defensiv). Korrigiert aktiv die Fehler von Mitspielern durch kluge Läufe."
  },
  t3_zweikampfverhalten: {
    1: "Geht Duellen aus dem Weg oder verliert diese aufgrund schlechten Timings. Körperlichkeit ist kaum vorhanden.",
    5: "Gewinnt die Mehrheit der Boden-Zweikämpfe durch körperlichen Einsatz. Timing ist oft noch zu spät, aber akzeptabel.",
    10: "Aggressiv, körperlich stark und mit perfektem Timing. Kann den Ball sauber erobern oder clever abschirmen. Gewinnt Duelle gegen physisch stärkere Gegner."
  },
  t3_umschaltspiel: {
    1: "Braucht lange, um von Angriff auf Abwehr oder umgekehrt zu schalten. Blockiert oder verzögert das Tempo unnötig.",
    5: "Erfüllt die Umschaltanforderung, aber ohne sofortige Gefahr. Kann das Tempo im Umschaltspiel halten.",
    10: "Sofortige Reaktion auf Ballgewinn/-verlust. Initiiert aktiv das Umschaltspiel mit Tempo und richtungsweisenden Aktionen. Ist immer anspielbar und schnell im Kopf."
  },
  t3_kondition: {
    1: "Muss vorzeitig ausgewechselt werden oder fällt nach 60 Minuten leistungstechnisch stark ab.",
    5: "Kann 90 Minuten durchspielen, erfüllt aber nur die minimalen Laufanforderungen. Intensität lässt zum Spielende nach.",
    10: "Gehört zu den laufstärksten Spielern im Team (hohe Kilometerleistung). Kann intensive Sprints und hohes Tempo über die gesamte Spieldauer halten (Wiederholte Schnelligkeit)."
  },
  t3_schnelligkeit: {
    1: "Deutlich langsam in der Grundschnelligkeit und der Beschleunigung. Wird häufig übersprintet.",
    5: "Durchschnittliche Geschwindigkeit. Kann kurze Strecken schnell zurücklegen, aber lange Sprints werden schnell zur Belastung.",
    10: "Elite-Grund- und Antritts-Schnelligkeit. Nutzt das Tempo gezielt, um in freie Räume zu stoßen oder Gegner abzulaufen."
  },
  t3_koordination: {
    1: "Wirkt ungelenk, verliert schnell das Gleichgewicht. Schwierigkeiten bei Sprüngen oder schnellen Richtungswechseln.",
    5: "Beherrscht die fußballspezifischen Bewegungen solide, aber nicht elegant. Hat bei komplexen Bewegungen noch Schwierigkeiten.",
    10: "Hervorragendes Gleichgewicht und Beweglichkeit. Kann schnelle, explosive und technisch anspruchsvolle Bewegungen fehlerfrei ausführen."
  },
  t4_verhalten: {
    1: "Hält sich nicht an Regeln oder Verabredungen. Zeigt Respektlosigkeit gegenüber Schiedsrichtern und Trainern.",
    5: "Angemessenes Verhalten im Normalfall. Muss bei emotionalen Situationen vom Trainer gebremst werden.",
    10: "Tadelloses, professionelles Verhalten auf und neben dem Platz. Ist ein Vorbild in Disziplin und Etikette."
  },
  t4_trainingswille: {
    1: "Meidet intensive Übungen. Gibt schnell auf. Zeigt keine Eigeninitiative außerhalb des Pflichtprogramms.",
    5: "Erfüllt die Trainingsanweisungen mit solider Intensität. Braucht äußere Motivation.",
    10: "Höchste Eigenmotivation und Intensität in jeder Einheit. Fordert sich und andere heraus. Arbeitet aktiv an Schwächen in der Freizeit."
  },
  t4_mentale_staerke: {
    1: "Zerbricht schnell unter Druck (z.B. nach Gegentor oder Fehler). Zeigt Nervosität in wichtigen Spielen.",
    5: "Kann mit mittlerem Druck umgehen. Spielt in wichtigen Spielen solide, aber nicht besser als sonst.",
    10: "Wird in Drucksituationen besser. Ist der Spieler, der den entscheidenden Ball fordert. Lässt sich durch Fehler nicht beeinflussen."
  },
  t4_disziplin: {
    1: "Unzuverlässig (Zuspätkommen, unentschuldigtes Fehlen). Geringes Engagement für den Erfolg des Teams.",
    5: "Zuverlässig bei Anwesenheit. Erfüllt die Grundanforderungen an Disziplin und Pünktlichkeit.",
    10: "Extreme Zuverlässigkeit und Pünktlichkeit. Geht in allen Bereichen voran (Ernährung, Schlaf, Regeneration). Volles Engagement für den Erfolg."
  },
  t4_lernbereitschaft: {
    1: "Zeigt kein Interesse an taktischen Besprechungen oder Videoanalyse. Wiederholt Fehler.",
    5: "Nimmt Feedback entgegen und versucht, es umzusetzen. Lernt aus einfachen Fehlern.",
    10: "Fordert aktiv Feedback ein. Erkennt komplexe taktische Fehler schnell und korrigiert diese eigenständig. Ist schnell in der Aneignung neuer Systeme."
  },
  t4_durchsetzung: {
    1: "Nimmt sich in Duellen oder bei Entscheidungen zurück. Wird von Gegenspielern leicht dominiert.",
    5: "Kann sich im direkten Duell physisch durchsetzen, wenn die Voraussetzungen stimmen.",
    10: "Extreme Willenskraft, um sich im Duell und im Spiel durchzusetzen. Nimmt auch gegen Widerstände den schwierigen Weg und gewinnt ihn."
  },
  t4_frustrationstoleranz: {
    1: "Lässt sich nach Fehlern oder Fehlentscheidungen des Schiedsrichters ablenken. Meckert viel, bricht in der Leistung ein.",
    5: "Kann Frustration schnell ablegen, aber die Konzentration ist kurz gestört.",
    10: "Bleibt absolut ruhig und fokussiert nach Rückschlägen oder Fehlern. Nutzt Frustration als positive Energie. Zeigt Reife und Kontrolle."
  },
  t5_teamfaehigkeit: {
    1: "Stellt eigene Interessen über das Team. Ignoriert Anweisungen von Mitspielern. Ist ein isolierter Einzelkämpfer.",
    5: "Ist gut integriert, erfüllt seine Rolle im Team. Hilft auf Nachfrage. Verhält sich unauffällig in der Gruppe.",
    10: "Stellt das Team in den Vordergrund. Fördert aktiv den Teamgeist. Unterstützt Mitspieler durchgehend und setzt sich für die Gemeinschaft ein."
  },
  t5_kommunikation: {
    1: "Spricht kaum, gibt keine Kommandos oder nur sehr leise. Kann Anweisungen nicht klar weitergeben.",
    5: "Gibt situationsbedingte Standard-Kommandos (\"Hier!\", \"Mann!\"). Spricht mit dem Trainer und ist ansprechbar.",
    10: "Ständige, laute und klare Kommunikation. Gibt taktische Anweisungen, motiviert und organisiert die Mitspieler während des Spiels."
  },
  t5_konfliktfaehigkeit: {
    1: "Eskaliert Konflikte unnötig. Sucht die Schuld bei anderen. Kann Kritik weder annehmen noch konstruktiv äußern.",
    5: "Bleibt bei Konflikten ruhig, benötigt aber oft externe Hilfe (Trainer) zur Lösung. Kritik wird akzeptiert, aber nicht aktiv verarbeitet.",
    10: "Geht aktiv und deeskalierend auf Konflikte zu. Kann Kritik konstruktiv annehmen und in Leistung umsetzen. Ist ein Ruhepol für das Team."
  },
  t5_fuehrung: {
    1: "Muss ständig geführt und motiviert werden. Hat keinen Einfluss auf das Team.",
    5: "Ist ein Mitläufer, der seine Aufgaben erledigt. Motiviert die Mitspieler situativ, aber nicht permanent.",
    10: "Natürliche Autorität und Vorbildfunktion. Übernimmt Verantwortung in schwierigen Phasen. Führt verbal und durch Leistung voran."
  }
};
