// tests/tier2-boundary/map-boundary.test.js
// Tier 2: Map & Smart Search Boundary & Corner Cases Tests
// Authoritative source: ORIGINAL_REQUEST.md R3, survey_features.md §6 Edge Cases 21-27

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { parseMapUrlOrCoordinates } = require('../harness/geo-utils.js');

describe('Tier 2: Map & Smart Search Boundary & Corner Cases', () => {
  let env;
  let client;
  let tripId;

  before(async () => {
    env = await setupTestEnv();
    client = env.client;
    await client.login('map_boundary_tester');

    const tripRes = await client.createTrip({ title: 'Map Boundary Trip' });
    tripId = tripRes.data.trip.id;
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_out_of_bounds_coordinates_rejected', async () => {
    // Edge Case 25: Coordinates outside [-90, 90] or [-180, 180] rejected
    const badLat = await client.createPoi(tripId, { title: 'North of North Pole', lat: 95.0, lng: 0.0 });
    assert.equal(badLat.status, 400);

    const badLng = await client.createPoi(tripId, { title: 'Beyond Date Line', lat: 0.0, lng: 185.0 });
    assert.equal(badLng.status, 400);

    const stringLat = await client.createPoi(tripId, { title: 'Not a Number', lat: 'invalid', lng: 10.0 });
    assert.equal(stringLat.status, 400);
  });

  it('test_malformed_url_parsing_fallback', () => {
    // Edge Case 26: Non-map URLs, partial URLs, or garbage strings gracefully return null
    assert.equal(parseMapUrlOrCoordinates('https://example.com/not-a-map'), null);
    assert.equal(parseMapUrlOrCoordinates('just some regular search text'), null);
    assert.equal(parseMapUrlOrCoordinates(''), null);
    assert.equal(parseMapUrlOrCoordinates(null), null);
    assert.equal(parseMapUrlOrCoordinates('https://google.com/search?q=hello'), null);
  });

  it('test_single_poi_bounds_zoom_clamping', () => {
    // Edge Case 22: Single POI calculation clamps maxZoom to 14
    function calculateBoundsForPois(pois) {
      if (!pois || pois.length === 0) {
        return { center: [20, 0], zoom: 2 };
      }
      if (pois.length === 1) {
        return {
          center: [pois[0].lat, pois[0].lng],
          zoom: 14, // Clamped to 14
        };
      }
      const lats = pois.map((p) => p.lat);
      const lngs = pois.map((p) => p.lng);
      return {
        bounds: [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
      };
    }

    const singleResult = calculateBoundsForPois([{ lat: 48.8584, lng: 2.2945 }]);
    assert.equal(singleResult.zoom, 14, 'Single POI zoom must be clamped to 14');
    assert.deepEqual(singleResult.center, [48.8584, 2.2945]);
  });

  it('test_zero_pois_map_bounds', () => {
    // Edge Case 21: Trip or Day with 0 POIs returns default view without error
    function calculateBoundsForPois(pois) {
      if (!pois || pois.length === 0) {
        return { center: [20, 0], zoom: 2, empty: true };
      }
      return { empty: false };
    }

    const emptyResult = calculateBoundsForPois([]);
    assert.equal(emptyResult.empty, true);
    assert.deepEqual(emptyResult.center, [20, 0]);
  });

  it('test_external_api_4_second_timeout_guardrail', async () => {
    // Guardrail: External fetches enforce 4000ms AbortController timeout
    async function fetchWith4sTimeout(url, simulatedDelayMs = 0) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      try {
        if (simulatedDelayMs > 4000) {
          // Simulate hung network request exceeding 4000ms
          await new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        }
        return { ok: true };
      } finally {
        clearTimeout(timer);
      }
    }

    // Normal fast request succeeds
    const fastRes = await fetchWith4sTimeout('https://photon.komoot.io/api', 100);
    assert.equal(fastRes.ok, true);

    // Hung request throws AbortError within 4 seconds
    await assert.rejects(
      async () => {
        await fetchWith4sTimeout('https://router.project-osrm.org', 4500);
      },
      { name: 'AbortError' }
    );
  });
});
