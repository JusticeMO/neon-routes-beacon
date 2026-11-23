/** Registers public/sw.js in production builds and asks it to keep the app and map pack offline. */
import { loadManifest, PACK_BASE } from './pack';

export function registerOfflineSupport(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      const manifest = await loadManifest().catch(() => null);
      const loaded = performance.getEntriesByType('resource')
        .map(e => (e as PerformanceResourceTiming).name)
        .filter(u => u.startsWith(location.origin) && new URL(u).pathname.startsWith('/assets/'));
      const pack = manifest ? Object.keys(manifest.files).map(f => `${PACK_BASE}${f}?v=${manifest.version}`) : [];
      reg.active?.postMessage({ type: 'warm', urls: ['/index.html', `${PACK_BASE}manifest.json`, ...loaded, ...pack], packVersion: manifest?.version });
    } catch (e) {
      console.warn('Offline support unavailable', e);
    }
  });
}
