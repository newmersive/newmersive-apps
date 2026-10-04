// Signals contain only a random epoch. Profiles and credentials are never sent.
export const AUTH_EPOCH_KEY = 'allwain:auth:epoch:v1';
export const AUTH_EPOCH_CHANNEL = 'allwain-auth-epoch-v1';
export const AUTH_PROFILE_LOCK = 'newmersive-allwain-auth-profile';

type Host = {
  read: () => string | null;
  write: (epoch: string) => void;
  random: () => string;
  post: (epoch: string) => void;
  listen: (wake: (epoch?: unknown) => void) => () => void;
  lock: <T>(work: () => Promise<T>) => Promise<T>;
};
const validEpoch = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(value);

export function createWebAuthCoordination(host: Host | null) {
  let epoch: string | null = null;
  let remoteRevision = 0;
  let listener: (() => void) | null = null;
  const seen = new Set<string>();
  function read() {
    try { return { available: Boolean(host), value: host?.read() ?? null }; }
    catch { return { available: false, value: null }; }
  }
  epoch = read().value;
  function remember(value: string) {
    seen.add(value);
    if (seen.size > 128) seen.delete(seen.values().next().value!);
  }
  if (epoch) remember(epoch);
  function accept(next: string | null) {
    if (next === epoch) return;
    epoch = next;
    if (next) remember(next);
    remoteRevision++;
    listener?.();
  }
  function reconcile(signal?: unknown) {
    const stored = read();
    // Storage is authoritative: a delayed channel message cannot roll back a
    // newer local identity. Missing/deleted storage also invalidates a peer.
    if (stored.available) accept(stored.value);
    else if (validEpoch(signal) && !seen.has(signal)) accept(signal);
  }
  const stop = host?.listen(reconcile);
  return {
    enabled: Boolean(host),
    reconcile,
    subscribe(callback: () => void) { listener = callback; return () => { if (listener === callback) listener = null; }; },
    announce(ownsIdentity: () => boolean = () => true) {
      if (!host) return true;
      reconcile();
      // Reconciliation may retire the caller's old identity. A stale logout
      // must not announce again and erase a newer peer's shared profile.
      if (!ownsIdentity()) return false;
      const next = host.random();
      // A channel alone cannot retire a suspended peer. Refuse a new cookie
      // identity when its durable marker cannot be saved, including quota
      // failures where reads and profile writes would otherwise still work.
      try { host.write(next); }
      catch { throw new Error('No se pudo coordinar la sesion entre pestanas. Comprueba el almacenamiento del navegador.'); }
      epoch = next; remember(epoch);
      try { host.post(epoch); } catch { /* Persisted epoch covers resume when available. */ }
      return true;
    },
    capture() {
      reconcile(); const captured = epoch;
      return () => { reconcile(); return captured === epoch; };
    },
    captureRemote() {
      reconcile(); const captured = remoteRevision;
      // Own logout/login operations retain FIFO order; only a remote change
      // retires a queued operation whose cookie belongs to another tab.
      return () => { reconcile(); return captured === remoteRevision; };
    },
    withProfileLock<T>(work: () => Promise<T>) { return host ? host.lock(work) : work(); },
    dispose() { stop?.(); listener = null; },
  };
}

function browserHost(): Host | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  let channel: BroadcastChannel | null = null;
  try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(AUTH_EPOCH_CHANNEL); } catch { /* Storage fallback. */ }
  return {
    read: () => window.localStorage.getItem(AUTH_EPOCH_KEY),
    write: epoch => window.localStorage.setItem(AUTH_EPOCH_KEY, epoch),
    random: () => {
      const bytes = new Uint8Array(24);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    },
    post: epoch => channel?.postMessage(epoch),
    listen: wake => {
      const storage = (event: StorageEvent) => { if (event.key === AUTH_EPOCH_KEY || event.key === null) wake(); };
      const message = (event: MessageEvent) => { if (validEpoch(event.data)) wake(event.data); };
      const resume = () => { if (document.visibilityState !== 'hidden') wake(); };
      window.addEventListener('storage', storage);
      window.addEventListener('focus', resume);
      window.addEventListener('pageshow', resume);
      document.addEventListener('visibilitychange', resume);
      channel?.addEventListener('message', message);
      return () => {
        window.removeEventListener('storage', storage); window.removeEventListener('focus', resume);
        window.removeEventListener('pageshow', resume); document.removeEventListener('visibilitychange', resume);
        channel?.removeEventListener('message', message); channel?.close();
      };
    },
    lock: work => {
      const locks = (globalThis as any)?.navigator?.locks;
      return locks?.request ? locks.request(AUTH_PROFILE_LOCK, work) : work();
    },
  };
}

export const webAuthCoordination = createWebAuthCoordination(browserHost());
