const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("keeps the official Allwain coral and graphite as brand anchors", () => {
  const colors = read("src/theme/colors.ts");

  assert.match(colors, /primary:\s*"#FF795A"/);
  assert.match(colors, /brandDark:\s*"#404041"/);
});

test("uses the official logo assets in the shared header and home hero", () => {
  const header = read("src/components/design-system/RoleSwitcher.tsx");
  const home = read("src/screens/Scan/HomeScreen.tsx");

  assert.match(header, /Logotipo_Allwain_02\.png/);
  assert.match(home, /Imagotipo_Allwain_03\.png/);
  assert.match(home, /heroPlane/);
  assert.match(home, /backgroundColor:\s*colors\.primary/);
  assert.match(header, /stripeTestMarketplace\s*&&\s*participation\?\.seller\?\.enabled/);
  assert.match(header, /participation\?\.seller\?\.sellerReady/);
});

test("changes the bottom navigation palette with the selected role", () => {
  const tabs = read("src/navigation/MainTabs.tsx");

  assert.match(tabs, /background:\s*"rgba\(255,255,255,0\.96\)"/);
  assert.match(tabs, /appMode === "sell"/);
  assert.match(tabs, /background:\s*colors\.seller/);
  assert.match(tabs, /appMode === "connector"/);
  assert.match(tabs, /background:\s*colors\.connector/);
});

test("places the seller offer list after agreements in the web flex order", () => {
  const offers = read("src/screens/Offers/OffersScreen.tsx");
  assert.match(offers, /isSeller \? \(\{ order: 10 \} as any\) : undefined/);
});

test("restores the V1 three-colour role band without separated cards", () => {
  const header = read("src/components/design-system/RoleSwitcher.tsx");

  assert.match(header, /mode === "buy" \? colors\.buyer : mode === "sell" \? colors\.seller : colors\.connector/);
  assert.match(header, /borderBottomWidth:\s*4/);
  assert.doesNotMatch(header, /tabs:\s*\{[^}]*gap:/s);
  assert.doesNotMatch(header, /tab:\s*\{[^}]*borderRadius:/s);
});

test("loads the bundled rounded web typeface without claiming a missing font", () => {
  const webStyles = read("src/theme/globalStyles.web.ts");

  assert.match(webStyles, /Nunito Sans allwain/);
  assert.match(webStyles, /nunito-sans-latin-var\.woff2/);
  assert.doesNotMatch(webStyles, /Gotham/i);
});
