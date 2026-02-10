// src/components/Globe/Legend.tsx
import "./Legend.css";

interface LegendProps {
  mode: "launches" | "pads" | "rockets" | "agencies" | "heatmap" | "trajectories" | "timeline";
}

export function Legend({ mode }: LegendProps) {
  if (mode === "heatmap" || mode === "agencies" || mode === "rockets") return null;

  return (
    <div className="globe-legend">
      <div className="legend-title">
        {mode === "trajectories" ? "Launch Status" : "Launch Activity"}
      </div>
      <div className="legend-items">
        {mode === "trajectories" ? (
          <>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#00ff00" }}
              ></div>
              <span>Success</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#ffff00" }}
              ></div>
              <span>Partial</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#ff0000" }}
              ></div>
              <span>Failure</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#00ffff" }}
              ></div>
              <span>Unknown</span>
            </div>
          </>
        ) : (
          <>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#00ff00" }}
              ></div>
              <span>100+ launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#ffff00" }}
              ></div>
              <span>50-100 launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#ffa500" }}
              ></div>
              <span>20-50 launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#00ffff" }}
              ></div>
              <span>1-20 launches</span>
            </div>
            <div className="legend-item">
              <div
                className="legend-color"
                style={{ background: "#808080" }}
              ></div>
              <span>No launches</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
