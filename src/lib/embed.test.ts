import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Sakafind shows Beacon in a frame and waits for this signal; without it the tenant
 * sees "Map didn't load" even though Beacon started. And a signal sent when Beacon is
 * opened on its own would go to nobody, so it must only fire inside a frame.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// Tests run without a browser: a stand-in window whose top is itself, or a parent frame.
const loadInFrame = async (framed: boolean) => {
  const parent = { postMessage: vi.fn() };
  const win: Record<string, unknown> = { parent };
  win.self = win;
  win.top = framed ? parent : win;
  vi.stubGlobal('window', win);
  const mod = await import('./embed');
  return { mod, parent };
};

describe('Beacon inside Sakafind', () => {
  it('tells the Sakafind page it is ready, addressed to Sakafind only', async () => {
    vi.stubEnv('VITE_SAKAFIND_URL', 'https://sakafind.com/');
    const { mod, parent } = await loadInFrame(true);
    expect(mod.isEmbedded()).toBe(true);
    mod.announceReady();
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'beacon:ready' }, 'https://sakafind.com');
  });

  it('says nothing when opened on its own', async () => {
    const { mod, parent } = await loadInFrame(false);
    expect(mod.isEmbedded()).toBe(false);
    mod.announceReady();
    expect(parent.postMessage).not.toHaveBeenCalled();
  });
});
