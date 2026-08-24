// src/components/Globe/PadInsetView.tsx
import type { Launch, Pad } from "../../lib/api";
import { formatCoordinates, getCountryFlag } from "../../lib/utils";
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
 */
export function PadInsetView({ pad, launch }: PadInsetViewProps) {
  if (!pad) return null;

  return (
    <div className="pad-inset-view">
      <div className="inset-header">
        <div className="inset-kicker">
          {pad.country_code
            ? `${getCountryFlag(pad.country_code)}  ${pad.country_code}`
            : "Launch pad"}
        </div>
        <div className="inset-title">{pad.name}</div>
        <div className="inset-coords">
          {formatCoordinates(pad.latitude, pad.longitude)}
        </div>
      </div>

      <div className="inset-plot" aria-hidden="true">
        <div className="inset-plot-frame" />
        <div className="inset-plot-marker" />
      </div>

      {launch && <div className="inset-launch">{launch.name}</div>}
    </div>
  );
}
