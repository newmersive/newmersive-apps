export const demoModeEnabled =
  (typeof process !== "undefined" &&
    process?.env?.EXPO_PUBLIC_DEMO_MODE === "1") ||
  false;
