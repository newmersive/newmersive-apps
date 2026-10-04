/** Every status read and verification shares one lifecycle and response order. */
export function createAdminMfaRequestGuard() {
  let revision = 0;
  let active = false;
  return {
    activate() { active = true; return ++revision; },
    dispose() { active = false; ++revision; },
    begin() { return ++revision; },
    invalidate() { return ++revision; },
    current() { return revision; },
    isCurrent(ticket: number) { return active && ticket === revision; },
  };
}
