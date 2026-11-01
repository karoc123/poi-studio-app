import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  users,
  trips,
  tripMembers,
  pois,
  poiVotes,
  poiComments,
  checklistItems,
} from '@/lib/db/schema';

// Database Entity Types
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Trip = InferSelectModel<typeof trips>;
export type NewTrip = InferInsertModel<typeof trips>;

export type TripMember = InferSelectModel<typeof tripMembers>;
export type NewTripMember = InferInsertModel<typeof tripMembers>;

export type Poi = InferSelectModel<typeof pois>;
export type NewPoi = InferInsertModel<typeof pois>;

export type PoiVote = InferSelectModel<typeof poiVotes>;
export type NewPoiVote = InferInsertModel<typeof poiVotes>;

export type PoiComment = InferSelectModel<typeof poiComments>;
export type NewPoiComment = InferInsertModel<typeof poiComments>;

export type ChecklistItem = InferSelectModel<typeof checklistItems>;
export type NewChecklistItem = InferInsertModel<typeof checklistItems>;

// Domain Enums and Literal Types
export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';

export type PoiCategory =
  | 'ACCOMMODATION'
  | 'FOOD'
  | 'SIGHTSEEING'
  | 'NATURE'
  | 'ACTIVITY'
  | 'TRANSPORT'
  | 'NIGHTLIFE'
  | 'OTHER';

export type PoiStatus = 'IDEA' | 'PLANNED' | 'BOOKED';

export type TransportMode = 'DRIVING' | 'WALKING' | 'CYCLING' | 'TRANSIT';

export type CostType = 'TOTAL' | 'PER_PERSON';

export type ChecklistCategory = 'BEFORE_TRIP' | 'PACKING' | 'DOCUMENTS';

// User & Auth Context Types
export type SafeUser = Omit<User, 'passwordHash'>;

export interface SessionUser {
  id: string;
  username: string;
  avatarColor: string;
}

export interface JWTPayloadData {
  sub: string;
  username: string;
  avatarColor: string;
  iat?: number;
  exp?: number;
}

// Composed & Populated Models
export interface MemberWithUser extends TripMember {
  user: SafeUser;
}

export interface CommentWithAuthor extends PoiComment {
  user: SafeUser;
}

export interface PoiWithRelations extends Poi {
  votes?: PoiVote[];
  comments?: CommentWithAuthor[];
  paidBy?: SafeUser | null;
  hasVoted?: boolean;
  voteCount?: number;
  voterNames?: string[];
}

export interface ChecklistItemWithAssignee extends ChecklistItem {
  assignedTo?: SafeUser | null;
}

export interface TripWithAllDetails extends Trip {
  members: MemberWithUser[];
  pois: PoiWithRelations[];
  checklistItems: ChecklistItemWithAssignee[];
  currentUserRole?: Role;
}

export interface TripCardData extends Trip {
  memberCount: number;
  plannedPoiCount: number;
  ideaPoiCount: number;
  totalEstimatedCost: number;
  members: SafeUser[];
  role: Role;
}

// Geospatial, Routing & Map Types
export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteLeg {
  fromPoiId: string;
  toPoiId: string;
  distanceKm: number;
  durationMinutes: number;
  coordinates: [number, number][]; // [lat, lng]
  isFallback: boolean;
}

export interface DayRouteSummary {
  day: number;
  totalStops: number;
  totalVisitMinutes: number;
  totalTravelMinutes: number;
  totalDistanceKm: number;
  isOverloaded: boolean; // > 600 minutes (10h)
  legs: RouteLeg[];
}

export interface ParsedMapUrl {
  lat: number;
  lng: number;
  title?: string;
  rawUrl: string;
}

export interface PhotonFeature {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
    type: string;
  };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    postcode?: string;
    country?: string;
    osm_type?: string;
    osm_value?: string;
  };
}

export interface PhotonSearchResult {
  type: string;
  features: PhotonFeature[];
}

// Full Trip Backup Export/Import Schema
export interface TripExportData {
  version: 1;
  exportedAt: string;
  trip: {
    title: string;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    currency: string;
    scratchpad: string | null;
  };
  members: {
    username: string;
    role: Role;
    avatarColor: string;
  }[];
  pois: {
    title: string;
    category: PoiCategory;
    status: PoiStatus;
    isMustSee: boolean;
    lat: number;
    lng: number;
    address: string | null;
    dayStart: number | null;
    dayEnd: number | null;
    orderIndex: number;
    timeSlot: string | null;
    durationMinutes: number | null;
    transportMode: TransportMode;
    estimatedCost: number;
    costType: CostType;
    paidByUsername: string | null;
    bookingReference: string | null;
    externalUrl: string | null;
    notes: string | null;
  }[];
  votes: {
    poiTitle: string;
    username: string;
  }[];
  comments: {
    poiTitle: string;
    authorUsername: string;
    content: string;
    createdAt: number | string;
  }[];
  checklists: {
    title: string;
    category: ChecklistCategory;
    isCompleted: boolean;
    assignedToUsername: string | null;
  }[];
}
