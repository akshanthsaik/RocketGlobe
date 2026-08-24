// src/components/Layout/syncStages.ts
import { SYNC_STAGES, type SyncRun, type SyncStage } from "../../lib/api";

export type StageState = "done" | "active" | "pending" | "skipped" | "blocked";

export interface Stage {
  name: SyncStage;
  label: string;
  state: StageState;
  detail: string;
}

const STAGE_LABELS: Record<SyncStage, string> = {
  agencies: "Agencies",
  pads: "Pads",
  rockets: "Rockets",
  launches: "Launches",
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} hr`;
}

/**
 * Turn one run into four stage cells.
 *
 * The backend reports `current_resource` and per-resource counts on every
 * poll; before this the UI discarded both and showed a spinning icon for what
 * can be a ten-minute operation.
 */
export function deriveStages(run: SyncRun): Stage[] {
  const stats = run.stats ?? {};
  const skipped = Array.isArray(stats._skipped)
    ? (stats._skipped as string[])
    : [];
  const rateLimited =
    stats._rate_limited && typeof stats._rate_limited === "object"
      ? (stats._rate_limited as Record<string, unknown>)
      : {};

  const currentIndex = run.current_resource
    ? SYNC_STAGES.indexOf(run.current_resource as SyncStage)
    : -1;
  const finished = !run.is_active;

  return SYNC_STAGES.map((name, index) => {
    const count = asNumber(stats[name]);
    const wait = asNumber(rateLimited[name]);
    // Skips are recorded as either the bare name or "name:reason".
    const wasSkipped = skipped.some(
      (entry) => entry === name || entry.startsWith(`${name}:`),
    );

    let state: StageState;
    if (wait != null) state = "blocked";
    else if (wasSkipped) state = "skipped";
    else if (finished) state = "done";
    else if (index < currentIndex) state = "done";
    else if (index === currentIndex) state = "active";
    else state = "pending";

    let detail: string;
    if (state === "blocked") {
      detail = wait != null ? `Retry in ${formatWait(wait)}` : "Rate limited";
    } else if (state === "skipped") {
      detail = "Already current";
    } else if (state === "active") {
      detail = count != null && count > 0 ? `${count} so far` : "Working";
    } else if (state === "done") {
      if (count == null) detail = "Done";
      else detail = count === 0 ? "No changes" : `${count} updated`;
    } else {
      detail = "Waiting";
    }

    return { name, label: STAGE_LABELS[name], state, detail };
  });
}
