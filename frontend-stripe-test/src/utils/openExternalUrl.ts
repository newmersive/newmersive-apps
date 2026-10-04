import { Linking, Platform } from "react-native";

export async function openExternalUrl(url: string) {
  if (Platform.OS === "web") {
    const location = (globalThis as any)?.location;
    if (typeof location?.assign === "function") {
      location.assign(url);
      return;
    }
  }
  await Linking.openURL(url);
}
