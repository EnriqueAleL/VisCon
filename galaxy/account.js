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
