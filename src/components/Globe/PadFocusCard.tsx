// src/components/Globe/PadFocusCard.tsx
import "./PadFocusCard.css";

interface PadFocusCardProps {
  padName: string;
  agencyName: string | null;
}

/**
 * Shown for the duration of a pad-focus flyTo, in the same slot PadInsetView
 * takes over once the flight lands — so the transition reads as "arriving"
 * then "arrived" in one place, instead of the flight ending on an empty globe
 * with no indication of what it was headed toward.
 */
export function PadFocusCard({ padName, agencyName }: PadFocusCardProps) {
  return (
    <div className="pad-focus-card" role="status" aria-live="polite">
      <div className="pad-focus-kicker">Focusing</div>
      <div className="pad-focus-name">{padName}</div>
      {agencyName && <div className="pad-focus-agency">{agencyName}</div>}
    </div>
  );
}
