// src/components/Layout/SyncStrip.tsx
import { useMemo } from "react";
import type { SyncRun } from "../../lib/api";
import { deriveStages } from "./syncStages";
import "./SyncStrip.css";

interface SyncStripProps {
  run: SyncRun;
}

export function SyncStrip({ run }: SyncStripProps) {
  const stages = useMemo(() => deriveStages(run), [run]);

  const queued = run.status === "queued";
  const heading = queued ? "Starting sync" : "Syncing from Launch Library 2";

  const note =
    run.message ??
    (queued
      ? "Waiting for the worker to pick this up."
      : "This runs in the background — the app stays usable while it works.");

  return (
    <div className="sync-strip" role="status" aria-live="polite">
      <div className="sync-strip-head">
        <div className="sync-strip-kicker">
          {queued ? "Queued" : "In progress"}
        </div>
        <div className="sync-strip-title">{heading}</div>
      </div>

      <ol className="sync-strip-stages">
        {stages.map((stage) => (
          <li
            key={stage.name}
            className={`sync-stage sync-stage-${stage.state}`}
            aria-current={stage.state === "active" ? "step" : undefined}
          >
            <div className="sync-stage-name">{stage.label}</div>
            <div className="sync-stage-detail">{stage.detail}</div>
          </li>
        ))}
      </ol>

      <p className="sync-strip-note">{note}</p>
    </div>
  );
}
