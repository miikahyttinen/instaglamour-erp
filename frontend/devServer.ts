/**
 * Dev server settings for `vite.config.ts`, read from environment variables
 * (shell or `.env*` files). Unset or empty values fall back to the defaults.
 */
export const DEFAULT_API_PROXY_TARGET = 'http://localhost:3000';
export const DEFAULT_PORT = 5173;

export interface DevServerSettings {
  port: number;
  apiProxyTarget: string;
}

export function resolveDevServerSettings(
  env: Record<string, string | undefined>,
): DevServerSettings {
  const target = env.VITE_API_PROXY_TARGET?.trim();
  const portText = env.VITE_PORT?.trim();

  let port = DEFAULT_PORT;
  if (portText) {
    port = Number(portText);
    if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
      throw new Error(`VITE_PORT must be a port number (1-65535), got "${portText}"`);
    }
  }

  return { port, apiProxyTarget: target || DEFAULT_API_PROXY_TARGET };
}
