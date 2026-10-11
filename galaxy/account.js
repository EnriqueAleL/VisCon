/* Account button (top right): shows who is signed in and offers log out. */
(function () {
  var btn = document.getElementById("account-btn");
  var panel = document.getElementById("account-panel");
  var user = document.getElementById("account-user");
  var logout = document.getElementById("account-logout");
  if (!btn || !panel) return;

  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }

  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (status) {
      var name = status && status.account && status.account.username;
      user.textContent = name || (window.I18N ? window.I18N.t("Nicht angemeldet") : "Nicht angemeldet");
      if (!name) logout.hidden = true;
    })
    .catch(function () { user.textContent = (window.I18N ? window.I18N.t("Nicht angemeldet") : "Nicht angemeldet"); logout.hidden = true; });

  Array.prototype.forEach.call(panel.querySelectorAll("[data-lang]"), function (b) {
    var on = window.I18N && window.I18N.language === b.getAttribute("data-lang");
    b.setAttribute("aria-checked", String(!!on));
    b.addEventListener("click", function () {
      if (window.I18N && !on) window.I18N.set(b.getAttribute("data-lang"));
    });
  });

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
