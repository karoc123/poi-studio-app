// tests/tier1-feature/trips.test.js
// Tier 1: Trip Lifecycle & Dashboard Feature Coverage Tests
// Authoritative source: ORIGINAL_REQUEST.md R1, docs/FEATURES.md §2, survey_specs.md §4.2

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv } = require('../harness/test-env.js');

describe('Tier 1: Trip Lifecycle & Dashboard Feature Coverage', () => {
  let env;
  let client;

  before(async () => {
    env = await setupTestEnv();
    client = env.client;
    await client.login('trip_master');
  });

  after(async () => {
    if (env && env.cleanup) {
      await env.cleanup();
    }
  });

  it('test_create_trip_sets_owner_and_invite_code', async () => {
    // R1.9: Create trip generates 10-char unique inviteCode and sets caller as OWNER
    const createRes = await client.createTrip({
      title: 'Dolomites Alpine Trek',
      description: 'Via Ferrata and mountain rifugios',
      startDate: '2026-08-10',
      endDate: '2026-08-18',
      currency: '€',
    });

    assert.equal(createRes.status, 201);
    const trip = createRes.data.trip;
    assert.equal(trip.title, 'Dolomites Alpine Trek');
    assert.equal(trip.currency, '€');
    assert.ok(trip.inviteCode, 'Expected inviteCode');
    assert.equal(trip.inviteCode.length, 10, 'Expected 10-character inviteCode');

    // Verify creator is OWNER
    const getRes = await client.getTrip(trip.id);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.data.trip.currentUserRole, 'OWNER');
    assert.equal(getRes.data.trip.members.length, 1);
    assert.equal(getRes.data.trip.members[0].role, 'OWNER');
  });

  it('test_dashboard_trip_overview_metrics', async () => {
    // R1.8: Dashboard displays trip cards with planned vs idea counts and member summary
    const tripRes = await client.createTrip({
      title: 'Kyoto Cultural Week',
      currency: '¥',
    });
    const tripId = tripRes.data.trip.id;

    // Add 1 scheduled POI and 1 idea POI
    await client.createPoi(tripId, {
      title: 'Fushimi Inari',
      lat: 34.9671,
      lng: 135.7727,
      dayStart: 1,
      estimatedCost: 0,
    });
    await client.createPoi(tripId, {
      title: 'Gion Tea Ceremony',
      lat: 35.0037,
      lng: 135.7772,
      dayStart: null, // Ideas Pool
      estimatedCost: 3500,
    });

    const dashRes = await client.getTrips();
    assert.equal(dashRes.status, 200);
    const kyoto = dashRes.data.trips.find((t) => t.id === tripId);
    assert.ok(kyoto, 'Expected Kyoto trip on dashboard');
    assert.equal(kyoto.plannedPoiCount, 1);
    assert.equal(kyoto.ideaPoiCount, 1);
    assert.equal(kyoto.totalEstimatedCost, 3500);
    assert.equal(kyoto.role, 'OWNER');
  });

  it('test_edit_trip_metadata', async () => {
    // R1.10: OWNER can edit trip metadata
    const tripRes = await client.createTrip({ title: 'Original Name' });
    const tripId = tripRes.data.trip.id;

    const editRes = await client.updateTrip(tripId, {
      title: 'Updated Roadtrip Name',
      description: 'New detailed itinerary',
      startDate: '2026-09-01',
      endDate: '2026-09-10',
      currency: '$',
    });
    assert.equal(editRes.status, 200);

    const getRes = await client.getTrip(tripId);
    assert.equal(getRes.data.trip.title, 'Updated Roadtrip Name');
    assert.equal(getRes.data.trip.currency, '$');
  });

  it('test_shared_scratchpad_markdown_persistence', async () => {
    // R1.13: Shared markdown notepad for group notes persists
    const tripRes = await client.createTrip({ title: 'Scratchpad Trip' });
    const tripId = tripRes.data.trip.id;

    const notesContent = '# Travel Info\n- Flight: BA 189\n- Wifi: HotelLobby123';
    const updateRes = await client.updateTrip(tripId, { scratchpad: notesContent });
    assert.equal(updateRes.status, 200);

    const getRes = await client.getTrip(tripId);
    assert.equal(getRes.data.trip.scratchpad, notesContent);
  });

  it('test_duplicate_trip_template_mode', async () => {
    // R1.11: Duplicate trip clones POIs and checklists, resetting status to PLANNED and clearing votes
    const tripRes = await client.createTrip({ title: 'Master Template' });
    const tripId = tripRes.data.trip.id;

    const poiRes = await client.createPoi(tripId, {
      title: 'Eiffel Tower',
      lat: 48.8584,
      lng: 2.2945,
      status: 'BOOKED',
      dayStart: 1,
    });
    await client.votePoi(tripId, poiRes.data.poi.id);

    await client.createChecklist(tripId, {
      title: 'Pack Camera',
      category: 'PACKING',
    });

    // Duplicate trip
    const dupRes = await client.duplicateTrip(tripId, { title: 'Paris Spring 2026' });
    assert.equal(dupRes.status, 201);
    const newTripId = dupRes.data.trip.id;

    const newTrip = await client.getTrip(newTripId);
    assert.equal(newTrip.data.trip.title, 'Paris Spring 2026');
    assert.equal(newTrip.data.trip.pois.length, 1);
    assert.equal(newTrip.data.trip.pois[0].status, 'PLANNED', 'Expected status to be reset to PLANNED');
    assert.equal(newTrip.data.trip.pois[0].voteCount, 0, 'Expected votes to be cleared on cloned trip');
    assert.equal(newTrip.data.trip.checklistItems.length, 1);
    assert.equal(newTrip.data.trip.checklistItems[0].isCompleted, false);
  });

  it('test_delete_trip_owner_cascades_children', async () => {
    // R1.12: Delete trip by OWNER permanently removes trip and cascades
    const tripRes = await client.createTrip({ title: 'Trip to be deleted' });
    const tripId = tripRes.data.trip.id;

    await client.createPoi(tripId, {
      title: 'Doomed POI',
      lat: 51.5074,
      lng: -0.1278,
    });

    const delRes = await client.deleteTrip(tripId);
    assert.equal(delRes.status, 200);

    const getRes = await client.getTrip(tripId);
    assert.equal(getRes.status, 403, 'Expected 403 or 404 when querying deleted trip');
  });
});
