'use client';

import React, { useState, useEffect, useMemo, use, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Compass,
  ArrowLeft,
  Calendar,
  MapPin,
  Plus,
  Star,
  Users,
  FileText,
  Clock,
  ExternalLink,
  ChevronRight,
  Eye,
  CheckCircle2,
  HelpCircle,
  Smartphone,
  Map as MapIcon,
  List as ListIcon,
  X,
  DollarSign,
  CheckSquare,
  Sparkles,
  ArrowUpDown,
  Car,
  BedDouble,
  Download,
} from 'lucide-react';
import { LeafletMap } from '@/components/map';
import { SmartSearchBar } from '@/components/search';
import { InviteButton } from '@/components/collaboration/InviteButton';
import { MembersModal } from '@/components/collaboration/MembersModal';
import { ScratchpadModal } from '@/components/dashboard/ScratchpadModal';
import { ExportModal } from '@/components/export';
import { PoiCard, LegTimelineConnector, DailyWorkloadBar } from '@/components/itinerary';
import { PoiCommentsModal, TripBudgetModal } from '@/components/social';
import { ChecklistSidebar } from '@/components/checklist';
import { haversineDistance, estimateDurationMinutes } from '@/lib/algorithms/tsp';
import { calculateDayWorkload } from '@/lib/algorithms/workload';
import type {
  Role,
  PoiCategory,
  PoiStatus,
  TransportMode,
  CostType,
  PoiWithRelations,
  ChecklistItemWithAssignee,
  SafeUser,
} from '@/types';
import type { RouteLegItem } from '@/components/map/LeafletMapInner';

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return res.json();
  });

interface PageProps {
  params: Promise<{ tripId: string }>;
}

export default function TripWorkspacePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const tripId = resolvedParams.tripId;

  // 1. SWR Polling every 5 seconds for Trip State
  const { data: tripData, mutate: mutateTrip } = useSWR(
    tripId ? `/api/trips/${tripId}` : null,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true }
  );

  // 2. Fetch current session user
  const { data: authData } = useSWR('/api/auth/me', fetcher);
  const currentUser: SafeUser | undefined = authData?.user;

  // Trip and Role Details
  const trip = tripData?.trip;
  const currentUserRole: Role = trip?.currentUserRole || trip?.role || 'EDITOR';
  const isReadOnly = currentUserRole === 'VIEWER';

  // Sidebar Mode: 'itinerary' | 'checklists'
  const [sidebarMode, setSidebarMode] = useState<'itinerary' | 'checklists'>('itinerary');

  // POIs and Checklists state
  const [localPois, setLocalPois] = useState<PoiWithRelations[]>([]);
  const [localChecklists, setLocalChecklists] = useState<ChecklistItemWithAssignee[]>([]);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [hoveredPoiId, setHoveredPoiId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // Filter state
  const [activeDayTab, setActiveDayTab] = useState<'ALL' | 'IDEAS' | number>('ALL');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'ALL' | string>('ALL');
  const [sortIdeasByVotes, setSortIdeasByVotes] = useState<boolean>(false);

  // Modals state
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [commentsModalPoi, setCommentsModalPoi] = useState<PoiWithRelations | null>(null);

  // POI Form Modal
  const [isPoiModalOpen, setIsPoiModalOpen] = useState(false);
  const [poiFormData, setPoiFormData] = useState<{
    id?: string;
    title: string;
    category: PoiCategory | string;
    status: PoiStatus | string;
    isMustSee: boolean;
    lat: number;
    lng: number;
    address: string;
    dayStart: number | null;
    dayEnd: number | null;
    orderIndex: number;
    timeSlot: string;
    durationMinutes: number | null;
    transportMode: TransportMode | string;
    estimatedCost: number;
    costType: CostType | string;
    bookingReference: string;
    externalUrl: string;
    notes: string;
  }>({
    title: '',
    category: 'SIGHTSEEING',
    status: 'IDEA',
    isMustSee: false,
    lat: 48.8584,
    lng: 2.2945,
    address: '',
    dayStart: null,
    dayEnd: null,
    orderIndex: 0,
    timeSlot: '',
    durationMinutes: 60,
    transportMode: 'DRIVING',
    estimatedCost: 0,
    costType: 'TOTAL',
    bookingReference: '',
    externalUrl: '',
    notes: '',
  });

  // Mobile layout switcher: 'list' | 'map'
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');

  // Route legs for active day
  const [dayRouteLegs, setDayRouteLegs] = useState<
    Array<{
      fromPoiId: string;
      toPoiId: string;
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
      distanceKm: number;
      durationMinutes: number;
      isFallback: boolean;
      coordinates: [number, number][]; // [lat, lng]
      mode: string;
    }>
  >([]);

  const [isOptimizingDay, setIsOptimizingDay] = useState(false);

  // Sync POIs from server
  useEffect(() => {
    if (trip?.pois && Array.isArray(trip.pois)) {
      setLocalPois(trip.pois);
    }
  }, [trip?.pois]);

  // Sync checklists from server
  useEffect(() => {
    if (trip?.checklistItems && Array.isArray(trip.checklistItems)) {
      setLocalChecklists(trip.checklistItems);
    }
  }, [trip?.checklistItems]);

  // Global Keyboard Shortcuts (/ or Cmd+K to search, Esc to close modals)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsExportModalOpen(false);
        setIsPoiModalOpen(false);
        setIsMembersModalOpen(false);
        setIsScratchpadOpen(false);
        setIsBudgetModalOpen(false);
        setCommentsModalPoi(null);
        return;
      }

      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const isSlash = e.key === '/';

      if (isCmdK || isSlash) {
        const target = e.target as HTMLElement | null;
        const isEditing =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable);

        if (isSlash && isEditing) {
          return;
        }

        e.preventDefault();
        const searchInput = document.getElementById('smart-search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute total days from start and end dates if provided
  const totalDays = useMemo(() => {
    if (!trip?.startDate || !trip?.endDate) return 3;
    const start = new Date(trip.startDate).getTime();
    const end = new Date(trip.endDate).getTime();
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, Math.min(diffDays, 30));
  }, [trip?.startDate, trip?.endDate]);

  // Active Day POIs with Multi-Day Accommodation Pinning & Ordering
  const activeDayPois = useMemo(() => {
    if (typeof activeDayTab !== 'number') return [];

    const dayNum = activeDayTab;

    // 1. Identify multi-day accommodations covering this day
    const pinnedAccommodations = localPois.filter(
      (p) =>
        p.category === 'ACCOMMODATION' &&
        p.dayStart !== null &&
        p.dayStart !== undefined &&
        p.dayStart <= dayNum &&
        (p.dayEnd === null || p.dayEnd === undefined || p.dayEnd >= dayNum)
    );

    // 2. Regular stops planned for this day
    const regularStops = localPois.filter(
      (p) => p.dayStart === dayNum && !pinnedAccommodations.some((acc) => acc.id === p.id)
    );

    // Sort regular stops by orderIndex
    regularStops.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    // Combined list: pinned accommodations always at the top as startpoint!
    const combined = [...pinnedAccommodations, ...regularStops];

    return combined.map((p, idx) => ({
      ...p,
      stopNumber: idx + 1,
      isPinnedMultiDay:
        p.category === 'ACCOMMODATION' &&
        (pinnedAccommodations.some((acc) => acc.id === p.id) || (p.dayEnd !== null && p.dayEnd !== undefined && p.dayEnd > (p.dayStart ?? dayNum))),
    }));
  }, [localPois, activeDayTab]);

  // Filtered POIs based on Active Day and Category
  const filteredPois = useMemo(() => {
    if (typeof activeDayTab === 'number') {
      return activeDayPois;
    }

    let list = localPois.filter((poi) => {
      // Day filter
      if (activeDayTab === 'IDEAS') {
        if (poi.dayStart !== null && poi.dayStart !== undefined) return false;
      }
      // Category filter
      if (activeCategoryFilter !== 'ALL') {
        if (poi.category.toUpperCase() !== activeCategoryFilter.toUpperCase()) return false;
      }
      return true;
    });

    // Ideas pool popularity sort
    if (activeDayTab === 'IDEAS' && sortIdeasByVotes) {
      list = [...list].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    } else {
      list = [...list].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    }

    return list.map((poi) => ({
      ...poi,
      stopNumber: null,
      isPinnedMultiDay: false,
    }));
  }, [localPois, activeDayTab, activeCategoryFilter, sortIdeasByVotes, activeDayPois]);

  // Fetch or calculate leg connectors for active day
  useEffect(() => {
    if (typeof activeDayTab !== 'number' || activeDayPois.length < 2) {
      setDayRouteLegs([]);
      return;
    }

    let isMounted = true;

    // Calculate initial synchronous Haversine fallback legs immediately
    const initialLegs: typeof dayRouteLegs = [];
    for (let i = 0; i < activeDayPois.length - 1; i++) {
      const from = activeDayPois[i];
      const to = activeDayPois[i + 1];
      const dist = Math.round(haversineDistance(from.lat, from.lng, to.lat, to.lng) * 10) / 10;
      const mode = to.transportMode || 'DRIVING';
      const duration = estimateDurationMinutes(dist, mode);

      initialLegs.push({
        fromPoiId: from.id,
        toPoiId: to.id,
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        distanceKm: dist,
        durationMinutes: duration,
        isFallback: true,
        coordinates: [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ] as [number, number][],
        mode,
      });
    }

    setDayRouteLegs(initialLegs);

    // Asynchronously query `/api/geo/route` to get real OSRM road geometry
    async function fetchDetailedRoutes() {
      const detailedLegs = [...initialLegs];

      for (let i = 0; i < activeDayPois.length - 1; i++) {
        const from = activeDayPois[i];
        const to = activeDayPois[i + 1];
        const mode = (to.transportMode || 'DRIVING').toLowerCase();
        const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;

        try {
          const res = await fetch(`/api/geo/route?coords=${coords}&mode=${mode}`);
          if (res.ok) {
            const data = await res.json();
            if (data.coordinates && Array.isArray(data.coordinates)) {
              // Convert [lon, lat] from OSRM to [lat, lon] for Leaflet
              const latLngs: [number, number][] = data.coordinates.map((pt: [number, number]) => [pt[1], pt[0]]);
              detailedLegs[i] = {
                ...detailedLegs[i],
                distanceKm: data.distanceKm,
                durationMinutes: data.durationMin,
                isFallback: Boolean(data.isFallback),
                coordinates: latLngs,
              };
            }
          }
        } catch {
          // Keep Haversine fallback on error
        }
      }

      if (isMounted) {
        setDayRouteLegs(detailedLegs);
      }
    }

    fetchDetailedRoutes();

    return () => {
      isMounted = false;
    };
  }, [activeDayTab, activeDayPois]);

  // Workload and Pace calculation for active day
  const dayWorkload = useMemo(() => {
    if (typeof activeDayTab !== 'number') return null;
    return calculateDayWorkload(activeDayPois, dayRouteLegs);
  }, [activeDayTab, activeDayPois, dayRouteLegs]);

  const activeDayCost = useMemo(() => {
    if (typeof activeDayTab !== 'number') return 0;
    return activeDayPois.reduce((sum, p) => sum + Number(p.estimatedCost || 0), 0);
  }, [activeDayTab, activeDayPois]);

  // 1-Click Route Optimizer (Nearest-Neighbor TSP)
  const handleOptimizeDayRoute = async () => {
    if (typeof activeDayTab !== 'number' || isReadOnly || isOptimizingDay) return;

    setIsOptimizingDay(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/pois/optimize-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: activeDayTab }),
      });

      if (res.ok) {
        await mutateTrip();
      }
    } catch (err) {
      console.error('Failed to optimize day route:', err);
    } finally {
      setIsOptimizingDay(false);
    }
  };

  // Reorder Stops Up / Down within Active Day
  const handleReorderStop = async (currentIndex: number, direction: 'UP' | 'DOWN') => {
    if (isReadOnly || typeof activeDayTab !== 'number') return;

    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= activeDayPois.length) return;

    const reordered = [...activeDayPois];
    const temp = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const items = reordered.map((poi, idx) => ({
      id: poi.id,
      orderIndex: idx,
      dayStart: activeDayTab,
    }));

    // Optimistic UI update
    setLocalPois((prev) => {
      const map = new Map(items.map((i) => [i.id, i.orderIndex]));
      return prev.map((p) => (map.has(p.id) ? { ...p, orderIndex: map.get(p.id)! } : p));
    });

    try {
      await fetch(`/api/trips/${tripId}/pois/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      await mutateTrip();
    } catch (err) {
      console.error('Failed to reorder stops:', err);
    }
  };

  // Move POI to Another Day or Ideas Pool
  const handleMoveDay = async (poiId: string, targetDay: number | null) => {
    if (isReadOnly) return;

    // Optimistic update
    setLocalPois((prev) =>
      prev.map((p) => (p.id === poiId ? { ...p, dayStart: targetDay } : p))
    );

    try {
      await fetch(`/api/trips/${tripId}/pois/${poiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayStart: targetDay }),
      });
      await mutateTrip();
    } catch (err) {
      console.error('Failed to move POI day:', err);
    }
  };

  // Delete POI
  const handleDeletePoi = async (poiId: string) => {
    if (isReadOnly) return;

    // Optimistic update
    setLocalPois((prev) => prev.filter((p) => p.id !== poiId));
    if (selectedPoiId === poiId) setSelectedPoiId(null);

    try {
      await fetch(`/api/trips/${tripId}/pois/${poiId}`, {
        method: 'DELETE',
      });
      await mutateTrip();
    } catch (err) {
      console.error('Failed to delete POI:', err);
    }
  };

  // Vote Toggle Update Callback
  const handleVoteChange = (poiId: string, voted: boolean, newCount: number, newVoters: string[]) => {
    setLocalPois((prev) =>
      prev.map((p) =>
        p.id === poiId
          ? {
              ...p,
              hasVoted: voted,
              voteCount: newCount,
              voterNames: newVoters,
            }
          : p
      )
    );
  };

  // Handler: Click-to-Pin on Map
  const handleMapClick = async ({ lat, lng }: { lat: number; lng: number }) => {
    if (isReadOnly) return;

    let defaultTitle = `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    let defaultAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    try {
      const res = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lng}`);
      if (res.ok) {
        const data = await res.json();
        const feat = data.features?.[0];
        if (feat) {
          if (feat.properties?.name) {
            defaultTitle = feat.properties.name;
          }
          const addrParts = [
            feat.properties?.street,
            feat.properties?.housenumber,
            feat.properties?.city,
            feat.properties?.country,
          ].filter(Boolean);
          if (addrParts.length > 0) {
            defaultAddress = addrParts.join(', ');
          }
        }
      }
    } catch (err) {
      console.warn('Reverse geocode failed, using coordinates:', err);
    }

    setPoiFormData({
      title: defaultTitle,
      category: 'SIGHTSEEING',
      status: 'IDEA',
      isMustSee: false,
      lat,
      lng,
      address: defaultAddress,
      dayStart: typeof activeDayTab === 'number' ? activeDayTab : null,
      dayEnd: null,
      orderIndex: localPois.length,
      timeSlot: '',
      durationMinutes: 60,
      transportMode: 'DRIVING',
      estimatedCost: 0,
      costType: 'TOTAL',
      bookingReference: '',
      externalUrl: '',
      notes: '',
    });
    setIsPoiModalOpen(true);
  };

  // Handler: Selecting Location from Smart Search Bar
  const handleSelectParsedLocation = (location: {
    lat: number;
    lng: number;
    title?: string;
    address?: string;
  }) => {
    setFlyToTarget({ lat: location.lat, lng: location.lng, zoom: 15 });

    if (!isReadOnly) {
      setPoiFormData({
        title: location.title || `Pin at ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
        category: 'SIGHTSEEING',
        status: 'IDEA',
        isMustSee: false,
        lat: location.lat,
        lng: location.lng,
        address: location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
        dayStart: typeof activeDayTab === 'number' ? activeDayTab : null,
        dayEnd: null,
        orderIndex: localPois.length,
        timeSlot: '',
        durationMinutes: 60,
        transportMode: 'DRIVING',
        estimatedCost: 0,
        costType: 'TOTAL',
        bookingReference: '',
        externalUrl: '',
        notes: '',
      });
      setIsPoiModalOpen(true);
    }
  };

  // Handler: Edit POI Card
  const handleEditPoi = (poi: PoiWithRelations) => {
    if (isReadOnly) return;

    setPoiFormData({
      id: poi.id,
      title: poi.title,
      category: poi.category,
      status: poi.status,
      isMustSee: Boolean(poi.isMustSee),
      lat: Number(poi.lat),
      lng: Number(poi.lng),
      address: poi.address || '',
      dayStart: poi.dayStart,
      dayEnd: poi.dayEnd,
      orderIndex: poi.orderIndex || 0,
      timeSlot: poi.timeSlot || '',
      durationMinutes: poi.durationMinutes || 60,
      transportMode: poi.transportMode || 'DRIVING',
      estimatedCost: Number(poi.estimatedCost || 0),
      costType: poi.costType || 'TOTAL',
      bookingReference: poi.bookingReference || '',
      externalUrl: poi.externalUrl || '',
      notes: poi.notes || '',
    });
    setIsPoiModalOpen(true);
  };

  // Handler: Save POI (Create or Update via API)
  const handleSavePoi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !poiFormData.title.trim()) return;

    const payload = {
      title: poiFormData.title.trim(),
      category: poiFormData.category,
      status: poiFormData.status,
      isMustSee: poiFormData.isMustSee,
      lat: Number(poiFormData.lat),
      lng: Number(poiFormData.lng),
      address: poiFormData.address.trim() || null,
      dayStart: poiFormData.dayStart,
      dayEnd: poiFormData.dayEnd,
      orderIndex: poiFormData.orderIndex,
      timeSlot: poiFormData.timeSlot.trim() || null,
      durationMinutes: poiFormData.durationMinutes,
      transportMode: poiFormData.transportMode,
      estimatedCost: Number(poiFormData.estimatedCost || 0),
      costType: poiFormData.costType,
      bookingReference: poiFormData.bookingReference.trim() || null,
      externalUrl: poiFormData.externalUrl.trim() || null,
      notes: poiFormData.notes.trim() || null,
    };

    try {
      if (poiFormData.id) {
        // Update existing POI
        const res = await fetch(`/api/trips/${tripId}/pois/${poiFormData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.poi) {
            setLocalPois((prev) =>
              prev.map((p) => (p.id === poiFormData.id ? { ...p, ...data.poi } : p))
            );
          }
        }
      } else {
        // Create new POI
        const res = await fetch(`/api/trips/${tripId}/pois`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.poi) {
            setLocalPois((prev) => [...prev, data.poi]);
            setSelectedPoiId(data.poi.id);
            setFlyToTarget({ lat: data.poi.lat, lng: data.poi.lng, zoom: 15 });
          }
        }
      }
      await mutateTrip();
    } catch (err) {
      console.error('Failed to save POI:', err);
    } finally {
      setIsPoiModalOpen(false);
    }
  };

  // Convert Route legs to LeafletMap polylines
  const mapRouteLegs: RouteLegItem[] = useMemo(() => {
    return dayRouteLegs.map((l) => ({
      coordinates: l.coordinates,
      isFallback: l.isFallback,
    }));
  }, [dayRouteLegs]);

  // Open checklists counter
  const openChecklistCount = useMemo(() => {
    return localChecklists.filter((i) => !i.isCompleted).length;
  }, [localChecklists]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden text-slate-900">
      {/* 1. Top Header Bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center justify-between shrink-0 z-30 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-2 truncate">
            <h1 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
              {trip?.title || 'Trip Workspace'}
            </h1>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border ${
                currentUserRole === 'OWNER'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : currentUserRole === 'EDITOR'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {currentUserRole}
            </span>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Mobile View Toggle */}
          <div className="flex lg:hidden bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setMobileTab('list')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                mobileTab === 'list'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>Itinerary</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('map')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                mobileTab === 'map'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
          </div>

          {/* Budget Modal Button */}
          <button
            type="button"
            onClick={() => setIsBudgetModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200/80 shadow-xs"
            title="Trip Budget & Expenses Overview"
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Budget</span>
            <span className="bg-emerald-100 px-1.5 py-0.2 rounded text-[10px] text-emerald-800 font-extrabold">
              {trip?.currency || '€'}
              {(trip?.totalEstimatedCost ?? 0).toLocaleString()}
            </span>
          </button>

          {/* Invite Button */}
          {trip && (
            <InviteButton
              inviteCode={trip.inviteCode}
              tripId={trip.id}
              isOwner={currentUserRole === 'OWNER'}
              onInviteCodeRegenerated={() => {
                mutateTrip();
              }}
            />
          )}

          {/* Members Button */}
          <button
            type="button"
            onClick={() => setIsMembersModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200/60"
            title="Trip Members"
          >
            <Users className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Members</span>
            {trip?.memberCount && (
              <span className="ml-0.5 bg-white px-1.5 py-0.2 rounded-full text-[10px] font-bold text-slate-700 shadow-xs">
                {trip.memberCount}
              </span>
            )}
          </button>

          {/* Scratchpad Button */}
          <button
            type="button"
            onClick={() => setIsScratchpadOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200/60"
            title="Shared Scratchpad"
          >
            <FileText className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Notes</span>
          </button>

          {/* Export Modal Button */}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200/60"
            title="Export Trip (JSON, GPX, GeoJSON, iCal, Booklet)"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </header>

      {/* 2. Split Screen Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar Pane (440px on desktop) */}
        <aside
          className={`w-full lg:w-[440px] xl:w-[460px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden z-20 transition-all duration-200 ${
            mobileTab === 'map' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Sidebar Mode Tabs: Itinerary vs Checklists */}
          <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 pt-2 gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSidebarMode('itinerary')}
              className={`pb-2 px-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                sidebarMode === 'itinerary'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Itinerary & Places</span>
              <span className="bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">
                {localPois.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSidebarMode('checklists')}
              className={`pb-2 px-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                sidebarMode === 'checklists'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Checklists</span>
              {openChecklistCount > 0 ? (
                <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {openChecklistCount}
                </span>
              ) : (
                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full text-[10px]">
                  {localChecklists.length}
                </span>
              )}
            </button>
          </div>

          {/* Mode 1: Checklists Sidebar */}
          {sidebarMode === 'checklists' ? (
            <ChecklistSidebar
              tripId={tripId}
              items={localChecklists}
              members={trip?.members?.map((m: any) => m.user || m) || []}
              currentUserId={currentUser?.id || ''}
              currentUserRole={currentUserRole}
              onItemCreated={(item) => setLocalChecklists((prev) => [...prev, item])}
              onItemUpdated={(itemId, updates) =>
                setLocalChecklists((prev) =>
                  prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
                )
              }
              onItemDeleted={(itemId) =>
                setLocalChecklists((prev) => prev.filter((i) => i.id !== itemId))
              }
            />
          ) : (
            /* Mode 2: Itinerary & Places */
            <>
              {/* Top Search & Actions */}
              <div className="p-3 border-b border-slate-100 space-y-2.5 bg-slate-50/50 shrink-0">
                <SmartSearchBar
                  onSelectParsedLocation={handleSelectParsedLocation}
                  isReadOnly={isReadOnly}
                  placeholder="Search places or paste map URLs / coords..."
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-500">
                    {filteredPois.length} {filteredPois.length === 1 ? 'place' : 'places'} shown
                  </div>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setPoiFormData({
                          title: '',
                          category: 'SIGHTSEEING',
                          status: 'IDEA',
                          isMustSee: false,
                          lat: 48.8584,
                          lng: 2.2945,
                          address: '',
                          dayStart: typeof activeDayTab === 'number' ? activeDayTab : null,
                          dayEnd: null,
                          orderIndex: localPois.length,
                          timeSlot: '',
                          durationMinutes: 60,
                          transportMode: 'DRIVING',
                          estimatedCost: 0,
                          costType: 'TOTAL',
                          bookingReference: '',
                          externalUrl: '',
                          notes: '',
                        });
                        setIsPoiModalOpen(true);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Place</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Day Filter Tabs */}
              <div className="px-3 py-2 border-b border-slate-200 bg-white overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveDayTab('ALL')}
                  className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 transition-all ${
                    activeDayTab === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Pins ({localPois.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDayTab('IDEAS')}
                  className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 transition-all ${
                    activeDayTab === 'IDEAS'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Ideas Pool
                </button>

                {Array.from({ length: totalDays }).map((_, i) => {
                  const dayNum = i + 1;
                  const isActive = activeDayTab === dayNum;
                  return (
                    <button
                      key={`day-tab-${dayNum}`}
                      type="button"
                      onClick={() => setActiveDayTab(dayNum)}
                      className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Day {dayNum}
                    </button>
                  );
                })}
              </div>

              {/* Sub-header for Ideas Pool or Active Day */}
              {activeDayTab === 'IDEAS' && (
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs shrink-0">
                  <span className="font-semibold text-slate-500">Unassigned group favorites</span>
                  <button
                    type="button"
                    onClick={() => setSortIdeasByVotes((prev) => !prev)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-bold transition-colors ${
                      sortIdeasByVotes
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-200/80 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>{sortIdeasByVotes ? 'Sorted: Most Voted' : 'Sort by Votes'}</span>
                  </button>
                </div>
              )}

              {/* POI Cards & Timeline List (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {/* Active Day Workload Summary & Overload Pace Alert */}
                {typeof activeDayTab === 'number' && dayWorkload && (
                  <DailyWorkloadBar
                    dayNumber={activeDayTab}
                    totalStops={dayWorkload.totalStops}
                    totalVisitMinutes={dayWorkload.totalVisitMinutes}
                    totalTravelMinutes={dayWorkload.totalTravelMinutes}
                    totalDistanceKm={dayWorkload.totalDistanceKm}
                    totalCost={activeDayCost}
                    currency={trip?.currency || '€'}
                    isOverloaded={dayWorkload.isOverloaded}
                    isReadOnly={isReadOnly}
                    isOptimizing={isOptimizingDay}
                    onOptimizeDayRoute={handleOptimizeDayRoute}
                  />
                )}

                {filteredPois.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 px-4">
                    <MapPin className="w-8 h-8 mx-auto text-slate-300 mb-2 stroke-1" />
                    <p className="text-xs font-semibold text-slate-600">No places found in this view</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click anywhere on the map or use the search bar above to drop a pin.
                    </p>
                  </div>
                ) : (
                  filteredPois.map((poi, idx) => {
                    const isSelected = selectedPoiId === poi.id;
                    const isHovered = hoveredPoiId === poi.id;
                    const nextPoi = filteredPois[idx + 1];
                    const legInfo = dayRouteLegs[idx];

                    return (
                      <React.Fragment key={poi.id}>
                        <PoiCard
                          tripId={tripId}
                          poi={poi}
                          stopNumber={poi.stopNumber}
                          isSelected={isSelected}
                          isHovered={isHovered}
                          isPinnedMultiDay={poi.isPinnedMultiDay}
                          isReadOnly={isReadOnly}
                          totalDays={totalDays}
                          currency={trip?.currency || '€'}
                          onSelect={() => {
                            setSelectedPoiId(poi.id);
                            setFlyToTarget({ lat: poi.lat, lng: poi.lng, zoom: 15 });
                          }}
                          onHover={(hov) => setHoveredPoiId(hov ? poi.id : null)}
                          onEdit={handleEditPoi}
                          onDelete={handleDeletePoi}
                          onMoveDay={handleMoveDay}
                          onReorderUp={() => handleReorderStop(idx, 'UP')}
                          onReorderDown={() => handleReorderStop(idx, 'DOWN')}
                          canReorderUp={idx > 0 && typeof activeDayTab === 'number'}
                          canReorderDown={idx < filteredPois.length - 1 && typeof activeDayTab === 'number'}
                          onOpenComments={(p) => setCommentsModalPoi(p)}
                          onVoteChange={(voted, newCount, newVoters) =>
                            handleVoteChange(poi.id, voted, newCount, newVoters)
                          }
                        />

                        {/* Leg Timeline Connector between consecutive stops on an active day */}
                        {typeof activeDayTab === 'number' && nextPoi && (
                          <LegTimelineConnector
                            fromLat={poi.lat}
                            fromLng={poi.lng}
                            toLat={nextPoi.lat}
                            toLng={nextPoi.lng}
                            distanceKm={legInfo?.distanceKm}
                            durationMinutes={legInfo?.durationMinutes}
                            mode={nextPoi.transportMode || 'DRIVING'}
                            isFallback={legInfo?.isFallback}
                          />
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </>
          )}
        </aside>

        {/* Right Interactive Leaflet Map Pane */}
        <main
          className={`flex-1 h-full relative bg-slate-100 overflow-hidden ${
            mobileTab === 'list' ? 'hidden lg:block' : 'block'
          }`}
        >
          <LeafletMap
            pois={filteredPois}
            routeLegs={typeof activeDayTab === 'number' ? mapRouteLegs : []}
            selectedPoiId={selectedPoiId}
            hoveredPoiId={hoveredPoiId}
            onSelectPoi={(poi) => {
              setSelectedPoiId(poi.id);
              const cardEl = document.getElementById(`poi-card-${poi.id}`);
              if (cardEl) {
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }}
            onMapClick={handleMapClick}
            flyToTarget={flyToTarget}
            isReadOnly={isReadOnly}
            filterKey={activeDayTab}
          />
        </main>
      </div>

      {/* 3. POI Modal (Create / Edit) */}
      {isPoiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <h2 className="font-extrabold text-slate-900 text-sm">
                {isReadOnly ? 'Place Details' : poiFormData.id ? 'Edit Place' : 'Add Place to Trip'}
              </h2>
              <button
                type="button"
                onClick={() => setIsPoiModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePoi} className="p-5 space-y-3.5 overflow-y-auto flex-1">
              {/* Place Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Place Title *
                </label>
                <input
                  type="text"
                  required
                  disabled={isReadOnly}
                  value={poiFormData.title}
                  onChange={(e) => setPoiFormData({ ...poiFormData, title: e.target.value })}
                  placeholder="e.g. Louvre Museum, Tokyo Tower, Grand Hotel..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 font-semibold"
                />
              </div>

              {/* Category and Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={poiFormData.category}
                    onChange={(e) => setPoiFormData({ ...poiFormData, category: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  >
                    <option value="SIGHTSEEING">Sightseeing</option>
                    <option value="FOOD">Food & Drink</option>
                    <option value="ACCOMMODATION">Accommodation</option>
                    <option value="ACTIVITY">Activity</option>
                    <option value="NATURE">Nature</option>
                    <option value="TRANSPORT">Transport</option>
                    <option value="NIGHTLIFE">Nightlife</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={poiFormData.status}
                    onChange={(e) => setPoiFormData({ ...poiFormData, status: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  >
                    <option value="IDEA">Idea</option>
                    <option value="PLANNED">Planned</option>
                    <option value="BOOKED">Booked</option>
                  </select>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Address / Location Description
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={poiFormData.address}
                  onChange={(e) => setPoiFormData({ ...poiFormData, address: e.target.value })}
                  placeholder="Street, City, Country"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                />
              </div>

              {/* Day Scheduling */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {poiFormData.category === 'ACCOMMODATION' ? 'Check-in Day' : 'Assigned Day'}
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={poiFormData.dayStart ?? ''}
                    onChange={(e) =>
                      setPoiFormData({
                        ...poiFormData,
                        dayStart: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  >
                    <option value="">Unassigned (Ideas Pool)</option>
                    {Array.from({ length: totalDays }).map((_, i) => (
                      <option key={`opt-day-${i + 1}`} value={i + 1}>
                        Day {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                {poiFormData.category === 'ACCOMMODATION' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-out Day (Multi-Day Stay)
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={poiFormData.dayEnd ?? ''}
                      onChange={(e) =>
                        setPoiFormData({
                          ...poiFormData,
                          dayEnd: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                    >
                      <option value="">Single Day Stay</option>
                      {Array.from({ length: totalDays }).map((_, i) => (
                        <option key={`opt-checkout-${i + 1}`} value={i + 1}>
                          Until Day {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Time Slot (Optional)
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={poiFormData.timeSlot}
                      onChange={(e) => setPoiFormData({ ...poiFormData, timeSlot: e.target.value })}
                      placeholder="e.g. 10:00 - 12:00"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                    />
                  </div>
                )}
              </div>

              {/* Transit & Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Visit Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    disabled={isReadOnly}
                    value={poiFormData.durationMinutes ?? ''}
                    onChange={(e) =>
                      setPoiFormData({
                        ...poiFormData,
                        durationMinutes: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    placeholder="e.g. 60 or 120"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Transport Mode to Here
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={poiFormData.transportMode}
                    onChange={(e) => setPoiFormData({ ...poiFormData, transportMode: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  >
                    <option value="DRIVING">🚗 Driving (Car / Taxi)</option>
                    <option value="WALKING">🚶 Walking</option>
                    <option value="CYCLING">🚲 Cycling</option>
                    <option value="TRANSIT">🚆 Public Transit</option>
                  </select>
                </div>
              </div>

              {/* Cost & Booking Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Estimated Cost ({trip?.currency || '€'})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={isReadOnly}
                    value={poiFormData.estimatedCost || ''}
                    onChange={(e) =>
                      setPoiFormData({
                        ...poiFormData,
                        estimatedCost: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Booking Reference
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={poiFormData.bookingReference}
                    onChange={(e) =>
                      setPoiFormData({ ...poiFormData, bookingReference: e.target.value })
                    }
                    placeholder="e.g. TKT-9912 or Airbnb #44"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                  />
                </div>
              </div>

              {/* Must-See Highlight Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="modal-is-must-see"
                  disabled={isReadOnly}
                  checked={poiFormData.isMustSee}
                  onChange={(e) => setPoiFormData({ ...poiFormData, isMustSee: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="modal-is-must-see"
                  className="text-xs font-bold text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  Mark as Must-See Highlight
                </label>
              </div>

              {/* External Website link */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Website / Booking URL
                </label>
                <input
                  type="url"
                  disabled={isReadOnly}
                  value={poiFormData.externalUrl}
                  onChange={(e) => setPoiFormData({ ...poiFormData, externalUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes & Tips
                </label>
                <textarea
                  rows={2}
                  disabled={isReadOnly}
                  value={poiFormData.notes}
                  onChange={(e) => setPoiFormData({ ...poiFormData, notes: e.target.value })}
                  placeholder="Opening times, booking tips, packing notes..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPoiModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                {!isReadOnly && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                  >
                    Save Place
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. POI Comments Modal */}
      {commentsModalPoi && trip && (
        <PoiCommentsModal
          isOpen={Boolean(commentsModalPoi)}
          onClose={() => setCommentsModalPoi(null)}
          tripId={trip.id}
          poiId={commentsModalPoi.id}
          poiTitle={commentsModalPoi.title}
          currentUserId={currentUser?.id || ''}
          currentUserRole={currentUserRole}
          initialComments={commentsModalPoi.comments || []}
          onCommentCountChange={(newCount) => {
            setLocalPois((prev) =>
              prev.map((p) =>
                p.id === commentsModalPoi.id
                  ? {
                      ...p,
                      comments: Array.from({ length: newCount }) as any,
                    }
                  : p
              )
            );
          }}
        />
      )}

      {/* 5. Trip Budget Modal */}
      {trip && (
        <TripBudgetModal
          isOpen={isBudgetModalOpen}
          onClose={() => setIsBudgetModalOpen(false)}
          pois={localPois}
          members={trip?.members?.map((m: any) => m.user || m) || []}
          currency={trip?.currency || '€'}
        />
      )}

      {/* 6. Members Modal */}
      {trip && (
        <MembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          tripId={trip.id}
          inviteCode={trip.inviteCode}
          currentUserRole={currentUserRole}
          currentUserId={currentUser?.id || ''}
          onMembersChanged={() => mutateTrip()}
        />
      )}

      {/* 7. Scratchpad Modal */}
      {trip && (
        <ScratchpadModal
          isOpen={isScratchpadOpen}
          onClose={() => setIsScratchpadOpen(false)}
          trip={trip}
          onScratchpadUpdated={() => mutateTrip()}
        />
      )}

      {/* 8. Export Modal */}
      {trip && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          tripId={trip.id}
          tripTitle={trip.title}
        />
      )}
    </div>
  );
}
