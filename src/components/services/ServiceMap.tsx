"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

// React 18 Offscreen API and StrictMode re-run map creation when a component remounts or reappears.
// To prevent "Map container is being reused by another instance" and "Map container is already initialized" errors,
// we patch Leaflet's Map prototype to store/clean up the map reference on the DOM container,
// and make remove() safe when called on an already unmounted or reused map instance.
if (typeof window !== "undefined") {
  const proto = (L as any).Map.prototype;
  if (!proto._avReappearPatch) {
    const origInit = proto._initContainer as (id: string | HTMLElement) => void;
    proto._initContainer = function (id: string | HTMLElement) {
      const el = (typeof id === "string" ? document.getElementById(id) : id) as (HTMLElement & { _leaflet_id?: number; _leaflet?: L.Map }) | null;
      if (el?._leaflet_id && el._leaflet) {
        try { el._leaflet.remove(); } catch {}
      }
      if (el) {
        el._leaflet = this;
      }
      return origInit.call(this, id);
    };

    const origRemove = proto.remove;
    proto.remove = function () {
      if (this._containerId !== this._container?._leaflet_id) {
        return this;
      }
      return origRemove.call(this);
    };
    proto._avReappearPatch = true;
  }
}


export interface MapSite {
  id: string;
  projectNo: string;
  projectId?: string;
  customerName: string;
  address: string;
  solarCapacity: number;
  monthsAgo: number;
  phone?: string;
  lat: number;
  lng: number;
  isRequest?: boolean;
}

export interface MapOffice {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface Props {
  sites: MapSite[];
  offices: MapOffice[];
  selected: Set<string>;
  skipped?: Set<string>;
  skippedDetails?: Record<string, { reason?: string; by?: string; at?: string; planNo?: string; planId?: string }>;
  onToggle: (id: string) => void;
  onSelectBulk?: (ids: Set<string>) => void;
  isDark?: boolean;
}

function urgencyColor(months: number, isRequest?: boolean): string {
  if (isRequest) return "#8b5cf6"; // Violet for requests
  if (months > 18) return "#ef4444";
  if (months > 12) return "#f97316";
  if (months > 6)  return "#f59e0b";
  return "#22c55e";
}

// Adds native Leaflet zoom control at bottomright AFTER the map is fully ready.
// Using <ZoomControl position="bottomright" /> causes a _controlCorners timing error
// because react-leaflet renders it before Leaflet has initialised all control corners.
function ZoomBottomRight() {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control.zoom({ position: "bottomright" });
    ctrl.addTo(map);
    return () => { try { ctrl.remove(); } catch {} };
  }, [map]);
  return null;
}

function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (coords.length > 0 && !fitted.current) {
      fitted.current = true;
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [coords.length, map]);
  return null;
}

const officeIcon = (name: string) =>
  L.divIcon({
    className: "",
    html: `<div title="${name}" style="
      width:20px;height:20px;background:#1d4ed8;border:2.5px solid #fff;
      border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:900;color:#fff;cursor:default;">✦</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

function RecenterControl() {
  const map = useMap();
  return (
    <div className="absolute bottom-[84px] right-[10px] z-[1000] pointer-events-auto">
      <button
        title="Recenter map to Sri Lanka"
        onClick={(e) => {
          e.preventDefault();
          map.flyTo([7.8731, 80.7718], 8, { duration: 1.5 });
        }}
        className="w-8 h-8 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-md flex items-center justify-center text-lg hover:bg-gray-50 transition-colors"
      >
        📍
      </button>
    </div>
  );
}

export default function ServiceMap({ sites, offices, selected, skipped, skippedDetails, onToggle, onSelectBulk, isDark = false }: Props) {
  const [legendFilter, setLegendFilter] = useState<string | null>(null);

  const filteredSites = legendFilter
    ? sites.filter(site => {
        const isSkipped = skipped?.has(site.id) || skipped?.has(site.projectNo);
        if (legendFilter === "Skipped / Deferred") {
          return isSkipped;
        }
        if (legendFilter === "Service Request") {
          return site.isRequest && !isSkipped;
        }
        // Urgent maintenance categories (by months range)
        const matchingLegend = [
          { label: "> 18 months", range: [18, Infinity] },
          { label: "12–18 months", range: [12, 18] },
          { label: "6–12 months", range: [6, 12] },
        ].find(l => l.label === legendFilter);

        if (matchingLegend) {
          const [min, max] = matchingLegend.range;
          return !site.isRequest && !isSkipped && site.monthsAgo > min && site.monthsAgo <= max;
        }
        return true;
      })
    : sites;

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  const allCoords: [number, number][] = [
    ...filteredSites.map(s => [s.lat, s.lng] as [number, number]),
    ...offices.map(o => [o.lat, o.lng] as [number, number]),
  ];

  return (
    <MapContainer
      center={[7.8731, 80.7718]}
      zoom={8}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <ZoomBottomRight />
      <RecenterControl />
      <TileLayer
        url={tileUrl}
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
      />

      {allCoords.length > 0 && <FitBounds coords={allCoords} />}

      {offices.map(o => (
        <Marker key={o.id} position={[o.lat, o.lng]} icon={officeIcon(o.name)}>
          <Tooltip direction="top" offset={[0, -12]} opacity={1}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>🏢 {o.name}</div>
          </Tooltip>
        </Marker>
      ))}

      {/* Legend */}
      <div 
        className="absolute bottom-4 left-4 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2.5 shadow-lg flex flex-col gap-1 min-w-[150px]" 
        style={{ pointerEvents: 'auto' }}
      >
        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5 px-1 select-none flex items-center justify-between gap-3">
          <span>Map Legend</span>
          {legendFilter && (
            <button 
              onClick={(e) => { e.stopPropagation(); setLegendFilter(null); }}
              className="text-[8px] font-black text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:underline cursor-pointer transition-all"
            >
              SHOW ALL
            </button>
          )}
        </p>
        {[
          { color: "#8b5cf6", label: "Service Request", isRequest: true },
          { color: "#ef4444", label: "> 18 months", range: [18, Infinity] as [number, number] },
          { color: "#f97316", label: "12–18 months", range: [12, 18] as [number, number] },
          { color: "#f59e0b", label: "6–12 months", range: [6, 12] as [number, number] },
          { color: "#38bdf8", label: "Skipped / Deferred", isDashed: true },
          { color: "#1d4ed8", label: "Office (✦)", isOffice: true },
        ].map(l => {
          const isInteractive = !l.isOffice && !!onSelectBulk;
          const isActive = legendFilter === l.label;
          return (
            <div
              key={l.label}
              onClick={() => {
                if (!isInteractive) return;
                
                if (isActive) {
                  // Toggle filter OFF
                  setLegendFilter(null);
                } else {
                  // Toggle filter ON
                  setLegendFilter(l.label);

                  // Set selection to only this group
                  const newSelection = new Set<string>();
                  sites.forEach(site => {
                    const isSkipped = skipped?.has(site.id) || skipped?.has(site.projectNo);
                    
                    if (l.isDashed) {
                      if (isSkipped) newSelection.add(site.id);
                    } else if (l.isRequest) {
                      if (site.isRequest && !isSkipped) newSelection.add(site.id);
                    } else if (l.range) {
                      const [min, max] = l.range;
                      if (!site.isRequest && !isSkipped && site.monthsAgo > min && site.monthsAgo <= max) {
                        newSelection.add(site.id);
                      }
                    }
                  });
                  onSelectBulk(newSelection);
                }
              }}
              title={isInteractive ? `Click to filter map and select '${l.label}' only` : undefined}
              className={cn(
                "flex items-center gap-2.5 px-2 py-1 rounded-md transition-all duration-200 select-none border border-transparent",
                isInteractive 
                  ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/60 active:scale-98" 
                  : "cursor-default",
                isActive && "bg-blue-500/10 border-blue-500/30 dark:bg-blue-500/20"
              )}
            >
              {l.isOffice
                ? <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[7px] font-black shrink-0 shadow-xs" style={{ background: l.color }}>✦</div>
                : l.isRequest
                ? <div className="w-3.5 h-3.5 flex items-center justify-center text-white text-[9px] shrink-0 rounded-md shadow-xs" style={{ background: l.color }}>🔧</div>
                : l.isDashed
                ? <div className="w-3.5 h-3.5 rounded-full shrink-0 border-2 shadow-xs" style={{ background: `${l.color}33`, borderColor: l.color }} />
                : <div className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs" style={{ background: l.color }} />
              }
              <span className={cn("text-[10.5px] font-semibold text-gray-600 dark:text-gray-400 flex-1", isActive && "font-extrabold text-blue-600 dark:text-blue-400")}>
                {l.label}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {filteredSites.map(site => {
        const isSelected = selected.has(site.id);
        const isSkipped  = skipped?.has(site.id) || skipped?.has(site.projectNo);
        const color = isSkipped ? "#38bdf8" : urgencyColor(site.monthsAgo, site.isRequest);
        return (
          <CircleMarker
            key={site.id}
            center={[site.lat, site.lng]}
            radius={isSelected ? 11 : isSkipped ? 7 : site.isRequest ? 8 : 7}
            pathOptions={{
              fillColor: color,
              fillOpacity: isSkipped ? 0.25 : 0.9,
              color: isSelected ? "#fff" : isSkipped ? "#0ea5e9" : color,
              weight: isSkipped ? 2 : isSelected ? 3 : 1,
              dashArray: isSkipped ? "4 3" : undefined,
            }}
            eventHandlers={{ click: () => onToggle(site.id) }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <div style={{ minWidth: 160, fontFamily: "inherit" }}>
                <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 2 }}>
                  {isSkipped && "⏭ Skipped: "}{site.isRequest && "🔧 Request: "}{site.customerName}
                </div>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>#{site.projectNo}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                  <span>⚡ {site.solarCapacity > 0 ? `${site.solarCapacity} kWp` : "—"}</span>
                  <span style={{ color: isSkipped ? "#0ea5e9" : color, fontWeight: 700 }}>
                    {isSkipped ? "Deferred / Skipped" : site.isRequest ? "Pending Request" : `🕐 ${site.monthsAgo}mo ago`}
                  </span>
                </div>
                {site.address && (
                  <div style={{ fontSize: 10, color: "#888", marginTop: 3, maxWidth: 200 }}>{site.address}</div>
                )}
                <div style={{ fontSize: 9, marginTop: 4, color: "#aaa", fontStyle: "italic" }}>
                  Click to {isSkipped ? "re-add to route" : selected.has(site.id) ? "deselect" : "select"} for route
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
