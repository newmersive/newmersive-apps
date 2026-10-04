(() => {
  if (window.location.pathname !== "/" && window.location.pathname !== "/index.html") return;

  const params = new URLSearchParams(window.location.search);
  const checkoutSession = params.get("session_id") || "";
  const paymentIntent = params.get("payment_intent") || "";
  const setupIntent = params.get("setup_intent") || "";
  const isStripeReturn =
    /^cs_(?:test|live)_/.test(checkoutSession) ||
    /^pi_/.test(paymentIntent) ||
    /^seti_/.test(setupIntent) ||
    params.has("redirect_status");

  if (!isStripeReturn) return;
  window.location.replace(`/web/${window.location.search}${window.location.hash}`);
})();
