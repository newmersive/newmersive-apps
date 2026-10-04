import { Platform } from "react-native";
import {
  captureAuthSession,
  refreshAuthToken,
  type AuthSessionSnapshot,
} from "../store/authSessionBridge";

type DownloadInput = {
  url: string;
  token: string;
  filename: string;
  mimeType?: string;
};

function assertCurrentSession(session: AuthSessionSnapshot) {
  if (!session.isCurrent()) throw new Error("SESSION_CHANGED");
}

let nativeDownloadSequence = 0;

async function downloadOnWeb(input: DownloadInput, session: AuthSessionSnapshot) {
  const doc = (globalThis as any).document;
  const urlApi = (globalThis as any).URL;
  if (!doc?.body || !doc.createElement || !urlApi?.createObjectURL) {
    throw new Error("DOWNLOAD_UNAVAILABLE");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let objectUrl: string | null = null;
  let link: any = null;
  try {
    const run = (token: string) => {
      assertCurrentSession(session);
      return fetch(input.url, {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    };
    let response = await run(session.token!);
    assertCurrentSession(session);
    if (response.status === 401) {
      const nextToken = await refreshAuthToken(session);
      assertCurrentSession(session);
      if (nextToken) response = await run(nextToken);
    }
    assertCurrentSession(session);
    if (!response.ok) throw new Error(`DOWNLOAD_ERROR_${response.status}`);
    const blob = await response.blob();
    assertCurrentSession(session);
    objectUrl = urlApi.createObjectURL(blob);
    link = doc.createElement("a");
    link.href = objectUrl;
    link.download = input.filename;
    doc.body.appendChild(link);
    assertCurrentSession(session);
    link.click();
  } finally {
    clearTimeout(timeout);
    if (link?.parentNode) link.parentNode.removeChild(link);
    if (objectUrl !== null) urlApi.revokeObjectURL?.(objectUrl);
  }
}

async function downloadOnDevice(input: DownloadInput, session: AuthSessionSnapshot) {
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  assertCurrentSession(session);
  const available = await Sharing.isAvailableAsync();
  assertCurrentSession(session);
  if (!FileSystem.cacheDirectory || !available) {
    throw new Error("DOWNLOAD_UNAVAILABLE");
  }

  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^\.+$/, "download") || "download";
  // Separate attempts, including downloads with the same filename, so stale
  // cleanup can never remove the next identity's file.
  const directory = `${FileSystem.cacheDirectory}allwain-download-${Date.now()}-${++nativeDownloadSequence}/`;
  const destination = `${directory}${safeFilename}`;
  let sharingStarted = false;
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    assertCurrentSession(session);
    const run = (token: string) => {
      assertCurrentSession(session);
      return FileSystem.downloadAsync(input.url, destination, {
        headers: { Authorization: `Bearer ${token}` },
      });
    };
    let result = await run(session.token!);
    assertCurrentSession(session);
    if (result.status === 401) {
      const nextToken = await refreshAuthToken(session);
      assertCurrentSession(session);
      if (nextToken) result = await run(nextToken);
    }
    assertCurrentSession(session);
    if (result.status >= 400) throw new Error(`DOWNLOAD_ERROR_${result.status}`);
    if (result.uri !== destination) throw new Error("DOWNLOAD_UNAVAILABLE");
    sharingStarted = true;
    await Sharing.shareAsync(result.uri, {
      mimeType: input.mimeType || "application/pdf",
      dialogTitle: "Guardar o compartir documento",
    });
    assertCurrentSession(session);
  } finally {
    // Once handed to the platform, it may still be reading the cache file.
    // Preserve that existing behavior; before handoff, discard our own bytes.
    if (!sharingStarted) await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => undefined);
  }
}

export async function downloadAuthenticatedFile(input: DownloadInput) {
  const session = captureAuthSession();
  if (!session.token) throw new Error("SESSION_EXPIRED");
  assertCurrentSession(session);
  if (input.token !== session.token) throw new Error("SESSION_CHANGED");
  if (Platform.OS === "web") return downloadOnWeb(input, session);
  return downloadOnDevice(input, session);
}
