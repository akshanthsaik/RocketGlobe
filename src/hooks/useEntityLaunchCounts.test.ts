import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEntityLaunchCounts } from "./useEntityLaunchCounts";
import type { Launch } from "../lib/api";

function launch(id: number, pad_id: number | null): Launch {
  return { id, name: `L${id}`, pad_id };
}

describe("useEntityLaunchCounts", () => {
  it("counts launches per entity id, skipping nulls", () => {
    const launches = [
      launch(1, 10),
      launch(2, 10),
      launch(3, 20),
      launch(4, null),
    ];
    const { result } = renderHook(() =>
      useEntityLaunchCounts(launches, "pad_id"),
    );
    expect(result.current.get(10)).toBe(2);
    expect(result.current.get(20)).toBe(1);
    expect(result.current.size).toBe(2);
  });
});
