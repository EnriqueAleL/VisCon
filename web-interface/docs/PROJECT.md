# Projektstand

## Ziel

Studierende stellen eine fachliche Frage und erhalten passende Vorlesungsvideos mit den konkreten Stellen, die zur Frage beitragen. Kurs, Titel, Zeitmarke und Transkript sollen den Treffer nachvollziehbar machen.

Der erste Schritt ist ein benutzbares Webinterface. Echtes Videomaterial, Suche im Backend und ETH-Anmeldung folgen getrennt, sobald Datenzugang und Anforderungen feststehen.

## Aktuelle Entscheidungen

- Die Anwendung liegt isoliert in `web-interface/`; neue zugehoerige Dateien bleiben in diesem Ordner.
- React und TypeScript bilden das Interface ab. Vite startet und baut die Anwendung.
- Gemeinsame Datentypen liegen in `src/types.ts`, Beispielinhalte und lokale Suche in `src/data/lectures.ts`.
- Wiederverwendbare Videoansichten liegen in `src/components/`.
- Merkliste und Fragenhistorie werden vorerst lokal gespeichert. Es gibt kein Benutzerkonto und keine Synchronisation zwischen Geraeten.
- Die Texte, Personen und Vorlesungen sind Demonstrationsdaten. Vorschaubilder sind keine echten ETH-Vorlesungsaufnahmen; ihre Quellen stehen in [assets.md](assets.md).
- VisCon hat keine offizielle Verbindung zur ETH Zuerich.

## Datenmodell

Ein `Course` beschreibt ein Fach. Eine `Lecture` enthaelt Titel, Kurszuordnung, Datum, Dauer, Vorschaubild und mehrere `Segment`-Eintraege. Jeder Abschnitt hat eine stabile ID, Start und Ende in Sekunden, einen Titel und ein Transkript.

Stabile Abschnitts-IDs erlauben es, Merkliste, Suche und Zeitmarken auf dieselbe Stelle zu beziehen. Die aktuelle Suche nutzt Stichwoerter und lokale Daten; Ergebnisse sind keine KI-Antworten und belegen keine vollstaendige fachliche Abdeckung.

## Naechste Anbindungen

1. Verfuegbare Vorlesungen, Nutzungsrechte und Medienzugang klaeren. Echte Metadaten und Vorschaubilder uebernehmen und einen Videoplayer mit Sprung zur Startzeit anschliessen.
2. Transkripte mit Zeitmarken importieren und in nachvollziehbare Abschnitte aufteilen. Vorlesung, Abschnitt und Zeitmarke bleiben dauerhaft miteinander verknuepft.
3. Eine Suche im Backend anbinden, zunaechst mit Textsuche und danach bei Bedarf mit semantischer Suche. Treffer sollen Kurs, Vorlesung und relevante Abschnitte liefern.
4. ETH-Anmeldung und Zugriffskontrolle ergaenzen, sobald der passende institutionelle Zugang feststeht. Medienzugriffe muessen serverseitig autorisiert werden.

## Vorschlag fuer die Such-API

Dieser Vertrag ist ein Entwurf und derzeit nicht implementiert. `courseId: null` bedeutet alle Kurse; Zeiten sind Sekunden. Der Server liefert nur fuer den Nutzer zugaengliche Medien.

`POST /api/search`

```json
{
  "question": "Wie berechne ich Eigenwerte?",
  "courseId": "linear-algebra"
}
```

```json
{
  "videos": [
    {
      "id": "eigenvalues-introduction",
      "courseId": "linear-algebra",
      "title": "Eigenwerte und Eigenvektoren",
      "mediaUrl": "/api/videos/eigenvalues-introduction/playback",
      "segments": [
        {
          "id": "eigenvalues-computation",
          "start": 1446,
          "end": 1795,
          "title": "Eigenwerte und Eigenvektoren berechnen",
          "transcript": "Zuerst bestimmen wir die Eigenwerte ..."
        }
      ]
    }
  ]
}
```

Vor der Implementierung sind Metadaten, Pagination, Fehlerantworten und Medienberechtigungen abzustimmen. Die lokale Suche kann dann durch eine API-Funktion ersetzt werden, waehrend Karten und Abschnittsvorschau weiter das gemeinsame Datenmodell nutzen.
