// src/components/Sidebar/Sidebar.tsx
import { useState, useRef, useEffect, useMemo } from "react";
import { useLaunchStore } from "../../store/launchStore";
import { LaunchDetailView } from "./views/LaunchDetailView";
import { PadDetailView } from "./views/PadDetailView";
import { RocketDetailView } from "./views/RocketDetailView";
import { AgencyDetailView } from "./views/AgencyDetailView";
import { LaunchTab } from "./tabs/LaunchTab";
import { PadsTab } from "./tabs/PadsTab";
import { RocketsTab } from "./tabs/RocketsTab";
import { AgenciesTab } from "./tabs/AgenciesTab";
import "./Sidebar.css";

export function Sidebar() {
  const globeMode = useLaunchStore((state) => state.globeMode);
  const sidebarViewStack = useLaunchStore((state) => state.sidebarViewStack);
  const selectedLaunch = useLaunchStore((state) => state.selectedLaunch);
  const selectedPad = useLaunchStore((state) => state.selectedPad);
  const selectedRocket = useLaunchStore((state) => state.selectedRocket);
  const selectedAgency = useLaunchStore((state) => state.selectedAgency);
  const sidebarOpen = useLaunchStore((state) => state.sidebarOpen);
  const toggleSidebar = useLaunchStore((state) => state.toggleSidebar);
  const popSidebarView = useLaunchStore((state) => state.popSidebarView);

  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizeRaf = useRef<number | null>(null);

  const currentView = sidebarViewStack[sidebarViewStack.length - 1];
  const showDetailView = currentView.type !== "launch-list";

  const breadcrumbItems = useMemo(() => {
    return sidebarViewStack.map((view, index) => {
      let label = "Launches";
      if (view.type === "launch-detail") {
        label = view.data?.name || selectedLaunch?.name || "Launch";
      } else if (view.type === "pad-detail") {
        label = view.data?.name || selectedPad?.name || "Pads";
      } else if (view.type === "rocket-detail") {
        label =
          view.data?.full_name ||
          view.data?.name ||
          selectedRocket?.full_name ||
          selectedRocket?.name ||
          "Rockets";
      } else if (view.type === "agency-detail") {
        label = view.data?.name || selectedAgency?.name || "Agencies";
      } else if (view.type === "launch-list") {
        label = "Launches";
      }

      return {
        label,
        index,
      };
    });
  }, [
    sidebarViewStack,
    selectedLaunch,
    selectedPad,
    selectedRocket,
    selectedAgency,
  ]);

  const handleBreadcrumbClick = (index: number) => {
    const steps = sidebarViewStack.length - 1 - index;
    for (let i = 0; i < steps; i += 1) {
      popSidebarView();
    }
  };

  // Track mobile state for responsive sidebar sizing
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 767px)");

    const handleChange = () => {
      setIsMobile(media.matches);
      if (media.matches) {
        setIsResizing(false);
      }
    };

    handleChange();
    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile, sidebarOpen, toggleSidebar]);

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      if (resizeRaf.current !== null) return;
      const nextWidth = e.clientX;
      resizeRaf.current = window.requestAnimationFrame(() => {
        resizeRaf.current = null;
        if (nextWidth >= 320 && nextWidth <= 600) {
          setSidebarWidth(nextWidth);
        }
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (resizeRaf.current !== null) {
        window.cancelAnimationFrame(resizeRaf.current);
        resizeRaf.current = null;
      }
    };
  }, [isResizing]);

  if (!sidebarOpen) return null;

  const renderContent = () => {
    // Detail views have priority over tabs
    if (showDetailView) {
      switch (currentView.type) {
        case "launch-detail":
          return selectedLaunch ? (
            <LaunchDetailView launch={selectedLaunch} />
          ) : (
            <LaunchTab />
          );
        case "pad-detail":
          return selectedPad ? (
            <PadDetailView pad={selectedPad} />
          ) : (
            <PadsTab />
          );
        case "rocket-detail":
          return selectedRocket ? (
            <RocketDetailView rocket={selectedRocket} />
          ) : (
            <RocketsTab />
          );
        case "agency-detail":
          return selectedAgency ? (
            <AgencyDetailView agency={selectedAgency} />
          ) : (
            <AgenciesTab />
          );
        default:
          return <LaunchTab />;
      }
    }

    // Base mode: follow globeMode set from header
    switch (globeMode) {
      case "launches":
        return <LaunchTab />;
      case "pads":
        return <PadsTab />;
      case "rockets":
        return <RocketsTab />;
      case "agencies":
        return <AgenciesTab />;
      default:
        return <LaunchTab />;
    }
  };

  return (
    <>
      {isMobile && (
        <div
          className="sidebar-backdrop visible"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}
      <aside
        ref={sidebarRef}
        className={`sidebar ${sidebarOpen ? "open" : ""}`}
        style={isMobile ? undefined : { width: `${sidebarWidth}px` }}
        aria-label="Sidebar"
      >
        <div className="sidebar-breadcrumbs" aria-label="Sidebar breadcrumbs">
          {breadcrumbItems.map((item, index) => {
            const isCurrent = index === breadcrumbItems.length - 1;
            return (
              <div className="breadcrumb-item" key={`${item.label}-${index}`}>
                <button
                  className={`breadcrumb-btn ${isCurrent ? "current" : ""}`}
                  onClick={() => handleBreadcrumbClick(index)}
                  disabled={isCurrent}
                  title={item.label}
                  type="button"
                >
                  {item.label}
                </button>
                {!isCurrent && (
                  <span className="breadcrumb-separator">/</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="sidebar-content">{renderContent()}</div>

        <div
          className="sidebar-resize-handle"
          onMouseDown={() => setIsResizing(true)}
          aria-hidden="true"
        />
      </aside>
    </>
  );
}
