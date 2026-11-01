import type * as LeafletType from 'leaflet';

export interface PoiMarkerOptions {
  category?: string;
  status?: string; // IDEA, PLANNED, BOOKED
  stopNumber?: number | null;
  isMustSee?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  title?: string;
}

export interface CategoryTheme {
  name: string;
  color: string;
  label: string;
  svgIcon: string;
}

// 8 Distinct Categories with SVG Icons (conforming to FEATURES.md §4 and DISPATCH.md)
export const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  FOOD: {
    name: 'FOOD',
    label: 'Food & Drink',
    color: '#EA580C', // Orange
    // Utensils icon
    svgIcon: `
      <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
      <path d="M15 2v14" />
      <path d="M6 2v14" />
      <path d="M3 2v4a3 3 0 0 0 6 0V2" />
      <line x1="15" y1="16" x2="15" y2="22" />
      <line x1="6" y1="16" x2="6" y2="22" />
    `,
  },
  FOOD_DRINK: {
    name: 'FOOD_DRINK',
    label: 'Food & Drink',
    color: '#EA580C',
    svgIcon: `
      <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
      <path d="M15 2v14" />
      <path d="M6 2v14" />
      <path d="M3 2v4a3 3 0 0 0 6 0V2" />
      <line x1="15" y1="16" x2="15" y2="22" />
      <line x1="6" y1="16" x2="6" y2="22" />
    `,
  },
  SIGHTSEEING: {
    name: 'SIGHTSEEING',
    label: 'Sightseeing',
    color: '#059669', // Emerald
    // Landmark / Camera icon
    svgIcon: `
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7 12 2" />
    `,
  },
  ACTIVITY: {
    name: 'ACTIVITY',
    label: 'Activity',
    color: '#7C3AED', // Purple
    // Compass / Ticket icon
    svgIcon: `
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    `,
  },
  ACCOMMODATION: {
    name: 'ACCOMMODATION',
    label: 'Accommodation',
    color: '#4F46E5', // Indigo
    // Bed icon
    svgIcon: `
      <path d="M2 4v16" />
      <path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <path d="M2 17h20" />
      <path d="M6 8v9" />
    `,
  },
  SHOPPING: {
    name: 'SHOPPING',
    label: 'Shopping',
    color: '#D97706', // Amber
    // Shopping bag icon
    svgIcon: `
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    `,
  },
  TRANSPORT: {
    name: 'TRANSPORT',
    label: 'Transport',
    color: '#2563EB', // Blue
    // Car / Train icon
    svgIcon: `
      <rect width="16" height="12" x="4" y="3" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <circle cx="8" cy="19" r="2" />
      <circle cx="16" cy="19" r="2" />
    `,
  },
  RELAXATION: {
    name: 'RELAXATION',
    label: 'Relaxation',
    color: '#16A34A', // Green
    // Trees / Mountain icon
    svgIcon: `
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    `,
  },
  NATURE: {
    name: 'NATURE',
    label: 'Nature',
    color: '#16A34A', // Green
    svgIcon: `
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    `,
  },
  NIGHTLIFE: {
    name: 'NIGHTLIFE',
    label: 'Nightlife',
    color: '#DB2777', // Pink
    // Wine / Party icon
    svgIcon: `
      <path d="M8 22h8" />
      <path d="M12 11v11" />
      <path d="m19 3-4 8H9L5 3z" />
    `,
  },
  OTHER: {
    name: 'OTHER',
    label: 'Other',
    color: '#475569', // Slate
    // MapPin icon
    svgIcon: `
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    `,
  },
};

/**
 * Normalizes input category to a recognized theme.
 */
export function getCategoryTheme(category?: string): CategoryTheme {
  if (!category) return CATEGORY_THEMES.OTHER;
  const upper = category.toUpperCase().trim();
  if (upper in CATEGORY_THEMES) {
    return CATEGORY_THEMES[upper];
  }
  if (upper.includes('FOOD') || upper.includes('DRINK') || upper.includes('RESTAURANT') || upper.includes('CAFE')) {
    return CATEGORY_THEMES.FOOD;
  }
  if (upper.includes('HOTEL') || upper.includes('BED') || upper.includes('STAY')) {
    return CATEGORY_THEMES.ACCOMMODATION;
  }
  if (upper.includes('PARK') || upper.includes('HIKE') || upper.includes('RELAX')) {
    return CATEGORY_THEMES.NATURE;
  }
  if (upper.includes('SHOP') || upper.includes('STORE') || upper.includes('MARKET')) {
    return CATEGORY_THEMES.SHOPPING;
  }
  if (upper.includes('TRAIN') || upper.includes('FLIGHT') || upper.includes('CAR')) {
    return CATEGORY_THEMES.TRANSPORT;
  }
  if (upper.includes('BAR') || upper.includes('CLUB') || upper.includes('PUB')) {
    return CATEGORY_THEMES.NIGHTLIFE;
  }
  return CATEGORY_THEMES.OTHER;
}

/**
 * Generates pure SVG markup for a POI pin marker.
 * Strictly adheres to:
 * - 8 distinct categories
 * - 3 status styles:
 *   - IDEA: dashed stroke, 80% opacity, slightly muted
 *   - PLANNED: solid vibrant color, white border, drop shadow
 *   - BOOKED: solid pin with green checkmark confirmation badge
 * - Sequential stop numbering inside the pin when stopNumber is passed
 * - Must-see gold star indicator when isMustSee is true
 * - Highlighted/selected state when isSelected or isHovered is true
 */
export function createPoiMarkerSvg(options: PoiMarkerOptions): string {
  const theme = getCategoryTheme(options.category);
  const status = (options.status || 'IDEA').toUpperCase();
  const isIdea = status === 'IDEA';
  const isBooked = status === 'BOOKED';
  const isMustSee = Boolean(options.isMustSee);
  const stopNumber = options.stopNumber;
  const isHighlighted = Boolean(options.isSelected || options.isHovered);

  const baseSize = isHighlighted ? 44 : isIdea ? 34 : 38;
  const pinWidth = baseSize;
  const pinHeight = Math.round(baseSize * 1.25);
  const centerX = pinWidth / 2;
  const radius = (pinWidth - 6) / 2;
  const centerY = radius + 3;

  // Status-based styling
  const fillOpacity = isIdea ? 0.8 : 1.0;
  const strokeColor = '#ffffff';
  const strokeWidth = isHighlighted ? 3 : 2;
  const strokeDash = isIdea ? 'stroke-dasharray="3,3"' : '';
  const filterId = isHighlighted ? 'filter="url(#glow)"' : 'filter="url(#shadow)"';

  // Badges
  // 1. Must-See Gold Star in top-left
  const goldStarSvg = isMustSee
    ? `
      <g transform="translate(${centerX - radius - 2}, 0)">
        <circle cx="8" cy="8" r="8" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.5" />
        <polygon points="8,2 9.8,5.7 13.9,6.3 10.9,9.2 11.6,13.3 8,11.4 4.4,13.3 5.1,9.2 2.1,6.3 6.2,5.7" fill="#D97706" />
      </g>
    `
    : '';

  // 2. Booked Green Checkmark in bottom-right of head
  const bookedCheckmarkSvg = isBooked
    ? `
      <g transform="translate(${centerX + radius - 10}, ${centerY + radius - 10})">
        <circle cx="7" cy="7" r="7" fill="#16A34A" stroke="#FFFFFF" stroke-width="1.5" />
        <path d="M4.5 7 L6.2 8.7 L9.5 5.3" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    `
    : '';

  // Center Content: Stop number (bold text) or Category Icon
  let centerContent = '';
  if (stopNumber !== undefined && stopNumber !== null && stopNumber > 0) {
    centerContent = `
      <text
        x="${centerX}"
        y="${centerY + 5}"
        text-anchor="middle"
        fill="#FFFFFF"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${isHighlighted ? 15 : 13}"
        font-weight="800"
      >${stopNumber}</text>
    `;
  } else {
    const iconScale = isHighlighted ? 0.75 : 0.65;
    const iconOffset = (24 * iconScale) / 2;
    centerContent = `
      <g
        transform="translate(${centerX - iconOffset}, ${centerY - iconOffset}) scale(${iconScale})"
        stroke="#FFFFFF"
        fill="none"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        ${theme.svgIcon}
      </g>
    `;
  }

  // Teardrop pin path: circle on top, tapering to bottom point (centerX, pinHeight - 2)
  const tipY = pinHeight - 2;
  const pinPath = `
    M ${centerX} ${tipY}
    C ${centerX - 2} ${tipY - 5}, ${centerX - radius} ${centerY + radius}, ${centerX - radius} ${centerY}
    A ${radius} ${radius} 0 1 1 ${centerX + radius} ${centerY}
    C ${centerX + radius} ${centerY + radius}, ${centerX + 2} ${tipY - 5}, ${centerX} ${tipY}
    Z
  `;

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${pinWidth} ${pinHeight}"
      width="${pinWidth}"
      height="${pinHeight}"
      class="custom-poi-svg-marker"
      style="overflow: visible;"
    >
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.35" />
        </filter>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${theme.color}" flood-opacity="0.8" />
        </filter>
      </defs>

      <!-- Pin Base / Shadow -->
      <path
        d="${pinPath}"
        fill="${theme.color}"
        fill-opacity="${fillOpacity}"
        stroke="${strokeColor}"
        stroke-width="${strokeWidth}"
        ${strokeDash}
        ${filterId}
      />

      <!-- Center Icon or Sequential Stop Number -->
      ${centerContent}

      <!-- Badges -->
      ${goldStarSvg}
      ${bookedCheckmarkSvg}
    </svg>
  `.trim();
}

/**
 * Creates Leaflet L.divIcon instance using SVG markup.
 */
export function createPoiDivIcon(L: typeof LeafletType, options: PoiMarkerOptions): LeafletType.DivIcon {
  const isHighlighted = Boolean(options.isSelected || options.isHovered);
  const status = (options.status || 'IDEA').toUpperCase();
  const isIdea = status === 'IDEA';
  const baseSize = isHighlighted ? 44 : isIdea ? 34 : 38;
  const pinWidth = baseSize;
  const pinHeight = Math.round(baseSize * 1.25);

  const html = createPoiMarkerSvg(options);

  return L.divIcon({
    className: `custom-poi-marker-div ${isHighlighted ? 'poi-marker-active' : ''}`,
    html: `<div class="custom-poi-marker-inner" style="cursor: pointer; width: ${pinWidth}px; height: ${pinHeight}px;">${html}</div>`,
    iconSize: [pinWidth, pinHeight],
    iconAnchor: [pinWidth / 2, pinHeight - 2],
    popupAnchor: [0, -pinHeight + 6],
  });
}
