# VisCon Webinterface

Ein erster Arbeitsbereich fuer Studierende: Fragen stellen, passende Vorlesungen finden und direkt die relevanten Zeitabschnitte ansehen. Die gesamte Anwendung und ihre Dokumentation liegen in diesem Ordner.

## Lokal starten

Voraussetzung: Node.js 22.12 oder neuer und npm.

```sh
cd web-interface
npm install
npm run dev
```

Adresse: <http://127.0.0.1:5173>. Wenn der Port belegt ist, zeigt Vite im Terminal die verwendete Adresse an.

```sh
npm run build
npm run preview
```

`build` prueft TypeScript und erstellt die Produktionsdateien in `dist/`. `preview` zeigt diesen Build lokal an.

## Aktueller Stand

- Die Startseite zeigt ein leeres, mittig platziertes Chatfeld und eine schmale Icon-Leiste.
- Die Icon-Leiste enthält einen Arena-Button mit einem Arena-Symbol als Platzhalter. Er hat noch keine Funktion.
- Beim Kurs-Icon öffnet sich per Hover oder Klick die Auswahl Jahr → Semester → Studienjahr → Fach. Das Studienjahr zeigt Bachelor (BSc) mit 1–3 und Master (MSc) mit 1–2. Jeder Schritt zeigt nur die gerade benötigten Optionen als anklickbare Liste. Auf dem Handy öffnet ein Tippen die Auswahl.
- Auf Geräten mit Maus schliessen sich die Auswahlfenster automatisch, sobald die Maus Icon und Fenster verlässt. Der Übergang zwischen Icon und Fenster bleibt möglich.
- Das Chatfeld ist erst nach der Fachauswahl freigeschaltet. Über dem Feld steht „Stell eine Frage zu [Fach]“. Fragen durchsuchen die Vorlesungen dieses Fachs im gewählten Semester, Kalenderjahr, Abschluss und Studienjahr.
- „Neuer Chat“ leert die Frage und die Treffer, während der gesamte Fach- und Studienkontext erhalten bleibt. Eine neue Auswahl setzt die bisherige Frage und Ergebnisse zurück.
- Kursfilter, Sortierung und Raster-/Listenansicht helfen beim Durchsehen der Vorlesungen.
- Die Bibliothek zeigt die vorhandenen Beispielvorlesungen.
- Einzelne Videoabschnitte lassen sich als Merkliste im Browser speichern.
- Der Chatverlauf bleibt im Browser erhalten und verknüpft jede Frage mit Fach, Semester, Kalenderjahr, Abschluss und Studienjahr. Bestehende Vorlesungs- und Fachverläufe werden anhand der Fachmetadaten übernommen. Das Nachrichten-Icon öffnet die gespeicherten Fragen per Hover oder Klick.
- Eine Vorschau zeigt passende Zeitmarken und Beispieltranskripte; Abschnitte lassen sich wechseln.

Alle Kurse, Personen, Vorlesungen und Transkripte sind erfundene Demonstrationsdaten. Die Vorschau enthaelt keine abspielbaren Vorlesungsvideos. Es gibt noch keine KI-Suche, kein Backend, keine Anmeldung und keine Verbindung zu ETH-Systemen. Lokale Merklisten und Fragenhistorie werden per `localStorage` auf dem jeweiligen Browser gespeichert.

Die vorhandenen Beispieldaten gehören zum Herbstsemester 2026 und werden für den Prototyp dem ersten Bachelorjahr zugeordnet. Die Jahresliste enthält die Aufnahmejahre und das vorhergehende Jahr (aktuell 2026 und 2025). Fächer werden aus den Aufnahmen des gewählten Zeitraums und den Studienmetadaten ermittelt; andere Semester und Studienjahre zeigen vorerst einen Leerzustand. Nach einem Neuladen muss ein Fach erneut gewählt oder eine Frage aus dem Verlauf geöffnet werden. Semester werden vorerst aus den Aufnahmedaten abgeleitet; echte institutionelle Semester- und Studienzuordnungen sind noch nicht importiert.

## Struktur

```text
web-interface/
  docs/
    PROJECT.md             Ziel, Entscheidungen und kuenftiger API-Vertrag
    ROADMAP.md             Umgesetzt und noch offen
    assets.md              Herkunft der visuellen Assets
  public/
    images/                Vorschaubilder
    favicon.svg
  src/
    components/
      IconSidebar.tsx       Icon-Leiste und Auswahlfenster
      CoursePicker.tsx      Jahr, Semester, Studienjahr und Fach auswählen
      LectureCard.tsx       Vorlesung und passende Zeitabschnitte
      LectureViewer.tsx     Vorschau und Transkript
    data/
      lectures.ts           Beispielkurse, Vorlesungen und Suchlogik
      courseSelection.ts    Zeiträume, Fachzuordnung und Auswahlvalidierung
    hooks/
      useLocalStorage.ts    Lokale Speicherung
    App.tsx                 Navigation und Ansichten
    main.tsx                Einstiegspunkt
    styles.css              Layout und Gestaltung
    types.ts                Gemeinsame Datenmodelle
  scripts/
    check-interface.mjs     Wiederholbare Browserpruefung
  package.json
```

Technik: React 19, TypeScript, Vite, Lucide-Icons und lokal eingebundene Inter-Schrift.

Die dauerhafte Projektbeschreibung steht in [`docs/PROJECT.md`](docs/PROJECT.md), die offenen Aufgaben in [`docs/ROADMAP.md`](docs/ROADMAP.md). Bildquellen und Nutzungsdetails stehen in [`docs/assets.md`](docs/assets.md).

VisCon ist ein unabhaengiger Prototyp und kein offizielles Angebot der ETH Zuerich.

## Pruefen und weiterarbeiten

Bei laufendem Entwicklungsserver und installiertem Google Chrome:

```sh
npm run check:ui
npm run format
```

Die Browserpruefung kontrolliert Icon-Navigation, Hover-/Klick-Auswahl, die
Chat-Sperre vor der Fachauswahl, Suche im gewählten Fach und Zeitraum und
relevante Zeitmarken, Merkliste nach Neuladen, Transkriptvorschau, Bibliothek,
Sortierung und Mobilansichten bei 320, 390 und 768 Pixeln. Sie prueft auch
beschaedigte Browserdaten, alte Fragenverläufe und die Auswahl per Tastatur. Screenshots liegen
im ignorierten Ordner `artifacts/`. Fuer einen anderen Server kann
`VISCON_TEST_URL` gesetzt werden.

Am 09.10.2026 wurden Produktionsbuild und Browserpruefung erfolgreich ausgefuehrt.
Die Desktop- und Mobil-Screenshots wurden auf Lesbarkeit und Ueberlappungen geprueft.
