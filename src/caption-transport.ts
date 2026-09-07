// Native WebSocket adds an Origin by default while native fetch does not. Use one
// explicit identity for both legs so origin-bound session tickets remain valid.
export const nativeCaptionOrigin = 'humahang://native';
type SocketConstructor = new (url: string, protocols: string[], options?: { headers: Record<string, string> }) => WebSocket;

export function createCaptionTransport(native: boolean, request: typeof fetch = fetch, Socket: SocketConstructor = WebSocket) {
  const fetcher: typeof fetch = native ? (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Origin', nativeCaptionOrigin);
    return request(input, { ...init, headers });
  } : request;
  return {
    fetcher,
    createSocket: (url: string, protocols: string[]) => native
      ? new Socket(url, protocols, { headers: { Origin: nativeCaptionOrigin } })
      : new Socket(url, protocols),
  };
}
