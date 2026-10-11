/* Interface language for the galaxy. The page's own wording is German; when the shared
   language setting (also used by the list view) is English, text is translated in place.
   Course names, lecturers and chapter titles come from the catalogue and are left alone. */
(function () {
  var KEY = "viscon.ui-language.v1";
  function stored() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      if (v === "de" || v === "en") return v;
    } catch (e) {}
    return /^de/i.test(navigator.language || "") ? "de" : "en";
  }
  var lang = stored();
  window.I18N = {
    language: lang,
    t: function (text) { return text; },
    set: function (next) {
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
      location.reload();
    }
  };
  document.documentElement.lang = lang === "de" ? "de-CH" : "en";
  if (lang === "de") return;

  var EXACT = {
    "Lernraum Galaxie": "Study galaxy",
    "Lernraum": "Study room",
    "Frag den Lernraum": "Ask the study room",
    "Wo wird Pipelining erklärt?": "Where is pipelining explained?",
    "Frage stellen": "Ask",
    "Suche läuft …": "Searching …",
    "Liste": "List",
    "Galaxie": "Galaxy",
    "Ansicht": "View",
    "Normale Ansicht mit Liste und Fragen": "Standard view with list and questions",
    "Galaxie-Ansicht": "Galaxy view",
    "Weitere Bereiche": "More areas",
    "Navigation": "Navigation",
    "Konto": "Account",
    "Angemeldet als": "Signed in as",
    "Abmelden": "Log out",
    "Nicht angemeldet": "Not signed in",
    "Sprache": "Language",
    "DU": "YOU",
    "Sprache der Oberfläche": "Interface language",
    "Sprache der KI-Antwort": "AI answer language",
    "Automatisch": "Automatic",
    "Wie die Frage": "Same as the question",
    "Antworten auf Deutsch": "Answers in German",
    "Antworten auf Englisch": "Answers in English",
    "Die Antwortsprache gilt für Antworten im Chat. Hinweise vom Server können weiterhin Deutsch sein.": "The answer language applies to answers in chat. Some messages from the server may still be in German.",
    "Herbstsemester 2026": "Autumn semester 2026",
    "Dokumente": "Documents",
    "Kursdokumente": "Course documents",
    "Noch keine Dokumente für diesen Kurs.": "No documents for this course yet.",
    "Ziehen zum Umsehen · Scrollen zum Zoomen": "Drag to look around · Scroll to zoom",
    "Versus-Schiff betreten": "Board the Versus ship",
    "Cockpit betreten": "Enter cockpit",
    "Cockpit wird angeflogen": "Flying to the cockpit",
    "Versus · Dein nächstes Duell": "Versus · Your next duel",
    "Abbrechen": "Cancel",
    "Schliessen": "Close",
    "Chat zur Vorlesung": "Lecture chat",
    "Chat ausblenden": "Hide chat",
    "Nachricht an den Vorlesungs-Chat": "Message to the lecture chat",
    "Frag etwas zu dieser Vorlesung …": "Ask something about this lecture …",
    "Senden": "Send",
    "Nachbarvorlesungen": "Neighbouring lectures",
    "Wie schwer war dieses Kapitel?": "How hard was this chapter?",
    "Schwierigkeit von 1 (leicht) bis 5 (schwer)": "Difficulty from 1 (easy) to 5 (hard)",
    "leicht": "easy",
    "schwer": "hard",
    "Danke! Das Wetter dieser Stadt folgt euren Einschätzungen.": "Thanks! This city's weather follows your ratings.",
    "Departement wählen": "Choose department",
    "Studienjahr wählen": "Choose study year",
    "Auswahl": "Selection",
    "Lernraum · ETH Zürich": "Study room · ETH Zürich",
    "Danach siehst du die Kurse deines Studienjahrs als Planeten.": "Then you will see the courses of your study year as planets.",
    "Galaxie wird aufgebaut": "Building the galaxy",
    "Lernraum wird geladen": "Loading the study room",
    "Diese Ansicht braucht JavaScript. Die Vorlesungen sind auch im normalen Lernraum erreichbar.": "This view needs JavaScript. The lectures are also available in the regular study room.",
    "Die 3D-Bibliothek wurde nicht geladen. Lade die Seite neu.": "The 3D library did not load. Reload the page.",
    "Dieser Browser kann kein WebGL darstellen. Die Vorlesungen sind im normalen Lernraum erreichbar.": "This browser cannot display WebGL. The lectures are available in the regular study room.",
    "Der Lernraum ist gerade nicht erreichbar.": "The study room is not reachable right now.",
    "Weitere Fächer": "Other subjects",
    "Studiengang wechseln": "Change programme",
    "Zur Galaxie": "Back to the galaxy",
    "Kurs · Planet": "Course · Planet",
    "Städte": "Cities",
    "Kapitel": "Chapters",
    "Vorlesungen": "Lectures",
    "Vorlesung wird geladen …": "Loading lecture …",
    "Für diese Vorlesung ist keine Videodatei hinterlegt.": "No video file is available for this lecture.",
    "Stelle ansehen": "View passage",
    "Das wird in dieser Vorlesung nicht behandelt": "This is not covered in this lecture",
    "Allgemeines Wissen (nicht aus der Vorlesung):": "General knowledge (not from the lecture):",
    "Ich kenne den ganzen Transkripttext dieser Vorlesung. Frag mich etwas, lass dir eine Stelle erklären oder such einen Begriff.": "I know the full transcript of this lecture. Ask me something, have a passage explained, or look up a term.",
    "Fasse diese Vorlesung zusammen": "Summarise this lecture",
    "Was sind die wichtigsten Begriffe hier?": "What are the key terms here?",
    "Erkläre mir die Stelle, an der ich gerade bin": "Explain the passage I am at right now",
    "Ich lese die Vorlesung …": "Reading the lecture …",
    "Dazu habe ich in diesem Kurs keine passende Stelle gefunden.": "I found no matching passage for that in this course.",
    "Dazu wurde keine Stelle gefunden.": "No matching passage was found.",
    "Die gefundene Vorlesung ist in dieser Ansicht nicht vorhanden.": "The lecture found is not available in this view.",
    "Nächstliegende Stelle · ": "Closest passage · ",
    "‹ Anfang des Kurses": "‹ Start of course",
    "Ende des Kurses ›": "End of course ›",
    "Velo": "Bike",
    "Schlitten": "Sleigh",
    "Taxi zum nächsten Termin": "Taxi to the next appointment",
    "Mit dem Tram zum nächsten Termin": "Tram to the next appointment",
    "Das Shuttle bringt dich zum nächsten Meeting": "The shuttle takes you to the next meeting",
    "Mit dem Velo zum nächsten Kapitel": "Bike to the next chapter",
    "Taxi zum nächsten Business-Meeting": "Taxi to the next business meeting",
    "Mit der Vespa zum nächsten Termin": "Vespa to the next appointment",
    "Mit dem Rentierschlitten zum nächsten Termin": "Reindeer sleigh to the next appointment"
  };

  // [pattern, builder] for text with numbers or catalogue values mixed in.
  var RULES = [
    [/^(\d+) Kurse?$/, function (m) { return m[1] + (m[1] === "1" ? " course" : " courses"); }],
    [/^(.+) · (\d+)\. Jahr$/, function (m) { return m[1] + " · year " + m[2]; }],
    [/^(\d+) Kurse umkreisen dich\. Wähle einen Planeten, um seine Vorlesungen zu sehen\.$/, function (m) { return m[1] + " courses orbit you. Pick a planet to see its lectures."; }],
    [/^(.*) · jede Stadt ist eine Vorlesung\.$/, function (m) { return m[1] + " · every city is a lecture."; }],
    [/^Vorlesung (\S+) · Stadt$/, function (m) { return "Lecture " + m[1] + " · City"; }],
    [/^Jedes Haus ist ein Kapitel\. Die Höhe entspricht seiner Länge\.(?: (\d+) von (\d+) gesehen\.)?$/, function (m) { return "Every house is a chapter. Its height matches its length." + (m[1] ? " " + m[1] + " of " + m[2] + " watched." : ""); }],
    [/^(\d+) VL$/, function (m) { return m[1] + " lec."; }],
    [/^(.*) · (\d+) hier$/, function (m) { return m[1] + " · " + m[2] + " here"; }],
    [/^(‹ )?(Tunnel · )?VL (\S+)( ›)?$/, function (m) { return (m[1] || "") + (m[2] || "") + "Lec " + m[3] + (m[4] || ""); }],
    [/^Vorlesung (\S+) · ab (\S+)$/, function (m) { return "Lecture " + m[1] + " · from " + m[2]; }],
    [/^Vorlesung (\S+)$/, function (m) { return "Lecture " + m[1]; }],
    [/^Kapitel (\d+)$/, function (m) { return "Chapter " + m[1]; }],
    [/^(.+) → Kapitel (\d+)$/, function (m) { return T(m[1]) + " → Chapter " + m[2]; }],
    [/^(.+) · Kapitel (\d+) · (.+)$/, function (m) { return T(m[1]) + " · Chapter " + m[2] + " · " + m[3]; }],
    [/^‹ (Kapitel \d+|Vorlesung \S+)$/, function (m) { return "‹ " + T(m[1]); }],
    [/^(Kapitel \d+|Vorlesung \S+) ›$/, function (m) { return T(m[1]) + " ›"; }],
    [/^Das wird in dieser Vorlesung nicht behandelt(.*)$/, function (m) { return "This is not covered in this lecture" + m[1]; }],
    [/^(.*) – gefunden in „(.*)“:$/, function (m) { return m[1] + " – found in “" + m[2] + "”:"; }],
    [/^Die Galaxie konnte nicht aufgebaut werden: (.*)$/, function (m) { return "The galaxy could not be built: " + m[1]; }]
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
  function title() {
    document.title = document.title.replace("Lernraum Galaxie", T("Lernraum Galaxie"));
    var m = document.querySelector("meta[name=description]");
    if (m) m.content = m.content.replace(/^Die (.+) Lernlandschaft als Galaxie: Kurse sind Planeten, Vorlesungen sind Städte, Kapitel sind Häuser\.$/, "The $1 learning landscape as a galaxy: courses are planets, lectures are cities, chapters are houses.");
  }

  function start() {
    title();
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
