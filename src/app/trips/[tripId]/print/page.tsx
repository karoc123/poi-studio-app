import { notFound, redirect } from 'next/navigation';
import { eq, and, asc } from 'drizzle-orm';
import { db, trips, tripMembers, pois, checklistItems } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { PrintControls } from './PrintControls';
import { Calendar, MapPin, CheckSquare, FileText, Tag, Clock, Compass } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

export default async function PrintBookletPage({ params }: PageProps) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    redirect('/login');
  }

  const { tripId } = await params;

  // 1. Fetch Trip
  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  if (!trip) {
    notFound();
  }

  // 2. Check Membership
  const [membership] = await db
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
    .limit(1);

  if (!membership) {
    return (
      <div className="p-8 text-center text-slate-700">
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="mt-2 text-sm">You are not a member of this trip.</p>
      </div>
    );
  }

  // 3. Fetch POIs ordered by dayStart and orderIndex
  const allPois = await db
    .select()
    .from(pois)
    .where(eq(pois.tripId, tripId))
    .orderBy(asc(pois.dayStart), asc(pois.orderIndex), asc(pois.createdAt));

  // 4. Fetch Checklists
  const allChecklists = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.tripId, tripId))
    .orderBy(asc(checklistItems.category), asc(checklistItems.createdAt));

  // Group POIs by day
  const poisByDay = new Map<number | 'ideas', typeof allPois>();
  for (const poi of allPois) {
    const key = poi.dayStart !== null && poi.dayStart !== undefined ? poi.dayStart : 'ideas';
    const list = poisByDay.get(key) || [];
    list.push(poi);
    poisByDay.set(key, list);
  }

  // Sort day keys (1..N, then 'ideas')
  const sortedDayKeys = Array.from(poisByDay.keys()).sort((a, b) => {
    if (a === 'ideas') return 1;
    if (b === 'ideas') return -1;
    return a - b;
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900 font-sans">
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .page-break {
            page-break-before: always;
          }
          .avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          a {
            text-decoration: none !important;
            color: inherit !important;
          }
        }
        .page-break {
          page-break-before: always;
        }
        .avoid-break {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      `}</style>

      {/* Screen Controls Header */}
      <PrintControls tripId={trip.id} tripTitle={trip.title} />

      {/* Document Container */}
      <main className="max-w-4xl mx-auto p-6 md:p-10 bg-white shadow-xl print:shadow-none print:p-0 my-0 sm:my-8 print:my-0">
        {/* Cover / Header Section */}
        <header className="border-b-2 border-slate-900 pb-6 mb-8 avoid-break">
          <div className="flex items-center gap-2 text-indigo-600 print:text-black mb-2">
            <Compass className="w-5 h-5" />
            <span className="text-xs uppercase tracking-wider font-extrabold">POI Studio • Offline Travel Booklet</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 print:text-black">
            {trip.title}
          </h1>

          {trip.description && (
            <p className="mt-2 text-base text-slate-600 print:text-slate-800 leading-relaxed">
              {trip.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-6 text-sm font-medium text-slate-700 print:text-black">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>
                {trip.startDate || 'Flexible Dates'}
                {trip.endDate ? ` – ${trip.endDate}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-slate-500" />
              <span>{allPois.length} Places Total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-slate-500" />
              <span>{allChecklists.length} Checklist Items</span>
            </div>
          </div>
        </header>

        {/* Scratchpad & Emergency Notes */}
        {trip.scratchpad && (
          <section className="mb-8 avoid-break border border-amber-200 bg-amber-50/70 print:bg-white print:border-slate-300 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2 text-amber-900 print:text-black font-bold text-sm uppercase tracking-wide">
              <FileText className="w-4 h-4 text-amber-600 print:text-black" />
              <span>Trip Notes & Emergency Scratchpad</span>
            </div>
            <div className="text-sm text-slate-800 whitespace-pre-line font-mono bg-white print:bg-transparent p-3 rounded-lg border border-amber-200/50 print:border-none">
              {trip.scratchpad}
            </div>
          </section>
        )}

        {/* Itinerary Sections */}
        <section className="mb-10">
          <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-2 mb-6 flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600 print:text-black" />
            <span>Itinerary Stops & Schedule</span>
          </h2>

          {sortedDayKeys.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No places recorded in itinerary yet.</p>
          ) : (
            <div className="space-y-8">
              {sortedDayKeys.map((dayKey) => {
                const dayPois = poisByDay.get(dayKey) || [];
                const dayTitle = dayKey === 'ideas' ? 'Ideas & Unassigned Pool' : `Day ${dayKey}`;

                return (
                  <div key={String(dayKey)} className="avoid-break border border-slate-200 print:border-slate-400 rounded-xl p-5 bg-slate-50/50 print:bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                      <h3 className="text-base font-extrabold text-slate-900">
                        {dayTitle}
                      </h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        {dayPois.length} {dayPois.length === 1 ? 'stop' : 'stops'}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {dayPois.map((p, idx) => (
                        <div
                          key={p.id}
                          className="avoid-break bg-white print:bg-transparent border border-slate-200 print:border-b print:border-t-0 print:border-x-0 print:border-slate-300 rounded-lg p-3.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold mt-0.5">
                                {idx + 1}
                              </span>
                              <div>
                                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                  <span>{p.title}</span>
                                  {p.isMustSee && (
                                    <span className="text-amber-500 font-extrabold text-xs">★ Must-See</span>
                                  )}
                                </h4>
                                {p.address && (
                                  <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{p.address}</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                                {p.category}
                              </span>
                              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                                {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                              </div>
                            </div>
                          </div>

                          {(p.timeSlot || p.durationMinutes || p.notes || p.bookingReference) && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                              {(p.timeSlot || p.durationMinutes) && (
                                <div className="flex items-center gap-1.5 text-slate-700">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  <span>
                                    {p.timeSlot ? `Time: ${p.timeSlot}` : ''}
                                    {p.timeSlot && p.durationMinutes ? ' • ' : ''}
                                    {p.durationMinutes ? `Duration: ${p.durationMinutes} min` : ''}
                                  </span>
                                </div>
                              )}
                              {p.bookingReference && (
                                <p className="font-mono text-slate-800">
                                  Ref / Confirmation: {p.bookingReference}
                                </p>
                              )}
                              {p.notes && (
                                <p className="italic text-slate-700 mt-1">
                                  &quot;{p.notes}&quot;
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Checklists Section */}
        <section className="avoid-break page-break">
          <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-2 mb-6 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-600 print:text-black" />
            <span>Packing & Preparation Checklists</span>
          </h2>

          {allChecklists.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No checklist items defined.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allChecklists.map((item) => (
                <div
                  key={item.id}
                  className="avoid-break flex items-center gap-3 p-3 bg-slate-50 print:bg-white border border-slate-200 rounded-lg text-sm"
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                      item.isCompleted
                        ? 'bg-emerald-600 border-emerald-600 text-white font-bold'
                        : 'border-slate-400 bg-white'
                    }`}
                  >
                    {item.isCompleted ? '✓' : ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${item.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {item.title}
                    </p>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-4 border-t border-slate-200 text-center text-xs text-slate-400 print:text-slate-500 avoid-break">
          Generated with POI Studio • Printed {new Date().toLocaleDateString()}
        </footer>
      </main>
    </div>
  );
}
