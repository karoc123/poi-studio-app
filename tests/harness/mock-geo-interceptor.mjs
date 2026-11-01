// tests/harness/mock-geo-interceptor.mjs
// Adversarial test helper: Intercepts upstream Photon & OSRM requests to test timeout and error resilience

const originalFetch = globalThis.fetch;

globalThis.fetch = async function (input, init) {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';

  const isTimeoutTrigger =
    urlStr.includes('simulate-timeout') ||
    urlStr.includes('lat=40.0001&lon=40.0001') ||
    urlStr.includes('40.0001,40.0001');

  const is500Trigger =
    urlStr.includes('simulate-500') ||
    urlStr.includes('lat=40.0002&lon=40.0002');

  const isConnErrorTrigger =
    urlStr.includes('simulate-conn-error') ||
    urlStr.includes('lat=40.0003&lon=40.0003');

  // 1. Simulate Hung Upstream (exceeds 4000ms timeout)
  if (isTimeoutTrigger) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(
          new Response(
            JSON.stringify({ type: 'FeatureCollection', features: [] }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }, 15000);

      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted due to timeout');
          err.name = 'TimeoutError';
          reject(err);
        });
      }
    });
  }

  // 2. Simulate Upstream 500 Server Error
  if (is500Trigger) {
    return new Response('Photon upstream internal server error', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // 3. Simulate Connection Failure (DNS / Network down)
  if (isConnErrorTrigger) {
    const err = new TypeError('fetch failed');
    err.cause = new Error('connect ECONNREFUSED 127.0.0.1:443');
    throw err;
  }

  // Normal request pass-through
  return originalFetch.call(this, input, init);
};
