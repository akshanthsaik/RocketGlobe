// src/components/Globe/padTiers.ts

/**
 * The pad-activity ramp.
 *
 * Shared by the Cesium marker styling and the Legend so the swatches and the
 * globe can never drift apart — they were previously two hand-kept lists.
 *
 * The last tier is deliberately *unfilled*. A never-flown pad used to be drawn
 * in near-white, which made the quietest thing on the globe read as the
 * loudest; it is now an outline with nothing inside it.
 */
export const PAD_TIERS = [
  { min: 101, label: "100 or more", fill: "#ff563c", size: 20 },
  { min: 51, label: "50 to 99", fill: "#ec3013", size: 16 },
  { min: 21, label: "20 to 49", fill: "#ae1800", size: 13 },
  { min: 1, label: "1 to 19", fill: "#7c1405", size: 10 },
  { min: 0, label: "Never flown", fill: null, size: 8 },
] as const;

export type PadTier = (typeof PAD_TIERS)[number];

export function tierFor(launchCount: number): PadTier {
  return (
    PAD_TIERS.find((tier) => launchCount >= tier.min) ??
    PAD_TIERS[PAD_TIERS.length - 1]
  );
}
