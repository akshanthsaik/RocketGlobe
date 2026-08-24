import { describe, it, expect } from "vitest";
import { PAD_TIERS, tierFor } from "./padTiers";

describe("tierFor", () => {
  it("keeps the original boundaries", () => {
    // The thresholds were > 100 / > 50 / > 20 / > 0 before being rewritten as
    // inclusive minimums; the edges have to land the same way.
    expect(tierFor(101).label).toBe("100 or more");
    expect(tierFor(100).label).toBe("50 to 99");
    expect(tierFor(51).label).toBe("50 to 99");
    expect(tierFor(50).label).toBe("20 to 49");
    expect(tierFor(21).label).toBe("20 to 49");
    expect(tierFor(20).label).toBe("1 to 19");
    expect(tierFor(1).label).toBe("1 to 19");
    expect(tierFor(0).label).toBe("Never flown");
  });

  it("leaves the never-flown tier unfilled", () => {
    // A never-flown pad used to be drawn in near-white, which made the
    // quietest thing on the globe read as the loudest.
    expect(tierFor(0).fill).toBeNull();
    expect(tierFor(1).fill).not.toBeNull();
  });

  it("gets quieter and smaller as activity falls", () => {
    const sizes = PAD_TIERS.map((tier) => tier.size);
    const descending = [...sizes].sort((a, b) => b - a);
    expect(sizes).toEqual(descending);
  });

  it("never returns undefined for a negative or absurd count", () => {
    expect(tierFor(-5).label).toBe("Never flown");
    expect(tierFor(1_000_000).label).toBe("100 or more");
  });
});
