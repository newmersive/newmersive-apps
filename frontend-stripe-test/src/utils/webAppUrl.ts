type BrowserLocation = {
  origin?: string;
  hostname?: string;
  pathname?: string;
};

const productionHosts = new Set(["allwain.es", "www.allwain.es"]);

export function allwainWebAppReturnUrl(location: BrowserLocation | null | undefined) {
  if (!location?.origin) return null;
  const onPublishedAppRoute = /^\/app(?:\/|$)/.test(location.pathname || "");
  const onProductionHost = productionHosts.has(location.hostname || "");
  return `${location.origin}${onPublishedAppRoute || onProductionHost ? "/app/" : "/"}`;
}
