import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

/**
 * 1. Users Table
 * Supports frictionless auth (username + optional password hash)
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash'),
  avatarColor: text('avatar_color').notNull().default('#6366F1'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * 2. Trips Table
 * Central trip entity with metadata, dates, invite code, scratchpad
 */
export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  currency: text('currency').notNull().default('€'),
  inviteCode: text('invite_code').notNull().unique(),
  scratchpad: text('scratchpad'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * 3. Trip Members Table
 * Relational join between users and trips with RBAC roles
 */
export const tripMembers = sqliteTable(
  'trip_members',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('EDITOR'), // 'OWNER' | 'EDITOR' | 'VIEWER'
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => [
    uniqueIndex('trip_members_trip_user_idx').on(table.tripId, table.userId),
  ]
);

/**
 * 4. POIs Table
 * Points of interest with category, status, coordinates, scheduling, costs
 */
export const pois = sqliteTable('pois', {
  id: text('id').primaryKey(),
  tripId: text('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category').notNull().default('OTHER'), // ACCOMMODATION, FOOD, SIGHTSEEING, NATURE, ACTIVITY, TRANSPORT, NIGHTLIFE, OTHER
  status: text('status').notNull().default('IDEA'), // IDEA, PLANNED, BOOKED
  isMustSee: integer('is_must_see', { mode: 'boolean' }).notNull().default(false),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  address: text('address'),
  dayStart: integer('day_start'), // null = Ideas Pool; 1..N = Day number
  dayEnd: integer('day_end'), // Multi-day accommodation stay
  orderIndex: integer('order_index').notNull().default(0),
  timeSlot: text('time_slot'),
  durationMinutes: integer('duration_minutes'),
  transportMode: text('transport_mode').notNull().default('DRIVING'), // DRIVING, WALKING, CYCLING, TRANSIT
  estimatedCost: real('estimated_cost').notNull().default(0),
  costType: text('cost_type').notNull().default('TOTAL'), // TOTAL, PER_PERSON
  paidByUserId: text('paid_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  bookingReference: text('booking_reference'),
  externalUrl: text('external_url'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * 5. POI Votes Table
 * Collaborative upvoting per POI per user
 */
export const poiVotes = sqliteTable(
  'poi_votes',
  {
    id: text('id').primaryKey(),
    poiId: text('poi_id')
      .notNull()
      .references(() => pois.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('poi_votes_poi_user_idx').on(table.poiId, table.userId),
  ]
);

/**
 * 6. POI Comments Table
 * Discussion threads per POI
 */
export const poiComments = sqliteTable('poi_comments', {
  id: text('id').primaryKey(),
  poiId: text('poi_id')
    .notNull()
    .references(() => pois.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * 7. Checklist Items Table
 * Shared checklists categorized by BEFORE_TRIP, PACKING, DOCUMENTS
 */
export const checklistItems = sqliteTable('checklist_items', {
  id: text('id').primaryKey(),
  tripId: text('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category').notNull().default('BEFORE_TRIP'), // BEFORE_TRIP, PACKING, DOCUMENTS
  isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
  assignedToUserId: text('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
});

// --- Relations Definitions ---

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(tripMembers),
  paidPois: many(pois),
  votes: many(poiVotes),
  comments: many(poiComments),
  assignedChecklistItems: many(checklistItems),
}));

export const tripsRelations = relations(trips, ({ many }) => ({
  members: many(tripMembers),
  pois: many(pois),
  checklistItems: many(checklistItems),
}));

export const tripMembersRelations = relations(tripMembers, ({ one }) => ({
  trip: one(trips, {
    fields: [tripMembers.tripId],
    references: [trips.id],
  }),
  user: one(users, {
    fields: [tripMembers.userId],
    references: [users.id],
  }),
}));

export const poisRelations = relations(pois, ({ one, many }) => ({
  trip: one(trips, {
    fields: [pois.tripId],
    references: [trips.id],
  }),
  paidBy: one(users, {
    fields: [pois.paidByUserId],
    references: [users.id],
  }),
  votes: many(poiVotes),
  comments: many(poiComments),
}));

export const poiVotesRelations = relations(poiVotes, ({ one }) => ({
  poi: one(pois, {
    fields: [poiVotes.poiId],
    references: [pois.id],
  }),
  user: one(users, {
    fields: [poiVotes.userId],
    references: [users.id],
  }),
}));

export const poiCommentsRelations = relations(poiComments, ({ one }) => ({
  poi: one(pois, {
    fields: [poiComments.poiId],
    references: [pois.id],
  }),
  user: one(users, {
    fields: [poiComments.userId],
    references: [users.id],
  }),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  trip: one(trips, {
    fields: [checklistItems.tripId],
    references: [trips.id],
  }),
  assignedTo: one(users, {
    fields: [checklistItems.assignedToUserId],
    references: [users.id],
  }),
}));
