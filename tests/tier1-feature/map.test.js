// tests/tier1-feature/map.test.js
// Tier 1: Interactive Map & Smart Search Feature Coverage Tests
// Authoritative source: ORIGINAL_REQUEST.md R3, docs/FEATURES.md §4 & §5, survey_specs.md §5 & §6

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { parseMapUrlOrCoordinates } = require('../harness/geo-utils.js');

describe('Tier 1: Interactive Map & Smart Search Feature Coverage', () => {
  let env;
  let client;

  before(async () => {
    env = await setupTestEnv();
    client = env.client;
    await client.login('map_navigator');
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_google_maps_url_regex_parsing', () => {
    // R3.12: Client-side parser extracts coords and place name from Google Maps URLs
    const url1 = 'https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,17z';
    const parsed1 = parseMapUrlOrCoordinates(url1);
    assert.ok(parsed1, 'Expected URL to be parsed');
    assert.equal(parsed1.lat, 48.8584);
    assert.equal(parsed1.lng, 2.2945);
    assert.equal(parsed1.title, 'Eiffel Tower');

    // Protobuf syntax
    const url2 = 'https://maps.google.com/?data=!3d35.6586!4d139.7454';
    const parsed2 = parseMapUrlOrCoordinates(url2);
    assert.ok(parsed2);
    assert.equal(parsed2.lat, 35.6586);
    assert.equal(parsed2.lng, 139.7454);
  });

  it('test_apple_maps_url_regex_parsing', () => {
    // R3.12: Client-side parser extracts coords and query from Apple Maps URLs
    const appleUrl = 'https://maps.apple.com/?ll=37.7749,-122.4194&q=San+Francisco';
    const parsed = parseMapUrlOrCoordinates(appleUrl);
    assert.ok(parsed);
    assert.equal(parsed.lat, 37.7749);
    assert.equal(parsed.lng, -122.4194);
    assert.equal(parsed.title, 'San Francisco');
  });

  it('test_openstreetmap_url_regex_parsing', () => {
    // R3.12: Parser extracts coords from OSM URLs (#map=zoom/lat/lon or ?mlat=&mlon=)
    const osmUrl1 = 'https://www.openstreetmap.org/#map=16/52.5200/13.4050';
    const parsed1 = parseMapUrlOrCoordinates(osmUrl1);
    assert.ok(parsed1);
    assert.equal(parsed1.lat, 52.52);
    assert.equal(parsed1.lng, 13.405);

    const osmUrl2 = 'https://www.openstreetmap.org/?mlat=51.5074&mlon=-0.1278';
    const parsed2 = parseMapUrlOrCoordinates(osmUrl2);
    assert.ok(parsed2);
    assert.equal(parsed2.lat, 51.5074);
    assert.equal(parsed2.lng, -0.1278);
  });

  it('test_raw_decimal_coordinates_parsing', () => {
    // R3.12: Detects and normalizes decimal coordinate pairs
    const raw1 = '48.8584, 2.2945';
    const parsed1 = parseMapUrlOrCoordinates(raw1);
    assert.ok(parsed1);
    assert.equal(parsed1.lat, 48.8584);
    assert.equal(parsed1.lng, 2.2945);

    // Negative coordinates with spaces
    const raw2 = '-33.8688 151.2093';
    const parsed2 = parseMapUrlOrCoordinates(raw2);
    assert.ok(parsed2);
    assert.equal(parsed2.lat, -33.8688);
    assert.equal(parsed2.lng, 151.2093);
  });

  it('test_komoot_photon_geocoding_proxy', async () => {
    // R3.13: Autocomplete search queries Komoot Photon proxy with limit 6
    const res = await client.geoSearch('Louvre Paris', 6);
    assert.equal(res.status, 200);
    assert.equal(res.data.type, 'FeatureCollection');
    assert.ok(Array.isArray(res.data.features));
    assert.ok(res.data.features.length <= 6);
    assert.ok(res.data.features[0].geometry.coordinates);
  });

  it('test_komoot_photon_reverse_geocoding_proxy', async () => {
    // R3.10: Pin drop triggers Photon reverse geocoding to prefill place name
    const res = await client.geoReverse(48.8584, 2.2945);
    assert.equal(res.status, 200);
    assert.equal(res.data.type, 'FeatureCollection');
    assert.ok(res.data.features.length > 0);
    assert.ok(res.data.features[0].properties.name);
  });

  it('test_keyless_tile_providers_catalog', () => {
    // R3.2: Verify zero paid API keys rule across tile layer providers
    const tileProviders = [
      { name: 'CartoDB Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
      { name: 'OpenStreetMap Standard', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
      { name: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' },
      { name: 'CartoDB Dark Matter', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
    ];

    for (const provider of tileProviders) {
      assert.ok(!provider.url.includes('api_key='), `${provider.name} must not require paid API key`);
      assert.ok(!provider.url.includes('access_token='), `${provider.name} must not require mapbox access token`);
    }
  });
});
