import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type StoredSession<T> = {
  refreshToken: string | null;
  data: T;
};

function refreshTokenKey(key: string) {
  return `${key}.refresh`;
}

function profileKey(key: string) {
  return `${key}.profile`;
}

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function saveRefreshToken(key: string, refreshToken: string | null) {
  if (Platform.OS === "web") {
    await AsyncStorage.multiRemove([
      refreshTokenKey(key),
      `${key}.token`,
      key,
    ]);
    return;
  }
  if (refreshToken) {
    await SecureStore.setItemAsync(
      refreshTokenKey(key),
      refreshToken,
      secureOptions,
    );
  } else {
    await SecureStore.deleteItemAsync(refreshTokenKey(key), secureOptions);
  }
  await SecureStore.deleteItemAsync(`${key}.token`, secureOptions);
}

async function loadRefreshToken(key: string) {
  if (Platform.OS === "web") return null;
  return SecureStore.getItemAsync(refreshTokenKey(key), secureOptions);
}

async function removeRefreshToken(key: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.multiRemove([refreshTokenKey(key), `${key}.token`]);
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(refreshTokenKey(key), secureOptions),
    SecureStore.deleteItemAsync(`${key}.token`, secureOptions),
  ]);
}

export async function saveSession<T>(
  key: string,
  refreshToken: string | null,
  data: T,
) {
  await saveRefreshToken(key, refreshToken);
  try {
    await AsyncStorage.setItem(profileKey(key), JSON.stringify(data));
    await AsyncStorage.removeItem(key);
  } catch (error) {
    await removeRefreshToken(key);
    throw error;
  }
}

export async function loadSession<T>(key: string): Promise<StoredSession<T> | null> {
  const [refreshToken, profile] = await Promise.all([
    loadRefreshToken(key),
    AsyncStorage.getItem(profileKey(key)),
  ]);

  if (profile) {
    return { refreshToken, data: JSON.parse(profile) as T };
  }

  // Retain only the non-sensitive profile from legacy sessions. Old access
  // tokens cannot be renewed and are deliberately discarded.
  const legacyRaw = await AsyncStorage.getItem(key);
  if (legacyRaw) {
    const legacy = JSON.parse(legacyRaw) as T & { token?: string };
    const { token: _legacyToken, ...data } = legacy;
    await saveSession(key, null, data as T);
    return { refreshToken: null, data: data as T };
  }

  return null;
}

export async function removeSession(key: string) {
  await Promise.all([
    removeRefreshToken(key),
    AsyncStorage.multiRemove([
      profileKey(key),
      key,
      refreshTokenKey(key),
      `${key}.token`,
    ]),
  ]);
}
