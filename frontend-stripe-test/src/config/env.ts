export const demoModeEnabled =
  process.env.EXPO_PUBLIC_DEMO_MODE === "1";

export const googleAuthClientIds = {
  // Public OAuth application IDs, shared with the existing production clients.
  // Keep production builds functional when an isolated checkout has no .env.
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "20121163354-d7014u32hlq2u5h30q6ul7g5vfa17heh.apps.googleusercontent.com",
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "20121163354-jokq2p1q2pgpkni6492tnf272efgbh62.apps.googleusercontent.com",
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "20121163354-hb8c5ih4cjnn2s5nedh9nc3b82h2g0gk.apps.googleusercontent.com",
};
