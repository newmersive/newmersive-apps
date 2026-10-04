(() => {
  const target = document.querySelector('meta[name="allwain-app-route"]')?.getAttribute("content") || "";
  if (!/^\/web(?:\/[a-z-]+)*\/$/.test(target)) return;
  window.location.replace(`${target}${window.location.search}${window.location.hash}`);
})();
