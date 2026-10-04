export type StoredSession<T> = {
  refreshToken: null;
  data: T;
};

function profileKey(key: string) {
  return `${key}.profile`;
}

export async function saveSession<T>(
  key: string,
  _refreshToken: string | null,
  data: T,
) {
  // Browser refresh credentials live only in the API's HttpOnly cookie.
  // Keep the complete browser write synchronous. The owning auth generation
  // and shared profile lock are checked immediately before this operation.
  window.localStorage.setItem(profileKey(key), JSON.stringify(data));
  [
    key,
    `${key}.token`,
    `${key}.refresh`,
  ].forEach(item => window.localStorage.removeItem(item));
}

export async function loadSession<T>(key: string): Promise<StoredSession<T> | null> {
  const profile = window.localStorage.getItem(profileKey(key));
  if (profile) {
    return { refreshToken: null, data: JSON.parse(profile) as T };
  }

  // Migrate only the non-sensitive profile and erase legacy browser tokens.
  const legacyRaw = window.localStorage.getItem(key);
  if (!legacyRaw) return null;
  const legacy = JSON.parse(legacyRaw) as
    | { token?: unknown; refreshToken?: unknown; data?: T }
    | (T & { token?: unknown; refreshToken?: unknown });
  const data =
    "data" in legacy && legacy.data
      ? legacy.data
      : (({ token: _token, refreshToken: _refreshToken, ...rest }) => rest)(
          legacy as T & { token?: unknown; refreshToken?: unknown },
        ) as T;
  await saveSession(key, null, data);
  return { refreshToken: null, data };
}

export async function removeSession(key: string) {
  [
    profileKey(key),
    key,
    `${key}.token`,
    `${key}.refresh`,
  ].forEach(item => window.localStorage.removeItem(item));
}
