// tests/tier1-feature/portability.test.js
// Tier 1: Portability, Offline Exports & Print Booklet Feature Coverage Tests
// Authoritative source: ORIGINAL_REQUEST.md R5, docs/FEATURES.md §10, survey_specs.md §4.8 & §8

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');

describe('Tier 1: Portability, Offline Exports & Print Booklet Feature Coverage', () => {
  let env;
  let client;
  let tripId;

  before(async () => {
    env = await setupTestEnv();
    client = env.client;
    await client.login('export_master');

    const tripRes = await client.createTrip({
      title: 'Iceland South Coast',
      description: 'Waterfalls and black sand beaches',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      currency: '€',
      scratchpad: 'Emergency: 112\nCar: Duster 4x4',
    });
    tripId = tripRes.data.trip.id;

    // Add POIs
    await client.createPoi(tripId, {
      title: 'Seljalandsfoss Waterfall',
      category: 'NATURE',
      status: 'BOOKED',
      isMustSee: true,
      lat: 63.6156,
      lng: -19.9886,
      address: 'Route 1, South Iceland',
      dayStart: 1,
      orderIndex: 0,
      notes: 'Bring waterproof jacket',
    });

    await client.createPoi(tripId, {
      title: 'Skogafoss',
      category: 'NATURE',
      status: 'PLANNED',
      lat: 63.532,
      lng: -19.5114,
      dayStart: 1,
      orderIndex: 1,
    });

    await client.createChecklist(tripId, {
      title: 'Waterproof hiking pants',
      category: 'PACKING',
    });
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_full_json_backup_export', async () => {
    // R5.1: Export complete trip tree as JSON file
    const res = await client.exportJson(tripId);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));

    const data = res.data;
    assert.equal(data.version, 1);
    assert.equal(data.trip.title, 'Iceland South Coast');
    assert.ok(data.trip.scratchpad.includes('Emergency: 112'));
    assert.equal(data.pois.length, 2);
    assert.equal(data.pois[0].title, 'Seljalandsfoss Waterfall');
    assert.equal(data.checklists.length, 1);
    assert.equal(data.checklists[0].title, 'Waterproof hiking pants');
  });

  it('test_full_json_backup_import', async () => {
    // R5.1: Import JSON backup restores full trip as new trip with current user as OWNER
    const exportRes = await client.exportJson(tripId);
    const backupData = exportRes.data;

    const importerClient = client.fork();
    await importerClient.login('new_importer');

    const importRes = await importerClient.importJson(backupData);
    assert.equal(importRes.status, 201);
    const importedTripId = importRes.data.tripId;
    assert.ok(importedTripId);
    assert.notEqual(importedTripId, tripId, 'Import must generate a new unique tripId');

    // Verify imported trip contents
    const tripRes = await importerClient.getTrip(importedTripId);
    assert.equal(tripRes.status, 200);
    assert.equal(tripRes.data.trip.title, 'Iceland South Coast');
    assert.equal(tripRes.data.trip.currentUserRole, 'OWNER');
    assert.equal(tripRes.data.trip.pois.length, 2);
    assert.equal(tripRes.data.trip.checklistItems.length, 1);
  });

  it('test_gpx_1_1_export_format', async () => {
    // R5.2: GPX export produces valid GPX 1.1 format with <wpt> waypoints and <trk> tracks
    const res = await client.exportGpx(tripId);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/gpx+xml'));

    const gpxText = res.data;
    assert.ok(gpxText.includes('<gpx version="1.1"'));
    assert.ok(gpxText.includes('<name>Iceland South Coast</name>'));
    assert.ok(gpxText.includes('<wpt lat="63.6156" lon="-19.9886">'));
    assert.ok(gpxText.includes('<name>Seljalandsfoss Waterfall</name>'));
    assert.ok(gpxText.includes('<trk>'));
    assert.ok(gpxText.includes('</gpx>'));
  });

  it('test_geojson_featurecollection_export', async () => {
    // R5.3: GeoJSON export outputs valid FeatureCollection
    const res = await client.exportGeoJson(tripId);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/geo+json'));

    const geojson = JSON.parse(res.data);
    assert.equal(geojson.type, 'FeatureCollection');
    assert.ok(Array.isArray(geojson.features));
    assert.equal(geojson.features.length, 2);
    assert.equal(geojson.features[0].geometry.type, 'Point');
    assert.deepEqual(geojson.features[0].geometry.coordinates, [-19.9886, 63.6156]); // [lon, lat]
    assert.equal(geojson.features[0].properties.title, 'Seljalandsfoss Waterfall');
  });

  it('test_ical_rfc_5545_calendar_export', async () => {
    // R5.4: iCal (.ics) export generates valid calendar events
    const res = await client.exportIcs(tripId);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/calendar'));

    const icsText = res.data;
    assert.ok(icsText.includes('BEGIN:VCALENDAR'));
    assert.ok(icsText.includes('VERSION:2.0'));
    assert.ok(icsText.includes('BEGIN:VEVENT'));
    assert.ok(icsText.includes('SUMMARY:Seljalandsfoss Waterfall'));
    assert.ok(icsText.includes('GEO:63.6156;-19.9886'));
    assert.ok(icsText.includes('END:VCALENDAR'));
  });

  it('test_printable_travel_booklet_view', async () => {
    // R5.5: Clean printable booklet renders at /trips/[tripId]/print
    const res = await client.getPrintBooklet(tripId);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));

    const html = res.data;
    assert.ok(html.includes('Iceland South Coast'));
    assert.ok(html.includes('Seljalandsfoss Waterfall'));
    assert.ok(html.includes('Waterproof hiking pants'));
    assert.ok(html.includes('.no-print'));
  });
});
