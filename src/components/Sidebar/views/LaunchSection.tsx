// src/components/Sidebar/views/LaunchSection.tsx
import { useLaunchStore } from "../../../store/launchStore";
import { usePaginatedList } from "../../../hooks/usePaginatedList";
import { LaunchCard } from "../cards/LaunchCard";
import type { Launch } from "../../../lib/api";

const PAGE_SIZE = 10;

interface LaunchSectionProps {
  title: string;
  launches: Launch[];
}

/**
 * A titled run of launch cards inside a detail view.
 *
 * Detail views used to hard-cap these at ten with no way to reach the rest,
 * even though every launch is already in memory. The cap is now a page size
 * with a control attached to it.
 */
export function LaunchSection({ title, launches }: LaunchSectionProps) {
  const selectLaunch = useLaunchStore((state) => state.selectLaunch);
  const pads = useLaunchStore((state) => state.pads);
  const rockets = useLaunchStore((state) => state.rockets);
  const agencies = useLaunchStore((state) => state.agencies);

  const { visibleItems, canLoadMore, loadMore } = usePaginatedList(
    launches,
    PAGE_SIZE,
  );

  if (launches.length === 0) return null;

  const remaining = launches.length - visibleItems.length;

  return (
    <section className="view-section">
      <div className="view-section-header">
        <h3 className="view-section-title">{title}</h3>
        <span className="view-section-count">{launches.length}</span>
      </div>

      <div>
        {visibleItems.map((launch) => (
          <LaunchCard
            key={launch.id}
            launch={launch}
            pad={pads.find((p) => p.id === launch.pad_id)}
            rocket={rockets.find((r) => r.id === launch.rocket_id)}
            agency={agencies.find((a) => a.id === launch.agency_id)}
            onClick={() => selectLaunch(launch)}
          />
        ))}
      </div>

      {canLoadMore && (
        <button type="button" className="view-more-btn" onClick={loadMore}>
          Show {Math.min(remaining, PAGE_SIZE)} more
          <span className="view-more-rest">{remaining} left</span>
        </button>
      )}
    </section>
  );
}
