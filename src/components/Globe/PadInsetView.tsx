// src/components/Globe/PadInsetView.tsx
import type { Launch, Pad } from "../../lib/api";
import { formatCoordinates, getCountryLabel } from "../../lib/utils";
import { tierFor } from "./padTiers";
import "./PadInsetView.css";

interface PadInsetViewProps {
  pad?: Pad | null;
  launch?: Launch | null;
}

/**
 * Close-up card for the selected launch's pad.
 *
 * This was a second live Cesium viewer, which put the app at the practical
 * limit of two WebGL contexts and spent a full 3D scene on a fixed, 800m-high
 * shot that never moved. It is now a schematic: the same information — where
 * this is and what is flying from it — drawn as a panel.
 *
 * The marker reuses the same activity-tier ramp as the globe markers and the
 * Legend (padTiers.ts), rather than a fixed dot — a quiet pad and a busy pad
 * should not look identical here when they don't anywhere else on the globe.
 */
export function PadInsetView({ pad, launch }: PadInsetViewProps) {
  if (!pad) return null;

  const tier = tierFor(pad.total_launch_count);

  return (
    <div className="pad-inset-view">
      <div className="inset-header">
        <div className="inset-kicker">
          {pad.country_code ? getCountryLabel(pad.country_code) : "Launch pad"}
        </div>
        <div className="inset-title">{pad.name}</div>
        <div className="inset-coords">
          {formatCoordinates(pad.latitude, pad.longitude)}
        </div>
      </div>

      <div className="inset-plot" aria-hidden="true">
        <div className="inset-plot-frame" />
        <div className="inset-plot-crosshair-h" />
        <div className="inset-plot-crosshair-v" />
        <div
          className="inset-plot-marker"
          style={{
            width: `${tier.size}px`,
            height: `${tier.size}px`,
            marginLeft: `${-tier.size / 2}px`,
            marginTop: `${-tier.size / 2}px`,
            background: tier.fill ?? "transparent",
            borderColor: tier.fill ?? "var(--color-neutral-700)",
            boxShadow: tier.fill ? `0 0 0 6px ${tier.fill}38` : "none",
          }}
        />
      </div>

      <div className="inset-activity">
        {pad.total_launch_count.toLocaleString()}{" "}
        {pad.total_launch_count === 1 ? "launch" : "launches"} · {tier.label}
      </div>

      {launch && <div className="inset-launch">{launch.name}</div>}
    </div>
  );
}
