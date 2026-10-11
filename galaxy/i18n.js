/* Shared interface-language setting for the galaxy's account menu.
   The galaxy's own text is English; this stores the same choice the list view uses
   (and the menu itself follows it). */
(function () {
  var KEY = "viscon.ui-language.v1";
  function stored() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      if (v === "de" || v === "en") return v;
    } catch (e) {}
    return "en";
  }
  window.I18N = {
    language: stored(),
    set: function (next) {
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
      this.language = next;
    }
  };
})();
