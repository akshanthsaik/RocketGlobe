// src/components/Globe/Legend.tsx
import type { GlobeMode } from "../../store/launchStore";
import { PAD_TIERS, AGENCY_COUNTRY_TIERS } from "./padTiers";
import "./Legend.css";

interface LegendProps {
  mode: GlobeMode;
}

export function Legend({ mode }: LegendProps) {
  // Rockets mode draws no ramp at all - nothing on the globe there is
  // shaded by a scale a legend could explain.
  if (mode === "rockets") return null;

  if (mode === "agencies") {
    return (
      <div className="globe-legend">
        <div className="legend-title">Agencies headquartered, by country</div>
        <div className="legend-items">
          {AGENCY_COUNTRY_TIERS.map((tier) => (
            <div key={tier.label} className="legend-item">
              <span
                className="legend-swatch"
                style={{
                  width: "14px",
                  height: "14px",
                  background: tier.fill,
                  borderColor: tier.fill,
                }}
              />
              <span className="legend-label">{tier.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="globe-legend">
      <div className="legend-title">Pad activity: lifetime launches</div>
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
