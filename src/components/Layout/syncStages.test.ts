import { describe, it, expect } from "vitest";
import { deriveStages } from "./syncStages";
import type { SyncRun } from "../../lib/api";

function run(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    run_id: "r1",
    status: "running",
    is_active: true,
    current_resource: null,
    progress_done: 0,
    progress_total: 4,
    stats: {},
    message: null,
    error: null,
    started_at: null,
    updated_at: null,
    finished_at: null,
    ...overrides,
  };
}

const stateOf = (stages: ReturnType<typeof deriveStages>, name: string) =>
  stages.find((s) => s.name === name)!;

describe("deriveStages", () => {
  it("splits the sequence around the running resource", () => {
    const stages = deriveStages(
      run({ current_resource: "pads", stats: { agencies: 12 } }),
    );

    expect(stages.map((s) => s.name)).toEqual([
      "agencies",
      "pads",
      "rockets",
      "launches",
    ]);
    expect(stateOf(stages, "agencies").state).toBe("done");
    expect(stateOf(stages, "pads").state).toBe("active");
    expect(stateOf(stages, "rockets").state).toBe("pending");
    expect(stateOf(stages, "launches").state).toBe("pending");
  });

  it("marks everything done once the run is no longer active", () => {
    const stages = deriveStages(
      run({
        is_active: false,
        status: "success",
        current_resource: "launches",
        stats: { agencies: 3, pads: 0, rockets: 5, launches: 210 },
      }),
    );
    expect(stages.every((s) => s.state === "done")).toBe(true);
  });

  it("reports a skipped resource as already current, not as done", () => {
    const stages = deriveStages(
      run({ current_resource: "launches", stats: { _skipped: ["agencies"] } }),
    );
    expect(stateOf(stages, "agencies").state).toBe("skipped");
    expect(stateOf(stages, "agencies").detail).toBe("Already current");
  });

  it("matches a skip recorded with a reason suffix", () => {
    // The worker writes entries like "launches:rate_limit_cooldown".
    const stages = deriveStages(
      run({ stats: { _skipped: ["launches:rate_limit_cooldown"] } }),
    );
    expect(stateOf(stages, "launches").state).toBe("skipped");
  });

  it("surfaces a rate-limited resource with its retry window", () => {
    const stages = deriveStages(
      run({ stats: { _rate_limited: { launches: 300 } } }),
    );
    expect(stateOf(stages, "launches").state).toBe("blocked");
    expect(stateOf(stages, "launches").detail).toBe("Retry in 5 min");
  });

  it("prefers rate-limited over skipped when both are recorded", () => {
    // A rate-limited resource is also written to _skipped, and the throttle is
    // the actionable half of that pair.
    const stages = deriveStages(
      run({
        stats: {
          _skipped: ["launches:rate_limited"],
          _rate_limited: { launches: 45 },
        },
      }),
    );
    expect(stateOf(stages, "launches").state).toBe("blocked");
    expect(stateOf(stages, "launches").detail).toBe("Retry in 45s");
  });

  it("distinguishes no changes from a count", () => {
    const stages = deriveStages(
      run({ is_active: false, stats: { agencies: 0, pads: 7 } }),
    );
    expect(stateOf(stages, "agencies").detail).toBe("No changes");
    expect(stateOf(stages, "pads").detail).toBe("7 updated");
  });

  it("treats a queued run with no current resource as all pending", () => {
    const stages = deriveStages(run({ status: "queued" }));
    expect(stages.every((s) => s.state === "pending")).toBe(true);
  });

  it("tolerates a null stats payload", () => {
    const stages = deriveStages(run({ stats: null }));
    expect(stages).toHaveLength(4);
    expect(stages.every((s) => s.state === "pending")).toBe(true);
  });
});
