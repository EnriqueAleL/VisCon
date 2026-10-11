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
      user.textContent = name || "Nicht angemeldet";
      if (!name) logout.hidden = true;
    })
    .catch(function () { user.textContent = "Nicht angemeldet"; logout.hidden = true; });

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
