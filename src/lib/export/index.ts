/**
 * XML and Character Escaping Utility for GPX and XML Exports
 */
export function escapeXml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * iCalendar RFC 5545 Text Escaping
 * Escapes backslashes, semicolons, commas, and newlines.
 */
export function escapeIcs(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * GPX 1.1 Generator
 * Generates valid GPX 1.1 XML string containing <metadata>, <wpt> waypoints, and <trk> route tracks.
 */
export function generateGpx(
  trip: {
    title: string;
    description?: string | null;
  },
  pois: Array<{
    id: string;
    title: string;
    notes?: string | null;
    category?: string | null;
    lat: number;
    lng: number;
    dayStart?: number | null;
    orderIndex?: number | null;
  }>
): string {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  gpx += `<gpx version="1.1" creator="POI Studio - Collaborative Trip Planner" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  gpx += `  <metadata>\n`;
  gpx += `    <name>${escapeXml(trip.title)}</name>\n`;
  if (trip.description) {
    gpx += `    <desc>${escapeXml(trip.description)}</desc>\n`;
  }
  gpx += `    <time>${new Date().toISOString()}</time>\n`;
  gpx += `  </metadata>\n`;

  // Waypoints for all POIs
  for (const poi of pois) {
    gpx += `  <wpt lat="${poi.lat}" lon="${poi.lng}">\n`;
    gpx += `    <name>${escapeXml(poi.title)}</name>\n`;
    if (poi.notes) {
      gpx += `    <desc>${escapeXml(poi.notes)}</desc>\n`;
    }
    if (poi.category) {
      gpx += `    <type>${escapeXml(poi.category)}</type>\n`;
    }
    gpx += `  </wpt>\n`;
  }

  // Daily track segments for scheduled stops
  const scheduledPois = pois
    .filter((p) => p.dayStart !== null && p.dayStart !== undefined)
    .sort((a, b) => {
      const dayDiff = (a.dayStart || 0) - (b.dayStart || 0);
      if (dayDiff !== 0) return dayDiff;
      return (a.orderIndex || 0) - (b.orderIndex || 0);
    });

  if (scheduledPois.length > 0) {
    gpx += `  <trk>\n`;
    gpx += `    <name>${escapeXml(trip.title)} Route</name>\n`;
    gpx += `    <trkseg>\n`;
    for (const poi of scheduledPois) {
      gpx += `      <trkpt lat="${poi.lat}" lon="${poi.lng}">\n`;
      gpx += `        <name>${escapeXml(poi.title)}</name>\n`;
      gpx += `      </trkpt>\n`;
    }
    gpx += `    </trkseg>\n`;
    gpx += `  </trk>\n`;
  }

  gpx += `</gpx>`;
  return gpx;
}

/**
 * GeoJSON FeatureCollection Generator
 * Generates valid GeoJSON FeatureCollection with Point features [lon, lat] and properties.
 */
export function generateGeoJson(
  trip: {
    id: string;
    title: string;
  },
  pois: Array<{
    id: string;
    title: string;
    category?: string | null;
    status?: string | null;
    isMustSee?: boolean | null;
    lat: number;
    lng: number;
    address?: string | null;
    dayStart?: number | null;
    dayEnd?: number | null;
    orderIndex?: number | null;
    estimatedCost?: number | null;
    notes?: string | null;
  }>
) {
  const features = pois.map((p) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [p.lng, p.lat] as [number, number], // GeoJSON standard: [lon, lat]
    },
    properties: {
      id: p.id,
      title: p.title,
      category: p.category || 'OTHER',
      status: p.status || 'IDEA',
      isMustSee: Boolean(p.isMustSee),
      dayStart: p.dayStart ?? null,
      dayEnd: p.dayEnd ?? null,
      orderIndex: p.orderIndex ?? 0,
      address: p.address ?? null,
      estimatedCost: p.estimatedCost ?? 0,
      notes: p.notes ?? null,
    },
  }));

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

/**
 * iCalendar RFC 5545 Generator
 * Generates valid .ics calendar with VEVENT items for scheduled stops.
 * Gracefully handles undated trips without startDate.
 */
export function generateIcs(
  trip: {
    id: string;
    title: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
  pois: Array<{
    id: string;
    title: string;
    notes?: string | null;
    address?: string | null;
    lat: number;
    lng: number;
    dayStart?: number | null;
    dayEnd?: number | null;
    timeSlot?: string | null;
    durationMinutes?: number | null;
  }>
): string {
  let ics = `BEGIN:VCALENDAR\r\n`;
  ics += `VERSION:2.0\r\n`;
  ics += `PRODID:-//POI Studio//Collaborative Trip Planner//EN\r\n`;
  ics += `CALSCALE:GREGORIAN\r\n`;
  ics += `METHOD:PUBLISH\r\n`;
  ics += `X-WR-CALNAME:${escapeIcs(trip.title)}\r\n`;

  const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Include POIs that have coordinates
  for (const poi of pois) {
    ics += `BEGIN:VEVENT\r\n`;
    ics += `UID:${poi.id}@poistudio.local\r\n`;
    ics += `DTSTAMP:${nowIso}\r\n`;

    // Calculate dates if trip startDate is defined and poi.dayStart is specified
    if (trip.startDate && poi.dayStart && poi.dayStart > 0) {
      try {
        const baseDate = new Date(trip.startDate);
        if (!isNaN(baseDate.getTime())) {
          baseDate.setDate(baseDate.getDate() + (poi.dayStart - 1));
          const year = baseDate.getFullYear();
          const month = String(baseDate.getMonth() + 1).padStart(2, '0');
          const day = String(baseDate.getDate()).padStart(2, '0');

          if (poi.timeSlot && poi.timeSlot.includes(':')) {
            const [hours, minutes] = poi.timeSlot.split(':');
            const h = String(parseInt(hours, 10) || 0).padStart(2, '0');
            const m = String(parseInt(minutes, 10) || 0).padStart(2, '0');
            const durationMins = poi.durationMinutes || 60;

            const startDt = new Date(baseDate);
            startDt.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);

            const endDt = new Date(startDt.getTime() + durationMins * 60000);
            const endYear = endDt.getFullYear();
            const endMonth = String(endDt.getMonth() + 1).padStart(2, '0');
            const endDay = String(endDt.getDate()).padStart(2, '0');
            const endH = String(endDt.getHours()).padStart(2, '0');
            const endM = String(endDt.getMinutes()).padStart(2, '0');

            ics += `DTSTART:${year}${month}${day}T${h}${m}00\r\n`;
            ics += `DTEND:${endYear}${endMonth}${endDay}T${endH}${endM}00\r\n`;
          } else {
            // All-day event: DTEND must be non-inclusive (strictly later than DTSTART per RFC 5545 §3.8.2.2)
            const endDaysOffset =
              poi.dayEnd && poi.dayEnd >= poi.dayStart ? poi.dayEnd : poi.dayStart;
            const endBaseDate = new Date(trip.startDate);
            endBaseDate.setDate(endBaseDate.getDate() + endDaysOffset);
            const endYear = endBaseDate.getFullYear();
            const endMonth = String(endBaseDate.getMonth() + 1).padStart(2, '0');
            const endDay = String(endBaseDate.getDate()).padStart(2, '0');

            ics += `DTSTART;VALUE=DATE:${year}${month}${day}\r\n`;
            ics += `DTEND;VALUE=DATE:${endYear}${endMonth}${endDay}\r\n`;
          }
        }
      } catch {
        // Undated fallback
      }
    }

    ics += `SUMMARY:${escapeIcs(poi.title)}\r\n`;
    if (poi.address) {
      ics += `LOCATION:${escapeIcs(poi.address)}\r\n`;
    }
    ics += `GEO:${poi.lat};${poi.lng}\r\n`;
    if (poi.notes) {
      ics += `DESCRIPTION:${escapeIcs(poi.notes)}\r\n`;
    }
    ics += `END:VEVENT\r\n`;
  }

  ics += `END:VCALENDAR\r\n`;
  return ics;
}
