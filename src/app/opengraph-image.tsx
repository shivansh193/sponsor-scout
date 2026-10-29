import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/examples";

export const alt = `${APP_NAME}: sponsor what your customers already love`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROWS = [
  ["Podcast", 85, 34],
  ["Creator", 81, 22],
  ["Artist", 77, 36],
] as const;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f6f3ec", color: "#1b1a17", padding: 72, fontFamily: "serif" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#1f5c4a", fontFamily: "sans-serif", fontWeight: 600 }}>{APP_NAME}</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, marginTop: 24, maxWidth: 900 }}>Sponsor what your customers already love.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "sans-serif" }}>
          {ROWS.map(([kind, aff, pop]) => (
            <div key={kind} style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 24 }}>
              <div style={{ width: 120, color: "#6b665c" }}>{kind}</div>
              <div style={{ display: "flex", width: 420, height: 14, background: "#e2ddd1", borderRadius: 7 }}>
                <div style={{ width: `${aff}%`, height: 14, background: "#1f5c4a", borderRadius: 7 }} />
              </div>
              <div style={{ display: "flex", width: 420, height: 14, background: "#e2ddd1", borderRadius: 7 }}>
                <div style={{ width: `${pop}%`, height: 14, background: "#8a8478", borderRadius: 7 }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 22, color: "#6b665c", marginTop: 8 }}>Ranked by affinity and value · taste data by Qloo</div>
        </div>
      </div>
    ),
    size,
  );
}
