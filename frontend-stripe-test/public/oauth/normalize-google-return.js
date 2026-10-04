// Nginx adds a trailing slash to directory routes. Restore the registered
// callback URL before Expo verifies it; retain OAuth state and response intact.
(() => {
  if (window.location.pathname === '/oauth/google/') {
    window.history.replaceState(window.history.state, '', '/oauth/google' + window.location.search + window.location.hash);
  }
})();
