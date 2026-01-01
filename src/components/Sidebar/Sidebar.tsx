// src/components/Sidebar/Sidebar.tsx
import { useState, useRef, useEffect } from "react";
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

  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const currentView = sidebarViewStack[sidebarViewStack.length - 1];
  const showDetailView = currentView.type !== "launch-list";

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 320 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
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
    <aside
      ref={sidebarRef}
      className="sidebar"
      style={{ width: `${sidebarWidth}px` }}
    >
      <div className="sidebar-content">{renderContent()}</div>

      <div
        className="sidebar-resize-handle"
        onMouseDown={() => setIsResizing(true)}
      />
    </aside>
  );
}
