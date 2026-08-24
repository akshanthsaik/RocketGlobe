// src/hooks/useEntityLaunches.ts
import { useMemo } from "react";
import type { Launch } from "../lib/api";

type LaunchForeignKey = "pad_id" | "rocket_id" | "agency_id";

/**
 * All launches for one entity (a pad/rocket/agency), sorted newest-first and
 * split into upcoming vs. past relative to now. `now` is computed inside the
 * memo so the split is always consistent with the launches it was derived
 * from, rather than frozen at whatever `now` happened to be on first render.
 */
export function useEntityLaunches(
  allLaunches: Launch[],
  entityId: number,
  key: LaunchForeignKey,
) {
  const launches = useMemo(() => {
    return allLaunches
      .filter((l) => l[key] === entityId)
      .sort(
        (a, b) =>
          new Date(b.net || 0).getTime() - new Date(a.net || 0).getTime(),
      );
  }, [allLaunches, entityId, key]);

  return useMemo(() => {
    const now = new Date();
    const upcomingLaunches: Launch[] = [];
    const pastLaunches: Launch[] = [];
    for (const launch of launches) {
      if (!launch.net) continue;
      if (new Date(launch.net) > now) {
        upcomingLaunches.push(launch);
      } else {
        pastLaunches.push(launch);
      }
    }
    return { launches, upcomingLaunches, pastLaunches };
  }, [launches]);
}
