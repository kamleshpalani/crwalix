"use client";

import { useEffect, useRef } from "react";

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  score: number | null;
  priorityTier: string | null;
  websiteStatus: string;
  city: string | null;
}

const TIER_COLOR: Record<string, string> = {
  HIGH: "#ef4444",
  CRITICAL: "#7c3aed",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
};

interface LeadMapClientProps {
  pins: MapPin[];
}

export default function LeadMapClient({ pins }: LeadMapClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (pins.length === 0) return;

    // Dynamic import so SSR doesn't blow up
    import("leaflet").then((L) => {
      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center: [number, number] = [
        pins.reduce((s, p) => s + p.lat, 0) / pins.length,
        pins.reduce((s, p) => s + p.lng, 0) / pins.length,
      ];

      const map = L.map(containerRef.current!).setView(center, 10);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      pins.forEach((pin) => {
        const color = TIER_COLOR[pin.priorityTier ?? "LOW"] ?? "#94a3b8";
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${color};border:2px solid #fff;
            box-shadow:0 1px 4px rgba(0,0,0,.4)">
          </div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker([pin.lat, pin.lng], { icon });
        marker.bindPopup(`
          <div style="min-width:180px;font-size:13px;line-height:1.5">
            <strong>${pin.name}</strong><br/>
            ${pin.city ? `<span style="color:#64748b">${pin.city}</span><br/>` : ""}
            ${pin.score !== null ? `Score: <b>${pin.score}</b> · ` : ""}
            ${pin.priorityTier ?? ""}
            <br/><a href="/leads/${pin.id}" style="color:#6366f1">View lead →</a>
          </div>
        `);
        marker.addTo(map);
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pins.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-white/60 bg-white/40 text-sm text-ink-500">
        No leads with coordinates match the current filter.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[540px] w-full overflow-hidden rounded-xl border border-white/60 shadow-sm"
    />
  );
}
