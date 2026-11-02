/** Test-process egress guard: only its own loopback HTTP API is permitted. */
export function harnessFetch(delegate: typeof fetch, apiPort: number): typeof fetch {
  return (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let url: URL;
    try { url = new URL(raw); } catch { return Promise.reject(new Error('Test network blocked')); }
    if (url.origin !== `http://127.0.0.1:${apiPort}` || url.username || url.password) {
      return Promise.reject(new Error('Test network blocked'));
    }
    return delegate(input, { ...init, redirect: 'error' });
  };
}
