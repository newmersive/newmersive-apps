(() => {
  const entry = document.querySelector('.brand-entry');
  if (!entry) return;
  const started = performance.now();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = sessionStorage.getItem('allwain-brand-entry') === '1'; } catch {}
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ready = document.readyState === 'loading'
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    : Promise.resolve();
  async function reveal() {
    await ready;
    const hero = document.querySelector('#inicio img');
    await Promise.race([
      Promise.allSettled([document.fonts?.ready, hero?.decode?.()]),
      pause(1400),
    ]);
    await pause(Math.max(0, (reduced || seen ? 0 : 650) - (performance.now() - started)));
    entry.classList.add('brand-entry--done');
    try { sessionStorage.setItem('allwain-brand-entry', '1'); } catch {}
    setTimeout(() => entry.remove(), reduced ? 0 : 460);
  }
  void reveal();
})();
