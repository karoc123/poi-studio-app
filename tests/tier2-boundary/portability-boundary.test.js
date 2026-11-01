// tests/tier2-boundary/portability-boundary.test.js
// Tier 2: Portability & Export Boundary & Corner Cases Tests
// Authoritative source: ORIGINAL_REQUEST.md R5, survey_features.md §6 Edge Cases 40-43

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');
const { escapeXml } = require('../harness/geo-utils.js');

describe('Tier 2: Portability & Export Boundary & Corner Cases', () => {
  let env;
  let client;
  let tripId;

  before(async () => {
    env = await setupTestEnv();
    client = env.client;
    await client.login('portability_bound_user');

    const tripRes = await client.createTrip({
      title: 'Boundary Portability Trip & Tour',
      currency: '€',
    });
    tripId = tripRes.data.trip.id;
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_corrupt_or_malformed_json_import_rejected_400', async () => {
    // Edge Case 40: Uploaded JSON missing required trip schema rejected with 400 Bad Request
    const emptyJsonRes = await client.importJson({});
    assert.equal(emptyJsonRes.status, 400);

    const corruptRes = await client.importJson({ version: 1, notATrip: true });
    assert.equal(corruptRes.status, 400);
  });

  it('test_json_import_generates_fresh_ids_avoiding_collision', async () => {
    // Edge Case 40: Re-importing backup generates fresh local IDs without collisions
    const poiRes = await client.createPoi(tripId, {
      title: 'Original Landmark',
      lat: 52.52,
      lng: 13.405,
    });
    const originalPoiId = poiRes.data.poi.id;

    const backupRes = await client.exportJson(tripId);
    const backupData = backupRes.data;

    // Import once
    const import1 = await client.importJson(backupData);
    assert.equal(import1.status, 201);
    const tripId1 = import1.data.tripId;

    // Import second time
    const import2 = await client.importJson(backupData);
    assert.equal(import2.status, 201);
    const tripId2 = import2.data.tripId;

    assert.notEqual(tripId1, tripId2, 'Two imports must produce two distinct trip IDs');

    const trip1Data = await client.getTrip(tripId1);
    const trip2Data = await client.getTrip(tripId2);

    assert.notEqual(
      trip1Data.data.trip.pois[0].id,
      originalPoiId,
      'Imported POI ID must be newly generated'
    );
    assert.notEqual(
      trip1Data.data.trip.pois[0].id,
      trip2Data.data.trip.pois[0].id,
      'Successive imports must have distinct POI IDs'
    );
  });

  it('test_gpx_export_escapes_xml_special_characters', async () => {
    // Edge Case 41: Special XML characters (&, <, >, ", ') must be escaped
    await client.createPoi(tripId, {
      title: 'Tom & Jerry\'s <Special> "Bakery"',
      notes: 'Delicious croissants & "fresh" bread',
      lat: 48.85,
      lng: 2.35,
    });

    const gpxRes = await client.exportGpx(tripId);
    assert.equal(gpxRes.status, 200);
    const gpx = gpxRes.data;

    assert.ok(gpx.includes('Tom &amp; Jerry&apos;s &lt;Special&gt; &quot;Bakery&quot;'));
    assert.ok(!gpx.includes('<name>Tom & Jerry'), 'Raw unescaped ampersand must not exist in XML');
  });

  it('test_ical_export_without_trip_start_date', async () => {
    // Edge Case 42: Trip with no startDate exported to iCal handles absence without error
    const undatedTrip = await client.createTrip({
      title: 'Undated Trip Without Start Date',
      startDate: null,
      endDate: null,
    });
    const undatedTripId = undatedTrip.data.trip.id;

    await client.createPoi(undatedTripId, {
      title: 'Someday Spot',
      lat: 40.71,
      lng: -74.0,
      dayStart: 1,
    });

    const icsRes = await client.exportIcs(undatedTripId);
    assert.equal(icsRes.status, 200);
    assert.ok(icsRes.data.includes('BEGIN:VCALENDAR'));
    assert.ok(icsRes.data.includes('END:VCALENDAR'));
  });

  it('test_print_booklet_media_print_styling_guardrail', async () => {
    // Edge Case 43: Print route includes ink-friendly styling hiding nav clutter
    const printRes = await client.getPrintBooklet(tripId);
    assert.equal(printRes.status, 200);
    const html = printRes.data;

    assert.ok(html.includes('.no-print'));
    assert.ok(html.includes('page-break'));
  });
});
