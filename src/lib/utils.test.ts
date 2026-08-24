import { describe, it, expect } from "vitest";
import { getLaunchChip } from "./utils";

describe("getLaunchChip", () => {
  it("reads a qualified success as qualified, not as success or loss", () => {
    // "Success (Partial Failure)" contains all three of "success", "partial"
    // and "failure". Precedence order in the mapping is what keeps this right.
    const chip = getLaunchChip("Success (Partial Failure)");
    expect(chip.variant).toBe("qualified");
    expect(chip.label).toBe("Flew, qualified");
  });

  it("maps a plain partial failure to the same qualified variant", () => {
    expect(getLaunchChip("Partial Failure").variant).toBe("qualified");
  });

  it("maps outright failure to lost", () => {
    expect(getLaunchChip("Failure").variant).toBe("lost");
    expect(getLaunchChip("Failure").label).toBe("Lost");
  });

  it("maps a clean success to the quiet flew variant", () => {
    expect(getLaunchChip("Success").variant).toBe("flew");
    expect(getLaunchChip("Success").label).toBe("Flew");
  });

  it("maps both Go spellings to the confirmed variant", () => {
    expect(getLaunchChip("Go").variant).toBe("go");
    expect(getLaunchChip("Go for Launch").variant).toBe("go");
  });

  it("prefers hold over everything else", () => {
    expect(getLaunchChip("On Hold").variant).toBe("hold");
  });

  it("treats the to-be-determined family as pending", () => {
    for (const status of [
      "TBD",
      "TBC",
      "To Be Confirmed",
      "To Be Determined",
    ]) {
      expect(getLaunchChip(status).variant).toBe("pending");
    }
  });

  it("returns an unknown chip with no raw string when status is absent", () => {
    expect(getLaunchChip(null)).toEqual({
      label: "Unrecorded",
      variant: "unknown",
      raw: null,
    });
    expect(getLaunchChip(undefined).variant).toBe("unknown");
  });

  it("carries the feed's original string through for the tooltip", () => {
    expect(getLaunchChip("Success (Partial Failure)").raw).toBe(
      "Success (Partial Failure)",
    );
  });
});
