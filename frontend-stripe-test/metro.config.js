const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// 1) Preferir CJS antes que ESM
config.resolver.resolverMainFields = ["react-native", "browser", "main", "module"];

// 2) Parche: si Metro intenta cargar zustand ESM (que usa import.meta), lo redirigimos a CJS
const projectRoot = __dirname;
const zustandCjsEntry = path.join(projectRoot, "node_modules", "zustand", "index.js");
const queryStringCompatEntry = path.join(
  projectRoot,
  "src",
  "shims",
  "queryStringCompat.js",
);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Expo 17's web QR hook creates a CDN worker at import time, even without
  // a camera. Keep scanning local and lazy; native Expo remains unchanged.
  if (platform === "web" && moduleName === "./web/useWebQRScanner" &&
      /[\\/]expo-camera[\\/](src|build)[\\/]ExpoCamera\.web\.[jt]sx?$/.test(context.originModulePath || "")) {
    return { type: "sourceFile", filePath: path.join(projectRoot, "src", "camera", "useLocalWebQRScanner.ts") };
  }
  // React Navigation 6 imports query-string as named exports, while current
  // query-string versions expose a default ESM object. Keep the secure current
  // parser and adapt only that package boundary for Metro.
  if (
    moduleName === "query-string" &&
    path.resolve(context.originModulePath || "") !== queryStringCompatEntry
  ) {
    return {
      type: "sourceFile",
      filePath: queryStringCompatEntry,
    };
  }

  // casos típicos que acaban resolviendo a zustand/esm/index.mjs
  if (
    moduleName === "zustand/esm" ||
    moduleName === "zustand/esm/index.mjs" ||
    moduleName === "zustand"
  ) {
    // devolvemos la ruta CJS de zustand
    return {
      type: "sourceFile",
      filePath: zustandCjsEntry,
    };
  }

  // fallback a resolución normal
  if (typeof originalResolveRequest === "function") {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
