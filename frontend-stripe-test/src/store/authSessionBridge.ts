type AuthSessionBridge = {
  getToken: () => string | null;
  getGeneration: () => number;
  getIsTransitioning: () => boolean;
  refreshToken: () => Promise<string | null>;
  expireSession: (message: string) => Promise<void>;
};

let bridge: AuthSessionBridge | null = null;
export type AuthSessionSnapshot = {
  token: string | null;
  owner: AuthSessionBridge | null;
  generation: number | null;
  isCurrent: () => boolean;
};
let refreshFlight: { session: AuthSessionSnapshot; promise: Promise<string | null> } | null = null;

export function registerAuthSessionBridge(nextBridge: AuthSessionBridge) {
  bridge = nextBridge;
}

export function getAuthToken() {
  return bridge?.getToken() ?? null;
}

export function captureAuthSession(): AuthSessionSnapshot {
  const owner = bridge;
  const generation = owner?.getGeneration() ?? null;
  const transitioning = owner?.getIsTransitioning() ?? false;
  return {
    owner,
    generation,
    token: owner?.getToken() ?? null,
    // Access-token rotation retains the generation. Logout or a new login
    // invalidates it, including a new login by the same user.
    isCurrent: () => Boolean(owner && !transitioning && !owner.getIsTransitioning() &&
      bridge === owner && owner.getGeneration() === generation && owner.getToken()),
  };
}

async function refreshWithBrowserLock(session: AuthSessionSnapshot) {
  const renew = () => session.isCurrent()
    ? session.owner!.refreshToken() : Promise.resolve(null);
  const locks = (globalThis as any)?.navigator?.locks;
  if (locks?.request) {
    return locks.request("newmersive-allwain-auth-refresh", renew);
  }
  return renew();
}

export function refreshAuthToken(session = captureAuthSession()) {
  if (!session.isCurrent()) return Promise.resolve(null);
  if (refreshFlight?.session.owner === session.owner && refreshFlight.session.generation === session.generation) {
    return refreshFlight.promise;
  }
  const flight = { session, promise: Promise.resolve(null) as Promise<string | null> };
  flight.promise = Promise.resolve(refreshWithBrowserLock(session)).then(token => session.isCurrent() ? token : null)
    .finally(() => { if (refreshFlight === flight) refreshFlight = null; });
  refreshFlight = flight;
  return flight.promise;
}

export async function expireAuthSession(message: string, session = captureAuthSession()) {
  if (session.isCurrent()) await session.owner!.expireSession(message);
}
