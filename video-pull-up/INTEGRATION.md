# Anschluss an das Website-Interface

Das Modul ist unabhängig in `video-pull-up/` umgesetzt. Der Interface-Agent kann das Fragenformular, die Erklärung und den Player an diese Schnittstelle anschliessen. Die Startseite des Interfaces zeigt ein mittiges, leeres Fragefeld. Kalenderjahr, Semester, Studienjahr (BSc/MSc) und Fach werden über das Kurs-Icon gewählt; erst dann ist der Chat freigeschaltet. Videotreffer erscheinen erst nach einer Frage und gehören ausschliesslich zum gewählten Fach, Zeitraum und Studienkontext. Die Backend-Anbindung ist im Interface noch nicht vorgenommen.

## Entwicklung

Backend mit `cd video-pull-up && npm start` auf Port 8787 starten. In der Vite-Konfiguration des Frontends die Proxies ergänzen:

```ts
server: {
  proxy: {
    '/api': 'http://127.0.0.1:8787',
    '/media': 'http://127.0.0.1:8787',
  },
},
```

Alternativ den Client mit `baseUrl: 'http://127.0.0.1:8787'` aufrufen. Für direkte API-Aufrufe muss die Frontend-Origin zu `FRONTEND_ORIGIN` passen (Standard `http://127.0.0.1:5173`). `localhost` und `127.0.0.1` sind verschiedene Origins. Bei einem anderen Vite-Port die Konfiguration anpassen. Für Produktion eine gemeinsame Origin oder entsprechende Reverse-Proxy-Routen einrichten.

## Frage stellen

```http
POST /api/ask
Content-Type: application/json

{
  "question": "Wie berechne ich Eigenwerte und Eigenvektoren?",
  "courseId": "linear-algebra",
  "lectureId": "eigenvalues-introduction",
  "limit": 3
}
```

`courseId` und `lectureId` sind optional. `courseId: null` oder `"all"` sucht in allen Fächern; `lectureId: null` in allen verfügbaren Vorlesungen des gewählten Fachs. IDs kommen aus `GET /api/courses` und `GET /api/lectures?courseId=linear-algebra`. Fachfremde Vorlesungs-IDs werden abgelehnt. `limit` ist 1–5, Standard 3.

Das aktuelle Interface verwendet die Auswahl Kalenderjahr → Semester → Studienjahr (BSc 1–3/MSc 1–2) → Fach. Beim Anschluss die gewählte `courseId` übergeben und den Backend-Katalog um Kalenderjahr, Semester, Abschluss und Studienjahr sowie entsprechende Filter ergänzen, damit Fragen im gewählten Studienkontext bleiben. Eine `lectureId` wird nur noch für eine ausdrücklich auf eine Aufnahme begrenzte Frage benötigt. Die Frontend-Beispiele und der Backend-Demo-Katalog enthalten unterschiedliche Vorlesungen und Zeitmarken; sie dürfen beim Anschluss nicht vermischt werden.

Auszug einer Antwort:

```json
{
  "status": "answered",
  "answer": {
    "mode": "extractive",
    "text": "Um Eigenwerte zu berechnen, lösen wir det(A − λI) = 0. …",
    "paragraphs": [
      {
        "text": "Um Eigenwerte zu berechnen, lösen wir det(A − λI) = 0. …",
        "sourceIds": ["S1"]
      }
    ],
    "notice": "Erklärung aus den gefundenen Transkriptabschnitten. Kein Sprachmodell aktiv."
  },
  "sources": [
    {
      "id": "S1",
      "lectureId": "eigenvalues-introduction",
      "courseId": "linear-algebra",
      "courseName": "Lineare Algebra I",
      "lectureTitle": "Eigenwerte und Eigenvektoren · Demo",
      "segmentId": "eigenvalues-computation",
      "title": "Eigenwerte und Eigenvektoren berechnen",
      "start": 30,
      "end": 60,
      "contextStart": 30,
      "transcript": "Um Eigenwerte zu berechnen, lösen wir det(A − λI) = 0. …",
      "mediaUrl": "/media/eigenvalues-introduction.mp4",
      "playbackUrl": "/media/eigenvalues-introduction.mp4#t=30",
      "score": 10.0,
      "demo": true
    }
  ],
  "playback": {
    "sourceId": "S1",
    "lectureId": "eigenvalues-introduction",
    "mediaUrl": "/media/eigenvalues-introduction.mp4",
    "url": "/media/eigenvalues-introduction.mp4#t=30",
    "start": 30,
    "end": 60
  }
}
```

Texte sind hier gekürzt, der Score ist exemplarisch. Alle Zeitwerte sind Sekunden. `start` ist die relevante Sprungmarke; `contextStart` der Beginn des gesamten Transkriptfensters. `sources` sind nach Suchrelevanz geordnet. `id` (`S1` etc.) gilt innerhalb einer Antwort, `segmentId` ist die Katalog-ID für Merkliste oder Referenzen.

`videos` enthält zusätzlich Vorlesungsobjekte mit den passenden Abschnitten. Neue Kataloge müssen nicht dieselben Titel, Bilder, Kurse oder IDs wie die bisherigen acht Frontend-Beispiele haben. Fehlende Vorschaubilder im Interface abfangen und Metadaten aus der API laden. Die Demo hat drei eigene Videos mit 90 Sekunden Dauer; die bisherigen fiktiven 50-Minuten-Zeitmarken dürfen dafür nicht verwendet werden.

## Client und Player

`client/client.mjs` und `client/client.d.mts` können übernommen oder direkt importiert werden. Das Laufzeitmodul ist unabhängig von React. Beispiel aus `web-interface/src/App.tsx`:

```tsx
import { askLecture, pullUpVideo } from '../../video-pull-up/client/client.mjs';

const result = await askLecture({ question, courseId, lectureId });
// result.answer.paragraphs mit anklickbaren sourceIds anzeigen.
// Zunächst den Player rendern/öffnen und danach dessen <video>-Element verwenden.
if (result.sources[0]?.mediaUrl && videoRef.current) {
  await pullUpVideo(videoRef.current, result.sources[0]);
}
```

`pullUpVideo` lädt die Datei, wartet auf Metadaten und setzt `currentTime`. Ein späterer Quellenwechsel ersetzt eine noch wartende Auswahl. Dieselbe Videodatei wird bei einem Abschnittswechsel nicht neu geladen. Mit `autoplay: true` versucht der Client auch, die Wiedergabe zu starten; blockiert der Browser dies, bleibt die richtige Zeitmarke eingestellt und `playing` ist `false`. Native Videokontrollen anzeigen. Der Player hält am Abschnittsende nicht automatisch an.

Bei jeder neuen Frage alte Requests über den `signal`-Parameter von `askLecture` abbrechen. Fach- und Vorlesungswechsel müssen alte Antworten und den Player zurücksetzen. Die eigenständige Demo in `demo/demo.js` zeigt diesen Ablauf vollständig.

## Zustände anzeigen

| Zustand | Anzeige |
| --- | --- |
| `answered` | Erklärung, Quellen und passende Videostelle |
| `no_match` | Hinweis aus `answer.notice`, keine Antwort oder Videostelle erfinden |
| `insufficient_context` | Hinweis anzeigen, ähnliche Quellen als weiterführende Stellen anbieten |
| `answer.mode = extractive` | Transkript-Erklärung; derzeit kein Sprachmodell |
| `answer.mode = generated` | KI-Erklärung mit Quellen; fachlich nicht automatisch verifiziert |
| `answer.mode = extractive_fallback` | Hinweis auf Modellproblem, Transkript-Erklärung bleibt verfügbar |
| `source.mediaUrl = null` | Erklärung und Transkript anzeigen, fehlendes Video erklären |
| HTTP-Fehler | `{ "error": "…" }` anzeigen; 400 Eingabe, 404 unbekannte ID, 413 Anfragegrösse, 415 Content-Type |

Das aktuelle Interface zeigt bisher alle Abschnitte einer gefundenen Vorlesung. Für die Fragenansicht die tatsächlich gelieferten `sources` oder `videos[].segments` verwenden, damit die angezeigten Zeitmarken zur Frage gehören.
