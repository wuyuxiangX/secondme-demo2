// Proxy-aware fetch for Node.js
import { ProxyAgent, fetch as undiciFetch } from 'undici';

// Get proxy URL from environment variables
function getProxyUrl(): string | undefined {
  return (
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY ||
    process.env.all_proxy ||
    process.env.ALL_PROXY
  );
}

// Create a proxy-aware fetch function
export async function proxyFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<Response> {
  const proxyUrl = getProxyUrl();

  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);
    const response = await undiciFetch(url, {
      ...init,
      dispatcher,
    });
    return response as unknown as Response;
  }

  // No proxy configured, use native fetch
  return fetch(url, init);
}
