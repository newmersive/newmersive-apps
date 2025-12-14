const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// 1) Preferir CJS antes que ESM
config.resolver.resolverMainFields = ["react-native", "browser", "main", "module"];

// 2) Parche: redirige zustand ESM (import.meta) a CJS
const projectRoot = __dirname;
const zustandCjsEntry = path.join(projectRoot, "node_modules", "zustand", "index.js");

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "zustand/esm" ||
    moduleName === "zustand/esm/index.mjs" ||
    moduleName === "zustand"
  ) {
    return {
      type: "sourceFile",
      filePath: zustandCjsEntry,
    };
  }

  if (typeof originalResolveRequest === "function") {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;