// Shared public URL state — set by ngrok tunnel at startup, used by EB routes
let _publicBaseUrl: string | null = null;

export function setPublicBaseUrl(url: string) {
  _publicBaseUrl = url;
}

export function getPublicBaseUrl(): string {
  return _publicBaseUrl || `http://localhost:${process.env.PORT || 36321}`;
}

export function isHttpsReady(): boolean {
  const url = getPublicBaseUrl();
  return url.startsWith('https://') && !url.includes('localhost');
}
