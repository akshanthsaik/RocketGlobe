// src/hooks/useEntityLaunchCounts.ts
import { useMemo } from "react";
import type { Launch } from "../lib/api";

type LaunchForeignKey = "pad_id" | "rocket_id" | "agency_id";

/** Number of launches per entity id, keyed by one of Launch's foreign keys. */
export function useEntityLaunchCounts(
  launches: Launch[],
  key: LaunchForeignKey,
): Map<number, number> {
  return useMemo(() => {
    const counts = new Map<number, number>();
    for (const launch of launches) {
      const id = launch[key];
      if (id == null) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [launches, key]);
}
