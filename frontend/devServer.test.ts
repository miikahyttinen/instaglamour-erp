import { describe, expect, it } from 'vitest';
import { resolveDevServerSettings } from './devServer';

describe('resolveDevServerSettings', () => {
  it('uses the defaults when nothing is set', () => {
    expect(resolveDevServerSettings({})).toEqual({
      port: 5173,
      apiProxyTarget: 'http://localhost:3000',
    });
  });

  it('treats empty values as unset', () => {
    expect(resolveDevServerSettings({ VITE_PORT: ' ', VITE_API_PROXY_TARGET: '' })).toEqual({
      port: 5173,
      apiProxyTarget: 'http://localhost:3000',
    });
  });

  it('reads the port and proxy target from the environment', () => {
    expect(
      resolveDevServerSettings({
        VITE_PORT: '5273',
        VITE_API_PROXY_TARGET: 'http://localhost:3100',
      }),
    ).toEqual({ port: 5273, apiProxyTarget: 'http://localhost:3100' });
  });

  it.each(['abc', '0', '70000', '51.5', '-1'])('rejects an invalid port "%s"', (value) => {
    expect(() => resolveDevServerSettings({ VITE_PORT: value })).toThrow(/VITE_PORT/);
  });
});
