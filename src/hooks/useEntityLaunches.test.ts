import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEntityLaunches } from "./useEntityLaunches";
import type { Launch } from "../lib/api";

const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

describe("useEntityLaunches", () => {
  it("splits an entity's launches into upcoming and past", () => {
    const launches: Launch[] = [
      { id: 1, name: "A", pad_id: 5, net: future },
      { id: 2, name: "B", pad_id: 5, net: past },
      { id: 3, name: "C", pad_id: 99, net: future }, // different pad, excluded
    ];
    const { result } = renderHook(() =>
      useEntityLaunches(launches, 5, "pad_id"),
    );
    expect(result.current.launches.map((l) => l.id)).toEqual([1, 2]);
    expect(result.current.upcomingLaunches.map((l) => l.id)).toEqual([1]);
    expect(result.current.pastLaunches.map((l) => l.id)).toEqual([2]);
  });
});
