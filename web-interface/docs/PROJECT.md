# Projektstand

Studierende stellen eine fachliche Frage und erhalten passende Vorlesungsvideos mit konkreten Zeitmarken und Transkriptbelegen. Seit der Integration von `ce8e44b` ist diese Oberfläche unter `/learn` mit dem gemeinsamen VisCon-/Basis-Arena-Server verbunden.

## Aktuelle Entscheidungen

- React und TypeScript bilden das Interface ab. Der Root-Vite-Build erzeugt getrennte HTML-/CSS-Einstiegspunkte für Arena und VisCon.
- Alle Oberflächen teilen Farben, lokale Inter-Schriften und Navigation aus `shared/design/`. Der gemeinsame SaaS-B2B-Designvertrag steht in [DESIGN.md](../../DESIGN.md); die Campus-Ansicht liegt unter `/campus`.
- Die schmale Icon-Leiste und die Hover-/Klick-Auswahl bleiben erhalten. Das Arena-Icon öffnet die vorhandene Multiplayer-App unter `/`.
- Datiertes Demo-Material verwendet die Auswahl Jahr → Semester → Studienjahr → Fach. Die 24 realen Aufnahmen ohne bestätigte Studien- und Datumsmetadaten stehen unter „Aufzeichnungen“.
- Vor der Fachauswahl bleibt der Chat gesperrt. Suche und Verlauf behalten den Fachkontext. Ein Fachwechsel bricht alte Anfragen ab und entfernt veraltete Ergebnisse; „Neuer Chat“ behält die Auswahl.
- Der native Player verwendet die Originalvideos, WebVTT-Untertitel und Kapitelspuren. Suchtreffer und gespeicherte Stellen springen zur jeweiligen Startzeit.
- Lernnotizen werden nur angezeigt, wenn eine vorhandene Zusammenfassung verfügbar ist.
- Fachauswahl, Merkliste und Fragenverlauf bleiben lokal gespeichert. Die Arena-Identität bleibt über den gemeinsamen Sitzungscookie erhalten. Es gibt keine ETH-Anmeldung oder Synchronisation der Lernhistorie zwischen Geräten.
- Vorschaubilder und Demos sind keine offiziellen ETH-Inhalte; Bildquellen stehen in [assets.md](assets.md).

## Daten und API

`src/api.ts` verwendet `/api/courses`, `/api/lectures`, `/api/lectures/:id`, `/api/lectures/:id/summary` und `/api/ask`. Der tatsächliche Vertrag steht in [docs/integration.md](../../docs/integration.md). `/api/search` akzeptiert dasselbe Suchformat wie `/api/ask`.

Die Bibliotheksantwort enthält Metadaten, Kapitel und Abschnitts-IDs. Vollständige Transkripte werden erst beim Öffnen einer Aufnahme geladen. Kurse ohne bestätigte Studienzuordnung verwenden `unspecified`; undatierte Aufnahmen verwenden `archive` und `unknown` im Auswahlkontext.

Die standardmäßige Suche nutzt serverseitig den vorhandenen video-pull-up-Retriever. Sie ist eine Stichwortsuche und garantiert keine vollständige fachliche Abdeckung. Die bestehende Python-Q&A-Pipeline kann optional mit eigenen Zugangsdaten aktiviert werden. Ein Providerfehler führt zu einem ausdrücklich gekennzeichneten Rückfall auf Transkripte. Einrichtung und Grenzen stehen im [Root-README](../../README.md).

## Noch offen

Bestätigte Semester-/Studienmetadaten, eine fachlich geprüfte Arena-Fragenbank aus den Vorlesungen, ETH-Anmeldung, Zugriffskontrolle, geräteübergreifende Synchronisation und öffentlicher Betrieb bleiben gesonderte Aufgaben. Vor einer Veröffentlichung müssen insbesondere die Nutzungsrechte und der institutionelle Medienzugang geklärt werden.
