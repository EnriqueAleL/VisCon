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

- Die Startseite zeigt ein leeres, mittig platziertes Chatfeld ohne Überschrift, Kursauswahl oder Beispielfragen. Vorlesungstreffer erscheinen erst nach dem Absenden einer Frage; „Neue Frage“ setzt die Ansicht zurück.
- Fragen durchsuchen lokale Beispieldaten nach Stichwoertern.
- Kursfilter, Sortierung und Raster-/Listenansicht helfen beim Durchsehen der Vorlesungen.
- Die Bibliothek zeigt die vorhandenen Beispielvorlesungen.
- Einzelne Videoabschnitte lassen sich als Merkliste im Browser speichern.
- Die Fragenhistorie bleibt im Browser erhalten.
- Eine Vorschau zeigt passende Zeitmarken und Beispieltranskripte; Abschnitte lassen sich wechseln.

Alle Kurse, Personen, Vorlesungen und Transkripte sind erfundene Demonstrationsdaten. Die Vorschau enthaelt keine abspielbaren Vorlesungsvideos. Es gibt noch keine KI-Suche, kein Backend, keine Anmeldung und keine Verbindung zu ETH-Systemen. Lokale Merklisten und Fragenhistorie werden per `localStorage` auf dem jeweiligen Browser gespeichert.

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
      LectureCard.tsx       Vorlesung und passende Zeitabschnitte
      LectureViewer.tsx     Vorschau und Transkript
    data/
      lectures.ts           Beispielkurse, Vorlesungen und Suchlogik
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

Die Browserpruefung kontrolliert Suche und relevante Zeitmarken, Merkliste nach
Neuladen, Transkriptvorschau, Bibliothek, Sortierung und Mobilansichten bei 320,
390 und 768 Pixeln. Sie prueft auch beschaedigte Browserdaten. Screenshots liegen
im ignorierten Ordner `artifacts/`. Fuer einen anderen Server kann
`VISCON_TEST_URL` gesetzt werden.

Am 09.10.2026 wurden Produktionsbuild und Browserpruefung erfolgreich ausgefuehrt.
Die Desktop- und Mobil-Screenshots wurden auf Lesbarkeit und Ueberlappungen geprueft.
