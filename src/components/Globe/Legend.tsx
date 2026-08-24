// src/components/Globe/Legend.tsx
import type { GlobeMode } from "../../store/launchStore";
import { PAD_TIERS } from "./padTiers";
import "./Legend.css";

interface LegendProps {
  mode: GlobeMode;
}

export function Legend({ mode }: LegendProps) {
  // The ramp only describes pad markers, which the rocket and agency modes
  // do not draw by activity.
  if (mode === "agencies" || mode === "rockets") return null;

  return (
    <div className="globe-legend">
      <div className="legend-title">Pad activity — lifetime launches</div>
      <div className="legend-items">
        {PAD_TIERS.map((tier) => (
          <div key={tier.label} className="legend-item">
            {/* Swatches carry each tier's real marker size, so the legend is a
                key to the globe rather than a colour chart beside it. */}
            <span
              className="legend-swatch"
              style={{
                width: `${tier.size}px`,
                height: `${tier.size}px`,
                background: tier.fill ?? "transparent",
                borderColor: tier.fill ?? "#605d5d",
              }}
            />
            <span className="legend-label">{tier.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
