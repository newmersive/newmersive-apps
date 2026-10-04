(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const toggle = header?.querySelector(".header-menu-toggle");
  if (!header || !toggle) return;

  const compactLayout = window.matchMedia("(max-width: 1279px)");
  document.documentElement.classList.add("has-site-navigation");

  function closeMenu(returnFocus = false) {
    header.classList.remove("is-menu-open");
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    const opened = toggle.getAttribute("aria-expanded") !== "true";
    header.classList.toggle("is-menu-open", opened);
    toggle.setAttribute("aria-expanded", String(opened));
  });

  header.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      closeMenu(true);
    }
  });

  header.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      // Move keyboard reading to the chosen chapter after the menu collapses.
      const heading = target.querySelector("h1, h2, h3") || target;
      heading.setAttribute("tabindex", "-1");
      window.requestAnimationFrame(() => heading.focus({ preventScroll: true }));
    });
  });

  compactLayout.addEventListener("change", () => closeMenu());
})();
