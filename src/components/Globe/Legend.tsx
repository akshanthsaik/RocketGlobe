// src/components/Globe/Legend.tsx
import type { CSSProperties } from "react";
import "./Legend.css";

interface LegendProps {
  mode: "launches" | "pads" | "rockets" | "agencies" | "heatmap" | "trajectories" | "timeline";
  timelineActive?: boolean;
}

export function Legend({ mode, timelineActive = false }: LegendProps) {
  if (mode === "heatmap" || mode === "agencies" || mode === "rockets") return null;

  const overlayStyle = {
    "--overlay-bottom-desktop": timelineActive
      ? "calc(var(--space-6) + var(--timeline-height))"
      : "var(--space-6)",
    "--overlay-bottom-mobile": timelineActive
      ? "calc(var(--space-4) + var(--timeline-height-mobile))"
      : "var(--space-4)",
  } as CSSProperties;

  return (
    <div className="globe-legend" style={overlayStyle}>
      <div className="legend-title">
        {mode === "trajectories" ? "Launch Status" : "Launch Activity"}
      </div>
      <div className="legend-items">
        {mode === "trajectories" ? (
          <>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#dde2ea" }}
              ></div>
              <span>Success</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#c8ced8" }}
              ></div>
              <span>Partial</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#b3bbc8" }}
              ></div>
              <span>Failure</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#98a2b2" }}
              ></div>
              <span>Unknown</span>
            </div>
          </>
        ) : (
          <>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#dde2ea" }}
              ></div>
              <span>100+ launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#c8ced8" }}
              ></div>
              <span>50-100 launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#b3bbc8" }}
              ></div>
              <span>20-50 launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#98a2b2" }}
              ></div>
              <span>1-20 launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#7f8899" }}
              ></div>
              <span>No launches</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
