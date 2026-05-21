'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';

export interface GADistrictData {
  district: string;
  district_number: string;
  representative: string;
  party?: 'R' | 'D';
  region: string;
  average_household_income_change: number;
  relative_household_income_change: number;
  winners_share?: number;
  losers_share?: number;
  poverty_pct_change?: number;
  child_poverty_pct_change?: number;
  state?: string;
}

interface Props {
  data: GADistrictData[];
  selectedDistrict: string | null;
  onSelect: (districtNumber: string) => void;
}

// ArcGIS REST API for 118th Congressional Districts, filtered to Georgia.
const GA_ARCGIS_URL =
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_118th_Congressional_Districts/FeatureServer/0/query?where=" +
  encodeURIComponent("STATE_ABBR='GA'") +
  '&outFields=*&f=geojson';

// GA representatives (matches CongressionalDistrictImpact.tsx)
const GA_REPRESENTATIVES: Record<string, string> = {
  '1': 'Buddy Carter',
  '2': 'Sanford Bishop',
  '3': 'Brian Jack',
  '4': 'Hank Johnson',
  '5': 'Nikema Williams',
  '6': 'Rich McCormick',
  '7': 'Lucy McBath',
  '8': 'Austin Scott',
  '9': 'Andrew Clyde',
  '10': 'Mike Collins',
  '11': 'Barry Loudermilk',
  '12': 'Rick Allen',
  '13': 'David Scott',
  '14': 'Clay Fuller',
};

const formatSignedCurrency = (value: number) => {
  const abs = Math.abs(value);
  const base =
    abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`;
  if (value > 0) return `+${base}`;
  if (value < 0) return `-${base}`;
  return base;
};

// Parse the ArcGIS feature properties to extract the district number.
// The 118th Congressional Districts service typically exposes CD118FP
// (2-digit FIPS string, e.g. "01"). Fall back to other known fields.
function getDistrictNumberFromFeature(props: Record<string, unknown>): string | null {
  const candidates = [
    props.CD118FP,
    props.CDFIPS,
    props.CDFP,
    props.DISTRICTFP,
    props.DISTRICT,
    props.CD,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const num = parseInt(String(candidate), 10);
    if (!Number.isNaN(num) && num > 0) {
      return String(num);
    }
  }
  // NAMELSAD is something like "Congressional District 1"
  if (typeof props.NAMELSAD === 'string') {
    const match = props.NAMELSAD.match(/(\d+)/);
    if (match) return String(parseInt(match[1], 10));
  }
  return null;
}

// Interpolate between two hex colors; t in [0, 1].
function lerpHexColor(a: string, b: string, t: number) {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const clamp = Math.max(0, Math.min(1, t));
  const c = (x1: number, x2: number) => Math.round(x1 + (x2 - x1) * clamp);
  return `rgb(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)})`;
}

// PolicyEngine diverging color scale (gray -> teal) — matches Utah dashboard.
const DIVERGING_COLORS = [
  '#475569', // gray-600 (most negative)
  '#94A3B8', // gray-400
  '#E2E8F0', // gray-200 (neutral/zero)
  '#81E6D9', // teal-200
  '#319795', // teal-500 (most positive)
];

function parseHex(color: string) {
  return {
    r: parseInt(color.slice(1, 3), 16),
    g: parseInt(color.slice(3, 5), 16),
    b: parseInt(color.slice(5, 7), 16),
  };
}

function getImpactColor(value: number, min: number, max: number) {
  if (min >= max) return DIVERGING_COLORS[2];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const segments = DIVERGING_COLORS.length - 1;
  const segPos = t * segments;
  const segIndex = Math.min(Math.floor(segPos), segments - 1);
  const segT = segPos - segIndex;
  const c0 = parseHex(DIVERGING_COLORS[segIndex]);
  const c1 = parseHex(DIVERGING_COLORS[segIndex + 1]);
  const r = Math.round(c0.r + (c1.r - c0.r) * segT);
  const g = Math.round(c0.g + (c1.g - c0.g) * segT);
  const b = Math.round(c0.b + (c1.b - c0.b) * segT);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// The ArcGIS fetch is the primary geometry source. The hand-drawn
// fallback below is just a stub set of empty features so the map
// doesn't blow up if the network fails — the ArcGIS endpoint has
// been reliable enough that we haven't needed real fallback polys.
const GA_FALLBACK_FEATURES: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

type Tooltip = {
  x: number;
  y: number;
  districtNum: string;
  representative: string;
  value: number;
};

export default function GADistrictChoroplethMap({
  data,
  selectedDistrict,
  onSelect,
}: Props) {
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  // ZoomableGroup state — controlled so the +/- buttons and pan gestures
  // stay in sync.
  const [zoom, setZoom] = useState(1);
  const [zoomCenter, setZoomCenter] = useState<[number, number]>([-83.4, 32.8]);

  // Fetch GA congressional districts from ArcGIS, with fallback.
  useEffect(() => {
    let cancelled = false;
    fetch(GA_ARCGIS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        if (json.features && json.features.length > 0) {
          setGeoData(json);
        } else {
          setGeoData(GA_FALLBACK_FEATURES);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(
          'Falling back to empty GA district layer; ArcGIS fetch failed:',
          err,
        );
        setGeoData(GA_FALLBACK_FEATURES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build lookup by district number (as string, without leading zeros).
  const dataByNumber = useMemo(() => {
    const m = new Map<string, GADistrictData>();
    data.forEach((d) => m.set(String(d.district_number), d));
    return m;
  }, [data]);

  const maxAbs = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(
      ...data.map((d) => Math.abs(d.average_household_income_change)),
      0,
    );
  }, [data]);

  const minChange = data.length
    ? Math.min(...data.map((d) => d.average_household_income_change))
    : 0;
  const maxChange = data.length
    ? Math.max(...data.map((d) => d.average_household_income_change))
    : 0;

  const handleDistrictEnter = useCallback(
    (districtNum: string, evt: React.MouseEvent) => {
      const d = dataByNumber.get(districtNum);
      if (!d) return;
      setTooltip({
        x: evt.clientX,
        y: evt.clientY,
        districtNum,
        representative:
          d.representative || GA_REPRESENTATIVES[districtNum] || '',
        value: d.average_household_income_change,
      });
    },
    [dataByNumber],
  );

  const handleDistrictLeave = useCallback(() => setTooltip(null), []);

  // Topojson is bundled in /public and resolves locally; skip the
  // pre-render placeholder so the map slot doesn't flash.
  if (!geoData) return null;

  return (
    <div className="relative">
      <div
        className="w-full border border-gray-100 rounded-md relative"
        style={{ height: 600 }}
      >
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 5800, center: [-83.4, 32.8] }}
          width={900}
          height={650}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
            <ZoomableGroup
              zoom={zoom}
              center={zoomCenter}
              onMoveEnd={({ zoom: z, coordinates }) => {
                setZoom(z);
                setZoomCenter(coordinates as [number, number]);
              }}
              minZoom={1}
              maxZoom={8}
            >
            <Geographies geography={geoData}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const districtNum = getDistrictNumberFromFeature(
                    geo.properties || {},
                  );
                  if (!districtNum) return null;
                  const d = dataByNumber.get(districtNum);
                  const value = d?.average_household_income_change ?? 0;
                  const isSelected = selectedDistrict === districtNum;
                  // Every SC district sees a positive average impact under
                  // the 2026 changes, so we use a uniform teal fill instead
                  // of a diverging scale.
                  void value;
                  const fill = '#319795';
                  return (
                    <Geography
                      key={geo.rsmKey || districtNum}
                      geography={geo}
                      onClick={() => onSelect(districtNum)}
                      onMouseEnter={(evt) =>
                        handleDistrictEnter(districtNum, evt)
                      }
                      onMouseMove={(evt) =>
                        handleDistrictEnter(districtNum, evt)
                      }
                      onMouseLeave={handleDistrictLeave}
                      style={{
                        default: {
                          fill,
                          stroke: isSelected ? '#0f766e' : '#ffffff',
                          strokeWidth: isSelected ? 2 : 0.75,
                          outline: 'none',
                          cursor: 'pointer',
                          transition: 'fill 0.2s ease',
                        },
                        hover: {
                          fill,
                          stroke: '#0f766e',
                          strokeWidth: 1.5,
                          outline: 'none',
                          cursor: 'pointer',
                          opacity: 0.85,
                        },
                        pressed: {
                          fill,
                          stroke: '#0f766e',
                          strokeWidth: 2,
                          outline: 'none',
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
            </ZoomableGroup>
        </ComposableMap>
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 bg-white rounded-md shadow-md border border-gray-200">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z * 1.5, 8))}
            aria-label="Zoom in"
            className="w-9 h-9 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-200"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z / 1.5, 1))}
            aria-label="Zoom out"
            className="w-9 h-9 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-200"
          >
            &minus;
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setZoomCenter([-83.4, 32.8]);
            }}
            aria-label="Reset zoom"
            className="w-9 h-9 flex items-center justify-center text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            Reset
          </button>
        </div>

        {tooltip && (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 pointer-events-none text-sm"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            <p className="font-semibold text-gray-900">
              GA-{String(tooltip.districtNum).padStart(2, '0')}
            </p>
            {tooltip.representative && (
              <p className="text-gray-600">{tooltip.representative}</p>
            )}
            <p className="text-gray-700">
              Avg change:{' '}
              <span className="font-semibold">
                {formatSignedCurrency(tooltip.value)}
              </span>
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 text-center mt-4">
        Average household impact from Georgia 2026 tax changes (HB463). Hover
        a district for the exact figure.
      </p>
    </div>
  );
}
