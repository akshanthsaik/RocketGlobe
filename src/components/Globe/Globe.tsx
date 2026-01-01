// src/components/Globe/Globe.tsx
import { useEffect, useRef, useState, useMemo } from "react";
import * as Cesium from "cesium";
import {
  useLaunchStore,
  getActiveLaunches,
  getLaunchesForRocket,
  getLaunchesForAgency,
  getTimelineLaunchesForGlobe,
} from "../../store/launchStore";
import "./Globe.css";
import { Legend } from "./Legend";
import { PadInsetView } from "./PadInsetView";

Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5ZTAwNzk4ZS0zYzUwLTQzMzItYmYzNi1iOWIyZjU1ODg3ZmEiLCJpZCI6MzY3ODk4LCJpYXQiOjE3NjUyNjA2OTl9.NKrR0XhbDD_R8dyteyC6srb_Bxi4BHEMOib7O5CHa0s";

export function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const countriesRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const cameraFlyToRef = useRef<boolean>(false);
  const lastTimelineDateRef = useRef<Date | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  // Store slices
  const pads = useLaunchStore((state) => state.pads);
  const launches = useLaunchStore((state) => state.launches);
  const agencies = useLaunchStore((state) => state.agencies);
  const rockets = useLaunchStore((state) => state.rockets);

  const selectedLaunch = useLaunchStore((state) => state.selectedLaunch);
  const selectedRocket = useLaunchStore((state) => state.selectedRocket);
  const selectedAgency = useLaunchStore((state) => state.selectedAgency);

  const timelineDate = useLaunchStore((state) => state.timelineDate);
  const timelineEnabled = useLaunchStore((s) => s.timelineEnabled);
  const isTimelinePlaying = useLaunchStore((state) => state.isTimelinePlaying);

  const globeMode = useLaunchStore((state) => state.globeMode);
  const isLoading = useLaunchStore((state) => state.isLoading);
  const sidebarOpen = useLaunchStore((state) => state.sidebarOpen);

  const launchTab = useLaunchStore((s) => s.launchTab);
  const searchQuery = useLaunchStore((s) => s.searchQuery);
  const statusFilter = useLaunchStore((s) => s.statusFilter);
  const agencyFilter = useLaunchStore((s) => s.agencyFilter);
  const rocketFilter = useLaunchStore((s) => s.rocketFilter);

  // Compute pads to show based on mode and filters
  const padsToShow = useMemo(() => {
    const state = useLaunchStore.getState();

    if (globeMode === "launches") {
      // WHEN TIMELINE IS ENABLED: Show all pads (they'll be colored based on activity)
      if (timelineEnabled) {
        return pads;
      }

      // WHEN TIMELINE IS DISABLED: Show only pads with active launches (original behavior)
      const launchesForPads = getActiveLaunches(state);
      const padIds = new Set(
        launchesForPads.map((l) => l.pad_id).filter((id): id is number => !!id)
      );
      return pads.filter((p) => padIds.has(p.id));
    }

    if (globeMode === "pads") return pads;

    if (globeMode === "rockets" && selectedRocket) {
      const rocketLaunches = getLaunchesForRocket(launches, selectedRocket.id);
      const padIds = new Set(
        rocketLaunches.map((l) => l.pad_id).filter((id): id is number => !!id)
      );
      return pads.filter((p) => padIds.has(p.id));
    }

    if (globeMode === "agencies" && selectedAgency) {
      const agencyLaunches = getLaunchesForAgency(launches, selectedAgency.id);
      const padIds = new Set(
        agencyLaunches.map((l) => l.pad_id).filter((id): id is number => !!id)
      );
      return pads.filter((p) => padIds.has(p.id));
    }

    return [] as typeof pads;
  }, [
    globeMode,
    pads,
    launches,
    selectedRocket,
    selectedAgency,
    timelineEnabled,
    launchTab,
    searchQuery,
    statusFilter,
    agencyFilter,
    rocketFilter,
  ]);

  // Check if container is ready
  useEffect(() => {
    if (!containerRef.current) return;

    const checkContainer = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setIsReady(true);
        } else {
          setTimeout(checkContainer, 100);
        }
      }
    };

    const timer = setTimeout(checkContainer, 50);
    return () => clearTimeout(timer);
  }, []);

  // Initialize Cesium viewer
  useEffect(() => {
    if (!isReady || !containerRef.current || viewerRef.current) return;

    let viewer: Cesium.Viewer | null = null;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const initializeViewer = async () => {
      try {
        if (!containerRef.current) throw new Error("Container lost");

        const terrainProvider = await Cesium.createWorldTerrainAsync();

        viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          shouldAnimate: false,
        });

        viewer.imageryLayers.removeAll();
        const imageryProvider = await Cesium.IonImageryProvider.fromAssetId(3); 
        viewer.imageryLayers.addImageryProvider(imageryProvider);

        viewer.scene.globe.enableLighting = false;
        if (viewer.scene.sun) viewer.scene.sun.show = false;
        if (viewer.scene.moon) viewer.scene.moon.show = false;

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 30, 20000000),
        });

        // Load countries GeoJSON for agency mode
        try {
          const countries = await Cesium.GeoJsonDataSource.load(
            "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
            {
              stroke: Cesium.Color.TRANSPARENT,
              fill: Cesium.Color.TRANSPARENT,
              clampToGround: true,
              markerColor: Cesium.Color.TRANSPARENT,
            }
          );

          // Process each entity safely
          countries.entities.values.forEach((entity) => {
            // Only process if it's actually a polygon
            if (entity.polygon) {
              try {
                entity.polygon.material = new Cesium.ColorMaterialProperty(
                  Cesium.Color.TRANSPARENT
                );
                entity.polygon.outline = new Cesium.ConstantProperty(false);
                entity.polygon.height = new Cesium.ConstantProperty(0);
                entity.polygon.extrudedHeight = new Cesium.ConstantProperty(0);
              } catch (e) {
                console.warn("Failed to configure entity:", entity.name, e);
              }
            }
          });

          await viewer.dataSources.add(countries);
          countriesRef.current = countries;
          console.log("✅ Countries loaded:", countries.entities.values.length);
        } catch (error) {
          console.warn("Failed to load countries GeoJSON:", error);
          countriesRef.current = null;
        }


        // Click handler for pads, agencies, and countries
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: any) => {
          const pickedObject = viewer!.scene.pick(movement.position);
          if (Cesium.defined(pickedObject) && pickedObject.id) {
            const entity = pickedObject.id;
            const entityType = entity.properties?.type?.getValue();

            if (entityType === "pad") {
              const padId = entity.properties?.padId?.getValue();
              if (padId) {
                useLaunchStore.getState().navigateToPad(padId);

                const position = entity.position?.getValue(
                  Cesium.JulianDate.now()
                );
                if (position) {
                  const cartographic =
                    Cesium.Cartographic.fromCartesian(position);
                  viewer!.camera.flyTo({
                    destination: Cesium.Cartesian3.fromRadians(
                      cartographic.longitude,
                      cartographic.latitude,
                      50000
                    ),
                    duration: 2,
                  });
                }
              }
            } else if (entityType === "agency") {
              const agencyId = entity.properties?.agencyId?.getValue();
              if (agencyId) {
                useLaunchStore.getState().navigateToAgency(agencyId);
              }
            } else if (entity.properties?.agencyCount) {
              // Clicked on a country with agencies
              const countryName = entity.properties?.ADMIN?.getValue() || "Unknown";
              const agencyCount = entity.properties?.agencyCount?.getValue();
              console.log(`${countryName}: ${agencyCount} agencies`);
              
              // Optional: You can add a toast notification or sidebar update here
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = viewer;
        handlerRef.current = handler;
        setViewerReady(true);
      } catch (error) {
        console.error("Failed to initialize Cesium viewer:", error);
        setIsReady(false);
      }
    };

    initializeViewer();

    return () => {
      if (handler && !handler.isDestroyed()) {
        handler.destroy();
        handlerRef.current = null;
      }
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
        viewerRef.current = null;
      }
      countriesRef.current = null;
      setViewerReady(false);
    };
  }, [isReady]);

  // Render entities (optimized to only update when necessary)
  useEffect(() => {
    if (!viewerReady || !viewerRef.current || isLoading) return;
    const viewer = viewerRef.current;

    // Clear all entities
    viewer.entities.removeAll();

    if (globeMode === "agencies") {
      // Highlight countries with agencies
      if (countriesRef.current) {
        const counts = getAgencyCountsByCountry(agencies);

        countriesRef.current.entities.values.forEach((entity) => {
          if (!entity.polygon) return;

          try {
            const iso2 = entity.properties?.ISO_A2?.getValue();
            
            if (!iso2) return;

            const count = counts.get(iso2);

            if (count && count > 0) {
              // Color based on number of agencies
              let color = Cesium.Color.BLUE.withAlpha(0.3);
              if (count > 10) color = Cesium.Color.PURPLE.withAlpha(0.5);
              else if (count > 5) color = Cesium.Color.CYAN.withAlpha(0.4);
              else if (count > 2) color = Cesium.Color.BLUE.withAlpha(0.35);

              entity.polygon.material = new Cesium.ColorMaterialProperty(color);
              entity.polygon.outline = new Cesium.ConstantProperty(true);
              entity.polygon.outlineColor = new Cesium.ConstantProperty(
                Cesium.Color.WHITE.withAlpha(0.6)
              );
              entity.polygon.outlineWidth = new Cesium.ConstantProperty(1);

              // Store count for click handler
              if (!entity.properties) {
                entity.properties = new Cesium.PropertyBag();
              }
              
              if (!entity.properties.hasProperty("agencyCount")) {
                entity.properties.addProperty("agencyCount", count);
              } else {
                entity.properties.agencyCount = count;
              }
            } else {
              // Hide countries with no agencies
              entity.polygon.material = new Cesium.ColorMaterialProperty(
                Cesium.Color.TRANSPARENT
              );
              entity.polygon.outline = new Cesium.ConstantProperty(false);
            }
          } catch (e) {
            console.warn("Failed to update country entity:", entity.name, e);
          }
        });
      }


      // Render agency markers on top
      renderAgencies(viewer, agencies);
      return;
    } else {
      // Hide country highlights in other modes
      if (countriesRef.current) {
        countriesRef.current.entities.values.forEach((entity) => {
          if (entity.polygon) {
            entity.polygon.material = new Cesium.ColorMaterialProperty(
              Cesium.Color.TRANSPARENT
            );
          }
        });
      }
    }

    const state = useLaunchStore.getState();
    const launchesForPads =
      globeMode === "launches"
        ? timelineEnabled
          ? getTimelineLaunchesForGlobe(state)
          : getActiveLaunches(state)
        : launches;

    const effectiveTimelineDate =
      globeMode === "launches" && timelineEnabled ? timelineDate : null;

    renderPads(viewer, padsToShow, launchesForPads, effectiveTimelineDate);
  }, [
    viewerReady,
    globeMode,
    padsToShow,
    launches,
    agencies,
    isLoading,
    timelineDate,
    timelineEnabled,
  ]);

  // Camera follow during timeline playback (debounced)
  useEffect(() => {
    if (
      !viewerRef.current ||
      !timelineEnabled ||
      !isTimelinePlaying ||
      !timelineDate ||
      globeMode !== "launches"
    ) {
      return;
    }

    // Debounce: only fly if timeline date changed significantly
    if (
      lastTimelineDateRef.current &&
      Math.abs(timelineDate.getTime() - lastTimelineDateRef.current.getTime()) <
        2000
    ) {
      return;
    }

    lastTimelineDateRef.current = timelineDate;

    const state = useLaunchStore.getState();
    const timelineLaunches = getTimelineLaunchesForGlobe(state);
    if (timelineLaunches.length === 0) return;

    const latest = timelineLaunches[timelineLaunches.length - 1];
    if (!latest.pad_id) return;

    const pad = pads.find((p) => p.id === latest.pad_id);
    if (!pad) return;

    const viewer = viewerRef.current;

    // Prevent multiple simultaneous flyTos
    if (cameraFlyToRef.current) return;
    cameraFlyToRef.current = true;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        75000 // Closer zoom for timeline mode
      ),
      duration: 1.5,
      complete: () => {
        cameraFlyToRef.current = false;
      },
      cancel: () => {
        cameraFlyToRef.current = false;
      },
    });
  }, [timelineDate, timelineEnabled, isTimelinePlaying, globeMode, pads]);

  // Highlight selected launch (manual click)
  useEffect(() => {
    if (!viewerRef.current || !selectedLaunch) return;

    const viewer = viewerRef.current;
    const pad = pads.find((p) => p.id === selectedLaunch.pad_id);
    if (!pad) return;

    const oldHighlight = viewer.entities.getById("highlight");
    if (oldHighlight) viewer.entities.remove(oldHighlight);

    viewer.entities.add({
      id: "highlight",
      position: Cesium.Cartesian3.fromDegrees(pad.longitude, pad.latitude),
      point: {
        pixelSize: 25,
        color: Cesium.Color.RED.withAlpha(0.9),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 4,
      },
    });

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        50000 // Close zoom for selected launch
      ),
      duration: 2,
    });

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        const highlight = viewer.entities.getById("highlight");
        if (highlight) viewer.entities.remove(highlight);
      }
    };
  }, [selectedLaunch, pads]);

  return (
    <div className={`globe-container ${!sidebarOpen ? "sidebar-closed" : ""}`}>
      <div ref={containerRef} className="cesium-viewer" />
      <Legend mode={globeMode} />

      {/* Inset close-up view */}
      {selectedLaunch && (
        <PadInsetView
          pad={pads.find((p) => p.id === selectedLaunch.pad_id)}
          launch={selectedLaunch}
        />
      )}

      {!viewerReady && (
        <div className="globe-loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Initializing globe...</div>
        </div>
      )}
    </div>
  );
}

// ===== HELPER FUNCTIONS =====

/**
 * Build a map of country code -> agency count
 */
function getAgencyCountsByCountry(agencies: any[]): Map<string, number> {
  const map = new Map<string, number>();

  agencies.forEach((a) => {
    if (!a.country_code || a.country_code === "???") return;
    
    // Use ISO 2-letter code (e.g., "US", "IN", "FR")
    const countryCode = a.country_code.toUpperCase();
    map.set(countryCode, (map.get(countryCode) || 0) + 1);
  });

  return map;
}

// ===== RENDERING FUNCTIONS =====

/**
 * Render launch pads on the globe with color coding based on launch count
 */
function renderPads(
  viewer: Cesium.Viewer,
  pads: any[],
  launches: any[],
  timelineDate: Date | null
) {
  pads.forEach((pad) => {
    const padLaunches = launches.filter((l: any) => l.pad_id === pad.id);

    const filteredLaunches = timelineDate
      ? padLaunches.filter((l: any) => l.net && new Date(l.net) <= timelineDate)
      : padLaunches;

    const launchCount = filteredLaunches.length;

    // Color coding based on launch count
    let color = Cesium.Color.GRAY.withAlpha(0.4); // Dimmed for inactive
    if (launchCount > 100) color = Cesium.Color.LIME.withAlpha(0.95);
    else if (launchCount > 50) color = Cesium.Color.YELLOW.withAlpha(0.95);
    else if (launchCount > 20) color = Cesium.Color.ORANGE.withAlpha(0.95);
    else if (launchCount > 0) color = Cesium.Color.CYAN.withAlpha(0.9);

    // Calculate pixel size based on launch count
    const baseSize = 8; // Smaller base for inactive pads
    const activeBaseSize = 12;
    const maxSize = 22;

    const pixelSize =
      launchCount > 0
        ? Math.min(activeBaseSize + launchCount / 15, maxSize)
        : baseSize;

    // Outline is more prominent for active pads
    const outlineWidth = launchCount > 0 ? 2 : 1;
    const outlineColor =
      launchCount > 0
        ? Cesium.Color.WHITE.withAlpha(0.9)
        : Cesium.Color.WHITE.withAlpha(0.4);

    viewer.entities.add({
      id: `pad-${pad.id}`,
      name: pad.name,
      position: Cesium.Cartesian3.fromDegrees(pad.longitude, pad.latitude),
      point: {
        pixelSize,
        color,
        outlineColor,
        outlineWidth
      },
      properties: {
        type: "pad",
        padId: pad.id,
        padName: pad.name,
        launchCount,
      },
    });
  });
}

/**
 * Render agencies on the globe with labels
 */
function renderAgencies(viewer: Cesium.Viewer, agencies: any[]) {
  const agenciesWithCoords = agencies.filter(
    (a: any) => a.latitude && a.longitude
  );

  agenciesWithCoords.forEach((agency: any) => {
    viewer.entities.add({
      id: `agency-${agency.id}`,
      name: agency.name,
      position: Cesium.Cartesian3.fromDegrees(
        agency.longitude,
        agency.latitude
      ),
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString("#3b82f6").withAlpha(0.9),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
        outlineWidth: 3,
      },
      label: {
        text: agency.abbrev || agency.name,
        font: "14px 'Inter', sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        scale: 0.9,
      },
      properties: {
        type: "agency",
        agencyId: agency.id,
        agencyName: agency.name,
      },
    });
  });
}
