/* Interface language for the galaxy.
   The page's own wording is English. When the shared language setting (the same one the
   list view uses) is German, text is translated in place by a hand-written dictionary.
   Course names, lecturers and chapter titles come from the catalogue and are left alone. */
(function () {
  var KEY = "viscon.ui-language.v1";
  function stored() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      if (v === "de" || v === "en") return v;
    } catch (e) {}
    return "en";
  }
  var lang = stored();
  window.I18N = {
    language: lang,
    t: function (text) { return text; },
    set: function (next) {
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
      this.language = next;
    }
  };
  if (lang !== "de") return;
  document.documentElement.lang = "de-CH";

  var EXACT = {
    "Study Galaxy": "Lernraum Galaxie",
    "Study room": "Lernraum",
    "Ask the study room": "Frag den Lernraum",
    "Where is pipelining explained?": "Wo wird Pipelining erklärt?",
    "Ask": "Frage stellen",
    "Searching …": "Suche läuft …",
    "List": "Liste",
    "Galaxy": "Galaxie",
    "View": "Ansicht",
    "Standard view with a list and questions": "Normale Ansicht mit Liste und Fragen",
    "Galaxy view": "Galaxie-Ansicht",
    "Other areas": "Weitere Bereiche",
    "Navigation": "Navigation",
    "Autumn semester 2026": "Herbstsemester 2026",
    "Documents": "Dokumente",
    "Course documents": "Kursdokumente",
    "No documents for this course yet.": "Noch keine Dokumente für diesen Kurs.",
    "Loading documents…": "Dokumente werden geladen …",
    "The document list could not be loaded. Please reload the page.": "Die Dokumentenliste konnte nicht geladen werden. Lade die Seite neu.",
    "Document reader": "Dokumentenleser",
    "Drag to look around · scroll to zoom": "Ziehen zum Umsehen · Scrollen zum Zoomen",
    "Board the Versus ship": "Versus-Schiff betreten",
    "Enter the cockpit": "Cockpit betreten",
    "Approaching the cockpit": "Cockpit wird angeflogen",
    "Versus · your next duel": "Versus · Dein nächstes Duell",
    "Cancel": "Abbrechen",
    "Close": "Schliessen",
    "Chat about this lecture": "Chat zur Vorlesung",
    "Hide chat": "Chat ausblenden",
    "Message the lecture chat": "Nachricht an den Vorlesungs-Chat",
    "Ask about this lecture …": "Frag etwas zu dieser Vorlesung …",
    "Send": "Senden",
    "Neighbouring lectures": "Nachbarvorlesungen",
    "How hard was this chapter?": "Wie schwer war dieses Kapitel?",
    "Difficulty from 1 (easy) to 5 (hard)": "Schwierigkeit von 1 (leicht) bis 5 (schwer)",
    "easy": "leicht",
    "hard": "schwer",
    "Thanks! This city's weather follows what everyone reports.": "Danke! Das Wetter dieser Stadt folgt den Einschätzungen aller.",
    "Study room · ETH Zürich": "Lernraum · ETH Zürich",
    "Then you will see your year’s courses as planets.": "Danach siehst du die Kurse deines Studienjahrs als Planeten.",
    "Building the galaxy": "Galaxie wird aufgebaut",
    "Loading the study room": "Lernraum wird geladen",
    "This view needs JavaScript. The lectures are also available in the standard study room.": "Diese Ansicht braucht JavaScript. Die Vorlesungen sind auch im normalen Lernraum erreichbar.",
    "The connection to the study room was interrupted.": "Die Verbindung zum Lernraum ist unterbrochen.",
    "The study room does not contain any lectures yet.": "Der Lernraum enthält noch keine Vorlesungen.",
    "The 3D library did not load. Please reload the page.": "Die 3D-Bibliothek wurde nicht geladen. Lade die Seite neu.",
    "This browser cannot render WebGL. The lectures are available in the standard study room.": "Dieser Browser kann kein WebGL darstellen. Die Vorlesungen sind im normalen Lernraum erreichbar.",
    "The study room is unavailable right now.": "Der Lernraum ist gerade nicht erreichbar.",
    "Selection": "Auswahl",
    "Choose your department": "Departement wählen",
    "Choose your year": "Studienjahr wählen",
    "Other courses": "Weitere Fächer",
    "Change programme": "Studiengang wechseln",
    "Back to the galaxy": "Zur Galaxie",
    "Course · planet": "Kurs · Planet",
    "planets": "Planeten",
    "cities": "Städte",
    "chapters": "Kapitel",
    "chapter": "Kapitel",
    "lectures": "Vorlesungen",
    "Loading the lecture …": "Vorlesung wird geladen …",
    "No video file is available for this lecture.": "Für diese Vorlesung ist keine Videodatei hinterlegt.",
    "Watch this moment": "Stelle ansehen",
    "This lecture does not cover that": "Das wird in dieser Vorlesung nicht behandelt",
    "General knowledge (not from the lecture):": "Allgemeines Wissen (nicht aus der Vorlesung):",
    "I know the whole transcript of this lecture. Ask me something, have a passage explained, or look up a term.": "Ich kenne den ganzen Transkripttext dieser Vorlesung. Frag mich etwas, lass dir eine Stelle erklären oder such einen Begriff.",
    "Summarize this lecture": "Fasse diese Vorlesung zusammen",
    "What are the key terms here?": "Was sind die wichtigsten Begriffe hier?",
    "Explain the part I am at": "Erkläre mir die Stelle, an der ich gerade bin",
    "Reading the lecture …": "Ich lese die Vorlesung …",
    "I could not find a passage about that in this course.": "Dazu habe ich in diesem Kurs keine passende Stelle gefunden.",
    "No passage was found for that.": "Dazu wurde keine Stelle gefunden.",
    "The lecture it found is not part of this view.": "Die gefundene Vorlesung ist in dieser Ansicht nicht vorhanden.",
    "Closest passage ·": "Nächstliegende Stelle ·",
    "‹ Start of the course": "‹ Anfang des Kurses",
    "End of the course ›": "Ende des Kurses ›",
    "Bike": "Velo",
    "Sleigh": "Schlitten",
    "Take the tram to your next appointment": "Mit dem Tram zum nächsten Termin",
    "The shuttle takes you to your next meeting": "Das Shuttle bringt dich zum nächsten Meeting",
    "Ride to the next chapter": "Mit dem Velo zum nächsten Kapitel",
    "A taxi to the next business meeting": "Taxi zum nächsten Business-Meeting",
    "Take the Vespa to your next appointment": "Mit der Vespa zum nächsten Termin",
    "A reindeer sleigh to your next appointment": "Mit dem Rentierschlitten zum nächsten Termin",
    "A taxi to your next appointment": "Taxi zum nächsten Termin"
  };

  var LEC = function (n) { return "VL " + n; };
  // [pattern, builder] for text with numbers or catalogue values mixed in.
  var RULES = [
    [/^(\d+) courses?$/, function (m) { return m[1] + (m[1] === "1" ? " Kurs" : " Kurse"); }],
    [/^(.+) · year (\d+)$/, function (m) { return T(m[1]) + " · " + m[2] + ". Jahr"; }],
    [/^(\d+) courses orbit you\. Choose a planet to see its lectures\.$/, function (m) { return m[1] + " Kurse umkreisen dich. Wähle einen Planeten, um seine Vorlesungen zu sehen."; }],
    [/^(.*) · every city is a lecture\.$/, function (m) { return m[1] + " · jede Stadt ist eine Vorlesung."; }],
    [/^Lecture (\S+) · city$/, function (m) { return "Vorlesung " + m[1] + " · Stadt"; }],
    [/^Every house is a chapter\. Its height is the chapter's length\.(?: (\d+) of (\d+) watched\.)?$/, function (m) { return "Jedes Haus ist ein Kapitel. Die Höhe entspricht seiner Länge." + (m[1] ? " " + m[1] + " von " + m[2] + " gesehen." : ""); }],
    [/^(\d+) lec\.$/, function (m) { return m[1] + " VL"; }],
    [/^(.*) · (\d+) here$/, function (m) { return m[1] + " · " + m[2] + " hier"; }],
    [/^(‹ )?(Tunnel · )?Lec (\S+)( ›)?$/, function (m) { return (m[1] || "") + (m[2] || "") + LEC(m[3]) + (m[4] || ""); }],
    [/^(☀ |☁ |⛈ )Lec (\S+)$/, function (m) { return m[1] + LEC(m[2]); }],
    [/^Lecture (\S+) · from (\S+)$/, function (m) { return "Vorlesung " + m[1] + " · ab " + m[2]; }],
    [/^Lecture (\S+)$/, function (m) { return "Vorlesung " + m[1]; }],
    [/^Chapter (\d+)$/, function (m) { return "Kapitel " + m[1]; }],
    [/^(.+) → chapter (\d+)$/, function (m) { return T(m[1]) + " → Kapitel " + m[2]; }],
    [/^(.+) · chapter (\d+) · (.+)$/, function (m) { return T(m[1]) + " · Kapitel " + m[2] + " · " + m[3]; }],
    [/^‹ (Chapter \d+|Lecture \S+)$/, function (m) { return "‹ " + T(m[1]); }],
    [/^(Chapter \d+|Lecture \S+) ›$/, function (m) { return T(m[1]) + " ›"; }],
    [/^This lecture does not cover that(.*)$/, function (m) { return "Das wird in dieser Vorlesung nicht behandelt" + m[1].replace(/ – found in “(.*)”:/, " – gefunden in „$1“:"); }],
    [/^Closest passage · (.*)$/, function (m) { return "Nächstliegende Stelle · " + m[1]; }],
    [/^The galaxy could not be built: (.*)$/, function (m) { return "Die Galaxie konnte nicht aufgebaut werden: " + m[1]; }]
  ];

  function T(text) {
    if (!text) return text;
    var trimmed = text.trim();
    if (!trimmed) return text;
    var out = null;
    if (Object.prototype.hasOwnProperty.call(EXACT, trimmed)) out = EXACT[trimmed];
    else {
      for (var i = 0; i < RULES.length; i++) {
        var m = RULES[i][0].exec(trimmed);
        if (m) { out = RULES[i][1](m); break; }
      }
    }
    if (out === null) return text;
    return text.replace(trimmed, out);
  }
  window.I18N.t = T;

  var ATTRS = ["title", "aria-label", "placeholder", "alt"];
  var busy = false;

  function fixText(node) {
    var p = node.parentNode;
    if (p && (p.nodeName === "SCRIPT" || p.nodeName === "STYLE")) return;
    var next = T(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  function fixAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) { var nv = T(v); if (nv !== v) el.setAttribute(ATTRS[i], nv); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1) return;
    fixAttrs(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) fixText(n); else fixAttrs(n);
    }
  }
  function head() {
    document.title = document.title.replace("Study Galaxy", "Lernraum Galaxie");
    var m = document.querySelector("meta[name=description]");
    if (m) m.content = m.content.replace(/^The (.+) study world as a galaxy: courses are planets, lectures are cities, chapters are houses\.$/, "Die $1 Lernlandschaft als Galaxie: Kurse sind Planeten, Vorlesungen sind Städte, Kapitel sind Häuser.");
  }

  function start() {
    head();
    walk(document.body);
    new MutationObserver(function (records) {
      if (busy) return;
      busy = true;
      try {
        records.forEach(function (r) {
          if (r.type === "characterData") fixText(r.target);
          else if (r.type === "attributes") fixAttrs(r.target);
          else r.addedNodes.forEach(walk);
        });
      } finally { busy = false; }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
