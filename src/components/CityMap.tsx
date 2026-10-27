"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { CityResult } from "@/lib/types";

// Leaflet with OpenStreetMap tiles (no key). Heat layer from Qloo heatmap
// affinity; numbered markers for the top neighbourhoods; dots for partners.

export default function CityMap({ city }: { city: CityResult }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.heat");
      if (cancelled || !el.current) return;
      const pts = city.points;
      const center = city.center ?? (pts[0] ? [pts[0].lat, pts[0].lng] : [0, 0]);
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView(center as [number, number], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const heat = (L as unknown as { heatLayer: (p: [number, number, number][], o: object) => import("leaflet").Layer }).heatLayer(
        // affinity_rank cubed so the strongest areas stand out from the base level.
        pts.map((p) => [p.lat, p.lng, Math.max(0.02, p.affinityRank ** 3)]),
        { radius: 30, blur: 24, max: 1, maxZoom: 13, minOpacity: 0.3, gradient: { 0.2: "#3b7dd8", 0.45: "#3fae8a", 0.7: "#f0a35e", 1: "#c2410c" } },
      );
      heat.addTo(map);
      const bounds: [number, number][] = [];
      city.neighbourhoods.forEach((h, i) => {
        bounds.push([h.lat, h.lng]);
        L.marker([h.lat, h.lng], {
          icon: L.divIcon({ className: "", html: `<div style="background:#1f5c4a;color:#fff;border-radius:999px;width:22px;height:22px;display:grid;place-items:center;font:600 12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.3)">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        })
          .bindTooltip(`${h.name} · affinity rank ${Math.round(h.affinityRank * 100)}`)
          .addTo(map!);
      });
      city.partners.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        bounds.push([p.lat, p.lng]);
        L.circleMarker([p.lat, p.lng], { radius: 5, color: "#b4580f", weight: 2, fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(`${p.name} · affinity ${Math.round((p.affinity ?? 0) * 100)}`)
          .addTo(map!);
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [city]);

  return <div ref={el} className="h-[340px] w-full overflow-hidden rounded-lg border border-line lg:h-[460px]" role="img" aria-label={`Heatmap of ${city.query}`} />;
}
