const listeners = new Set<() => void>();
export function requireAdminMfa() { for (const listener of listeners) listener(); }
export function subscribeAdminMfa(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
