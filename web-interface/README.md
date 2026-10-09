# VisCon Webinterface

Der neue Arbeitsbereich ist mit Basis Arena, den Vorlesungsaufnahmen und dem gemeinsamen Backend verbunden. Die Icon-Leiste, Hover-Auswahl und der fachbezogene Chat aus `ce8e44b` bleiben erhalten.

## Lokal starten

Node.js 24 oder neuer verwenden. Vom **Repository-Root** aus:

```sh
git lfs install
git lfs pull
npm install
npm run dev
```

- VisCon: <http://localhost:5173/learn>
- Basis Arena: <http://localhost:5173/>

Der Arena-Button führt zur bestehenden Multiplayer-App. In Arena führt „Lectures“ zurück; aktive Räume werden erst nach Bestätigung verlassen. Beide Oberflächen laufen mit demselben Backend auf Port 3001.

Für die Produktion im Repository-Root `npm run build` und `npm start` ausführen. Beide Oberflächen sind dann auf Port 3001 verfügbar. Der separate Vite-Server in diesem Ordner kann weiterhin für Frontend-Arbeit verwendet werden, benötigt aber ebenfalls den gemeinsamen Backend-Server. Der Root-Build ist der vollständige Produktionsbuild.

## Verbundene Funktionen

- Kursauswahl per Hover, Klick oder Tastatur; der Chat wird nach der Fachauswahl freigeschaltet.
- 24 echte Aufnahmen unter **Aufzeichnungen → Digital Design & Computer Architecture**. Ohne bestätigte Metadaten wird kein Jahr, Semester oder Studiengang erfunden.
- Drei kurze, abspielbare Demos unter **2026 → Herbstsemester → Bachelor (BSc), 1. Studienjahr**.
- Serverseitige Stichwortsuche mit Transkriptbelegen und exakten Videozeitmarken, ohne API-Schlüssel.
- Nativer Videoplayer, Kapitel, Untertitel, Transkript und vorhandene zwischengespeicherte Lernnotizen.
- Bibliothek, Sortierung, Raster-/Listenansicht und lokal gespeicherte Stellen mit exakter Startzeit.
- Persistente Fachauswahl und Chatverläufe; wiedergeöffnete Fragen stellen den Fachkontext her und führen die Suche erneut aus.
- Abbruch laufender Suchen beim Fachwechsel sowie sichtbare Lade-, Fehler- und Leerezustände.

Merkliste und Chatverlauf bleiben im Browser. Eine ETH-Anmeldung oder geräteübergreifende Synchronisation ist nicht enthalten. Arena verwendet weiterhin seine separat gekennzeichnete Demo-Fragenbank. VisCon ist kein offizielles Angebot der ETH Zürich.

Die optionale Python-Q&A-Anbindung und ihre Konfiguration sind im [Root-README](../README.md) beschrieben. Ohne konfigurierte Zugangsdaten funktioniert die lokale Transkriptsuche; bei einem Providerfehler wird der Rückfall ausdrücklich angezeigt.

## Struktur und Prüfung

`src/api.ts` lädt den Katalog und Suchantworten. `src/data/courseSelection.ts` validiert den Kurskontext. Die bisherigen statischen Daten in `src/data/lectures.ts` bleiben als Referenz erhalten, werden aber nicht von der verbundenen Oberfläche geladen. Der Server und die Integrationsadapter liegen in `../server/`.

Im Repository-Root:

```sh
npm test
npm run build
npm run test:ui
```

Die Browserprüfung benötigt Playwright in `../.venv` und installiertes Google Chrome. Sie startet einen isolierten Server und prüft beide Anwendungen. `npm run check:ui` in diesem Ordner prüft nur die Vorlesungsabläufe gegen einen laufenden gemeinsamen Server; `TEST_URL` überschreibt die Standardadresse `http://127.0.0.1:5173`.

Siehe [Integrationsvertrag](../docs/integration.md), [Projektstand](docs/PROJECT.md), [Roadmap](docs/ROADMAP.md) und [Bildquellen](docs/assets.md). Prüfberichte und Screenshots liegen in `../.impeccable/review/`.
