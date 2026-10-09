# Roadmap

Die Liste wird bei Aenderungen aktualisiert, damit Aufgaben und Entscheidungen nicht verloren gehen. Hintergrund und API-Entwurf stehen in [PROJECT.md](PROJECT.md).

## Integration mit Basis Arena

- [x] Aktuellen Stand `ce8e44b` übernehmen und Picker, Hover-Navigation und Verlauf erhalten.
- [x] Beide Oberflächen mit gemeinsamem API-/Medienserver verbinden.
- [x] Arena-Navigation, Sitzungserhalt und Rückkehr aus aktiven Räumen prüfen.
- [x] Lokale Suche und optionale Python-Q&A-Anbindung dokumentieren.

## Erstes Webinterface

- [x] Eigenen Projektordner und dokumentierte Struktur anlegen.
- [x] React-/TypeScript-App mit Vite aufsetzen.
- [x] Fragenformular mit lokaler Stichwortsuche umsetzen.
- [x] Schmale Icon-Navigation mit schrittweisem Auswahlfenster für Kalenderjahr, Semester, Studienjahr (BSc 1–3/MSc 1–2) und Fach umsetzen.
- [x] Fragen vor der Fachauswahl sperren und Treffer auf das Fach im gewählten Zeitraum begrenzen.
- [x] Fachkontext mit Kalenderjahr, Semester, Abschluss und Studienjahr im lokalen Frageverlauf speichern, bestehende Einträge migrieren und beim Wiederöffnen herstellen.
- [x] Passende Vorlesungen und Abschnitte mit Zeitmarken anzeigen.
- [x] Kursfilter, Sortierung sowie Raster-/Listenansicht bereitstellen.
- [x] Bibliotheksansicht bereitstellen.
- [x] Merkliste fuer einzelne Abschnitte lokal speichern.
- [x] Fragenhistorie lokal speichern.
- [x] Vorschau mit Zeitmarken und Beispieltranskript bereitstellen.
- [x] Desktop- und Mobilansichten gestalten.
- [x] Build und Browserablauf mit Zeitmarken, Speicherung und Mobilansichten pruefen.
- [x] Demo-Grenzen, Asset-Herkunft und Integrationsplan dokumentieren.

## Echte Vorlesungen

- [ ] Verfuegbare Aufnahmen und Nutzungsrechte klaeren.
- [ ] Sicheren Zugriff auf die Mediendateien festlegen.
- [x] Vorhandene Titel, Kapitel und Dauer importieren.
- [ ] Bestätigte Semester- und Studienmetadaten ergänzen.
- [x] Videoplayer mit direktem Sprung zu Trefferzeitmarken anbinden.
- [x] Transkripte importieren oder erstellen und zeitlich indizieren.
- [x] Fehlende Medien, Ladefehler und Zugriffsprobleme im Interface behandeln.

## Suche und Konten

- [x] Such-API und Antwortformat anhand echter Daten festlegen.
- [x] Serverseitige Textsuche mit Kursfilter anbinden.
- [ ] Relevanz der Treffer mit realen studentischen Fragen pruefen.
- [ ] Semantische Suche nach Bedarf ergaenzen.
- [ ] ETH-Anmeldung und serverseitige Zugriffskontrolle integrieren.
- [ ] Merkliste und Historie optional mit einem Benutzerkonto synchronisieren.
- [ ] Speicherung und Loeschung persoenlicher Daten festlegen.

## Vor einer Veroeffentlichung

- [ ] Barrierefreiheit und Bedienung mit Tastatur pruefen.
- [x] Suche und Zeitmarken mit echten Medien durchgaengig testen.
- [ ] Betrieb, Deployment und Konfiguration dokumentieren.
- [ ] Anzeigename und Abgrenzung zu offiziellen ETH-Angeboten abstimmen.
