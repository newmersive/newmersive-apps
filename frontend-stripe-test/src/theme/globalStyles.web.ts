const STYLE_ID = "allwain-app-typography";

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @font-face {
      font-family: "Nunito Sans allwain";
      src: url("/web/assets/fonts/nunito-sans-latin-var.woff2") format("woff2");
      font-style: normal;
      font-weight: 200 1000;
      font-display: swap;
    }

    @font-face {
      font-family: "Nunito Sans allwain";
      src: url("/web/assets/fonts/nunito-sans-latin-ext-var.woff2") format("woff2");
      font-style: normal;
      font-weight: 200 1000;
      font-display: swap;
    }

    #root [dir="auto"],
    #root input,
    #root textarea,
    #root button {
      font-family: "Nunito Sans allwain", ui-rounded, "Segoe UI", sans-serif;
    }
  `;
  document.head.appendChild(style);
}

export {};
