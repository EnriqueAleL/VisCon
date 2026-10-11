/* Account menu (top right): interface and answer language, who is signed in, log out.
   Same settings as the DU/YOU menu in the list view. */
(function () {
  var btn = document.getElementById("account-btn");
  var panel = document.getElementById("account-panel");
  var user = document.getElementById("account-user");
  var logout = document.getElementById("account-logout");
  if (!btn || !panel) return;

  var TEXT = {
    en: {
      avatar: "YOU", account: "Account", interfaceLang: "Interface language", answerLang: "AI answer language",
      auto: "Automatic", autoHint: "Same as the question", deHint: "Answers in German", enHint: "Answers in English",
      note: "The answer language applies to answers in chat. Some messages from the server may still be in German.",
      signedIn: "Signed in as", logout: "Log out", notSignedIn: "Not signed in"
    },
    de: {
      avatar: "DU", account: "Konto", interfaceLang: "Sprache der Oberfläche", answerLang: "Sprache der KI-Antwort",
      auto: "Automatisch", autoHint: "Wie die Frage", deHint: "Antworten auf Deutsch", enHint: "Antworten auf Englisch",
      note: "Die Antwortsprache gilt für Antworten im Chat. Hinweise vom Server können weiterhin Deutsch sein.",
      signedIn: "Angemeldet als", logout: "Abmelden", notSignedIn: "Nicht angemeldet"
    }
  };
  var lang = window.I18N ? window.I18N.language : "en";
  var tx = TEXT[lang] || TEXT.en;

  function setText(selector, value) {
    var el = panel.querySelector(selector);
    if (el) el.textContent = value;
  }
  btn.textContent = tx.avatar;
  btn.title = tx.account;
  btn.setAttribute("aria-label", tx.account);
  panel.setAttribute("aria-label", tx.account);
  setText("[data-t=interface]", tx.interfaceLang);
  setText("[data-t=answer]", tx.answerLang);
  setText("[data-answer=auto] span", tx.auto);
  setText("[data-answer=auto] small", tx.autoHint);
  setText("[data-answer=de] small", tx.deHint);
  setText("[data-answer=en] small", tx.enHint);
  setText("[data-t=note]", tx.note);
  setText("[data-t=signedin]", tx.signedIn);
  logout.textContent = tx.logout;

  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }

  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (status) {
      var name = status && status.account && status.account.username;
      user.textContent = name || tx.notSignedIn;
      if (!name) logout.hidden = true;
    })
    .catch(function () { user.textContent = tx.notSignedIn; logout.hidden = true; });

  // Interface language (shared with the list view).
  var langButtons = panel.querySelectorAll("[data-lang]");
  function paintLang() {
    Array.prototype.forEach.call(langButtons, function (b) {
      b.setAttribute("aria-checked", String(window.I18N && window.I18N.language === b.getAttribute("data-lang")));
    });
  }
  Array.prototype.forEach.call(langButtons, function (b) {
    b.addEventListener("click", function () {
      var next = b.getAttribute("data-lang");
      if (window.I18N && window.I18N.language !== next) {
        window.I18N.set(next);
        var t = TEXT[next] || TEXT.en;
        tx = t;
        btn.textContent = t.avatar;
        location.reload();
      }
    });
  });
  paintLang();

  // Language of the AI answers (shared with the list view).
  function answerStored() {
    try {
      var v = JSON.parse(localStorage.getItem("viscon.answer-language.v1"));
      if (v === "auto" || v === "de" || v === "en") return v;
    } catch (e) {}
    return "auto";
  }
  var answerButtons = panel.querySelectorAll("[data-answer]");
  function paintAnswer() {
    var cur = answerStored();
    Array.prototype.forEach.call(answerButtons, function (b) {
      b.setAttribute("aria-checked", String(b.getAttribute("data-answer") === cur));
    });
  }
  Array.prototype.forEach.call(answerButtons, function (b) {
    b.addEventListener("click", function () {
      try { localStorage.setItem("viscon.answer-language.v1", JSON.stringify(b.getAttribute("data-answer"))); } catch (e) {}
      paintAnswer();
    });
  });
  paintAnswer();

  btn.addEventListener("click", function () { setOpen(panel.hidden); });
  document.addEventListener("pointerdown", function (e) {
    if (!panel.hidden && !document.getElementById("account").contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { setOpen(false); e.stopPropagation(); }
  }, true);

  logout.addEventListener("click", function () {
    logout.disabled = true;
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" })
      .catch(function () {})
      .then(function () { location.reload(); });
  });
})();
