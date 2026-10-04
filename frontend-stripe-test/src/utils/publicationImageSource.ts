import type { ImageSourcePropType, ImageURISource } from "react-native";

type PublicationImageInput = {
  apiBaseUrl: string;
  imageUrl?: string | null;
  source?: ImageSourcePropType | null;
  token?: string | null;
};

const uploadName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png)$/i;
const credentialHeader = /^(?:authorization|proxy-authorization|cookie|cookie2)$/i;
const ambiguousUrl = /[\\\u0000-\u0020\u007f]|%(?:2e|2f|5c)|(?:^|\/)\.{1,2}(?:\/|$)/i;

function apiUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || ambiguousUrl.test(value)) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
    return url;
  } catch { return null; }
}

function imageTarget(uri: string | undefined, api: URL | null) {
  if (!uri) return { uri, protectedUpload: false };
  // Expo web bundles live on the app's origin, not on the API host.
  if (uri.startsWith("/assets/") && !ambiguousUrl.test(uri)) return { uri, protectedUpload: false };
  try {
    const url = api ? new URL(uri, api) : new URL(uri);
    const prefix = api ? `${api.pathname}allwain/media/uploads/` : "";
    const protectedUpload = Boolean(api && !ambiguousUrl.test(uri) && !url.username && !url.password &&
      url.origin === api.origin && url.pathname.startsWith(prefix) && uploadName.test(url.pathname.slice(prefix.length)));
    return { uri: /^https?:$/.test(url.protocol) ? url.toString() : uri, protectedUpload };
  } catch { return { uri, protectedUpload: false }; }
}

/** Pure source construction: app credentials belong only to the configured API's exact private image route. */
export function resolvePublicationImageSource(input: PublicationImageInput): ImageSourcePropType | null {
  const source = input.source ?? (input.imageUrl ? { uri: input.imageUrl } : null);
  if (source === null || typeof source === "number") return source;
  const api = apiUrl(input.apiBaseUrl);
  const sources: ImageURISource[] = Array.isArray(source) ? source : [source as ImageURISource];
  const targets = sources.map(item => imageTarget(item.uri, api));
  // Android uses the first source's headers for all resolution candidates.
  const canAuthenticate = targets.length > 0 && targets.every(target => target.protectedUpload);
  const resolved = sources.map((item, index) => {
    const { headers: previousHeaders, ...rest } = item;
    const headers = Object.fromEntries(Object.entries(previousHeaders || {}).filter(([name]) => !credentialHeader.test(name)));
    const target = targets[index];
    if (canAuthenticate && input.token && (!item.method || item.method.toUpperCase() === "GET")) headers.Authorization = `Bearer ${input.token}`;
    return { ...rest, uri: target.uri,
      ...(target.protectedUpload ? { cache: "reload" as const } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    };
  });
  return Array.isArray(source) ? resolved : resolved[0];
}
