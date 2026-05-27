"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

interface Office {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface Site {
  projectNo: string;
  customerName?: string;
  lat: number;
  lng: number;
  routeOrder?: number;
  siteStatus?: string;
}

interface Props {
  startOffice?: Office;
  endOffice?: Office;
  sites: Site[];
}

function makeLabel(text: string, color: string, ring: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:28px;height:28px;background:${color};border:2.5px solid ${ring};
      border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:900;color:#fff;white-space:nowrap;">
      ${text}
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (points.length > 0 && !fitted.current) {
      fitted.current = true;
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 14 });
    }
  }, [points.length, map]);
  return null;
}

export default function RouteMap({ startOffice, endOffice, sites }: Props) {
  const sorted = [...sites].sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));

  const allPoints: [number, number][] = [
    ...(startOffice?.lat ? [[startOffice.lat, startOffice.lng] as [number, number]] : []),
    ...sorted.map(s => [s.lat, s.lng] as [number, number]),
    ...(endOffice?.lat ? [[endOffice.lat, endOffice.lng] as [number, number]] : []),
  ];

  const sameOffice = startOffice && endOffice && startOffice.id === endOffice.id;

  return (
    <MapContainer
      center={[7.8731, 80.7718]}
      zoom={8}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      {allPoints.length > 1 && <FitAll points={allPoints} />}

      {/* Route line */}
      {allPoints.length > 1 && (
        <Polyline
          positions={allPoints}
          pathOptions={{ color: "#3b82f6", weight: 2.5, opacity: 0.7, dashArray: "6 4" }}
        />
      )}

      {/* Start office */}
      {startOffice?.lat && (
        <Marker position={[startOffice.lat, startOffice.lng]} icon={makeLabel("S", "#2563eb", "#1e40af")}>
          <Tooltip direction="top" offset={[0, -14]} opacity={1} permanent={false}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>🏢 {startOffice.name} (Start)</span>
          </Tooltip>
        </Marker>
      )}

      {/* Site markers */}
      {sorted.map((site, idx) => {
        const isSkipped = site.siteStatus === "skipped";
        const isCompleted = site.siteStatus === "completed";
        const color = isSkipped ? "#38bdf8" : isCompleted ? "#10b981" : "#6366f1"; // Light blue if skipped, green if completed, indigo if pending
        const ring = isSkipped ? "#0284c7" : isCompleted ? "#059669" : "#4338ca";
        return (
          <Marker
            key={site.projectNo}
            position={[site.lat, site.lng]}
            icon={makeLabel(String(idx + 1), color, ring)}
          >
            <Tooltip direction="top" offset={[0, -14]} opacity={1} permanent={false}>
              <div style={{ fontSize: 11 }}>
                <div style={{ fontWeight: 800 }}>#{site.projectNo} {isSkipped ? "(Skipped)" : ""}</div>
                {site.customerName && <div style={{ color: "#666" }}>{site.customerName}</div>}
              </div>
            </Tooltip>
          </Marker>
        );
      })}

      {/* End office — only if different from start */}
      {endOffice?.lat && !sameOffice && (
        <Marker position={[endOffice.lat, endOffice.lng]} icon={makeLabel("E", "#059669", "#047857")}>
          <Tooltip direction="top" offset={[0, -14]} opacity={1} permanent={false}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>🏢 {endOffice.name} (End)</span>
          </Tooltip>
        </Marker>
      )}

      {/* If same office, show S/E split marker */}
      {endOffice?.lat && sameOffice && (
        <Marker position={[endOffice.lat, endOffice.lng]} icon={makeLabel("S/E", "#7c3aed", "#5b21b6")}>
          <Tooltip direction="top" offset={[0, -14]} opacity={1} permanent={false}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>🏢 {endOffice.name} (Start &amp; End)</span>
          </Tooltip>
        </Marker>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 backdrop-blur border border-gray-200 rounded px-2 py-1.5 shadow flex flex-col gap-1 text-[9px] font-bold pointer-events-auto">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981]" /> Completed</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#6366f1]" /> Pending</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" /> Skipped</div>
      </div>
    </MapContainer>
  );
}
