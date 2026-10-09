# VisCon Video Pull-up

Eine Frage liefert eine Erklärung mit Quellen und öffnet die passende Stelle im Vorlesungsvideo. Fach und konkrete Vorlesung können die Suche begrenzen. Dieser Ordner enthält Backend, Transkriptimport, einen Player-Client und eine eigenständige Funktionsdemo. Der Anschluss an das Website-Interface in `../web-interface/` ist getrennt beschrieben.

## Starten

Node.js 22 oder neuer. Das Backend braucht keine npm-Pakete und kein `npm install`.

```sh
cd video-pull-up
npm start
```

Demo: <http://127.0.0.1:8787/demo>. Mit der voreingestellten Frage öffnet sich das Eigenwerte-Video bei **0:30**, neben dem erklärenden Transkriptabschnitt. Quellenbuttons wechseln zur jeweiligen Stelle. Die drei mitgelieferten MP4-Dateien enthalten selbst erstellte, stumme Lernfolien, deren Inhalte den Transkripten entsprechen; sie sind keine ETH-Aufnahmen.

```sh
npm test
# Optional: vorhandene Playwright-Installation im web-interface/ + Google Chrome.
npm run test:browser
```

## Verhalten

1. Fach und optional eine Vorlesung auswählen.
2. Frage an `POST /api/ask` senden.
3. Zeitgestempelte Transkriptabschnitte durchsuchen und nach Relevanz ordnen.
4. Erklärung mit Verweisen wie `S1` zurückgeben. Ohne Modell werden die gefundenen Transkriptabschnitte als Erklärung angezeigt.
5. Den besten Videotreffer öffnen. Beim Untertitelimport springt der Player zum passenden Original-Untertitel innerhalb des Abschnitts.

Keine passenden Fachbegriffe → `no_match`, keine erfundene Antwort. Ähnliche Stellen mit geringer Abdeckung der konkreten Frage oder unzureichendem Kontext laut Sprachmodell → `insufficient_context`. Fehlende Videodatei → Transkript bleibt verfügbar, `playback` ist `null`. Ein ausgefallenes Modell oder ungültige Quellen-IDs → ausdrücklich gekennzeichnete Transkriptantwort.

Die Suche ist eine BM25-basierte Textsuche mit ausgewählten deutschen/englischen Begriffsaliasen und zusätzlicher Gewichtung der Abschnittstitel. Sie ist noch keine semantische Suche und kann fachlich ähnliche Formulierungen ohne gemeinsame Begriffe verpassen. Die Trefferzahl und Suchscores sind keine Konfidenzwahrscheinlichkeiten. Automatisch erzeugte Abschnitte sind zeitliche Fenster und keine erkannten Themenkapitel.

## Lokale KI optional aktivieren

Die Demo funktioniert ohne Sprachmodell. Für eine neu formulierte, schrittweise Erklärung kann ein bereits installiertes Ollama-Modell verwendet werden:

```sh
cp .env.example .env
```

In `.env` `OLLAMA_MODEL` auf den Namen eines vorhandenen Modells setzen und den Server neu starten. Die Anfrage geht an `OLLAMA_BASE_URL` (standardmässig `http://127.0.0.1:11434`); es wird kein Modell automatisch installiert. `OLLAMA_TIMEOUT_MS` begrenzt die Wartezeit. Frage und gefundene Transkripte werden an diesen konfigurierten Modelldienst gesendet. Zeitmarken und URLs stammen immer aus dem Katalog. Das Modell erhält ausschliesslich die Suchtreffer und muss jeden Absatz mit gültigen Quellen-IDs belegen. Diese Prüfung garantiert keine fachliche Richtigkeit.

## Eigene Vorlesung importieren

Benötigt werden Metadaten, ein VTT- oder SRT-Transkript und eine im Browser abspielbare Video-URL. `examples/lecture.json` und `examples/lecture.vtt` zeigen das Format; das Beispieltranskript ist ebenfalls synthetisch. Mit `mediaUrl: null` lässt sich zunächst nur das Transkript testen.

```sh
npm run import -- \
  --metadata examples/lecture.json \
  --transcript examples/lecture.vtt \
  --out data/local-catalog.json
```

Danach in `.env` `CATALOG_PATH=data/local-catalog.json` setzen und neu starten. Der Import legt Kurse an, ersetzt eine bereits vorhandene Vorlesung mit derselben ID und prüft Zeitmarken gegen `duration`. Endzeiten dürfen die reale Videodauer nicht überschreiten. Wiederholtes Importieren erzeugt keine doppelten Vorlesungen.

Lokale Videodateien können unter `media/` liegen und mit `/media/dateiname.mp4` referenziert werden. Der Server unterstützt HTTP-Byte-Ranges für das Springen in Videos. Alternativ ist eine direkte HTTP(S)-Medien-URL möglich; eine gewöhnliche Vorlesungswebseite oder ein YouTube-Seitenlink funktioniert nicht im nativen Player. Videodatei und Transkript müssen auf derselben Zeitachse liegen. Der Demo-Katalog wird beim Start geladen; Änderungen erfordern einen Neustart.

Die mitgelieferten Lernvideos lassen sich auf macOS neu erzeugen:

```sh
clang -fobjc-arc -fblocks \
  -framework Foundation -framework AppKit -framework AVFoundation \
  -framework CoreMedia -framework CoreVideo -framework CoreGraphics \
  scripts/generate-demo-videos.m -o /private/tmp/viscon-generate-demo-videos
/private/tmp/viscon-generate-demo-videos data/demo-catalog.json media
```

## Schnittstelle

Der genaue Vertrag und Hinweise für den Interface-Agent stehen in [INTEGRATION.md](INTEGRATION.md). `POST /api/search` ist ein Alias von `/api/ask` und enthält zusätzlich `videos` mit den passenden Abschnitten, angelehnt an den Entwurf des Frontends. Katalog und IDs werden über `GET /api/courses` und `GET /api/lectures` geladen. `GET /api/health` liefert Betriebsmodus und Vorlesungsanzahl.

## ETH-Anbindung

Es sind bisher keine ETH-Aufnahmen, ETH-Logins oder institutionellen Schnittstellen angebunden. Der Server bindet standardmässig nur an `127.0.0.1`; er ist ein Entwicklungsdienst ohne Nutzerkonten oder Medienberechtigungen. Die ausgelieferten Kurs-/Vorlesungslisten und Mediendateien sind für jeden Client erreichbar, der den Dienst erreichen kann. Vor einem Betrieb mit geschützten Vorlesungen müssen Anmeldung und Berechtigungen sowohl bei der Suche als auch beim Medienzugriff ergänzt werden. Fragen werden serverseitig weder gespeichert noch protokolliert.

## Referenzen

Untertiteltiming folgt dem [WebVTT-Format des W3C](https://www.w3.org/TR/webvtt1/). Der Player setzt die Zeit nach `loadedmetadata` über [`HTMLMediaElement.currentTime`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime). Der lokale Modelladapter nutzt [Ollama Structured Outputs](https://ollama.com/blog/structured-outputs).
