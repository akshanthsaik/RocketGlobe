// src/components/Globe/Globe.tsx
import { useEffect, useRef, useState, useMemo } from "react";
import * as Cesium from "cesium";
import {
  useLaunchStore,
  getActiveLaunches,
  getLaunchesForRocket,
  getLaunchesForAgency,
} from "../../store/launchStore";
import "./Globe.css";
import { Legend } from "./Legend";
import { PadInsetView } from "./PadInsetView";
import { normalizeCountryCode } from "../../lib/utils";

const cesiumToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;
if (cesiumToken) {
  Cesium.Ion.defaultAccessToken = cesiumToken;
}

const COUNTRY_GEOJSON_SOURCES = [
  "/data/countries.geojson",
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
];

export function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const countriesRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const padsDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const agenciesDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const overlayDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const cameraFlyToRef = useRef<boolean>(false);
  const lastTimelineDateRef = useRef<Date | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  // Store slices
  const pads = useLaunchStore((state) => state.pads);
  const launches = useLaunchStore((state) => state.launches);
  const agencies = useLaunchStore((state) => state.agencies);

  const selectedLaunch = useLaunchStore((state) => state.selectedLaunch);
  const selectedRocket = useLaunchStore((state) => state.selectedRocket);
  const selectedAgency = useLaunchStore((state) => state.selectedAgency);

  const timelineDate = useLaunchStore((state) => state.timelineDate);
  const timelineEnabled = useLaunchStore((s) => s.timelineEnabled);
  const isTimelinePlaying = useLaunchStore((state) => state.isTimelinePlaying);

  const globeMode = useLaunchStore((state) => state.globeMode);
  const isLoading = useLaunchStore((state) => state.isLoading);
  const sidebarOpen = useLaunchStore((state) => state.sidebarOpen);
  const showInset = Boolean(selectedLaunch && !isLoading && !isTimelinePlaying);

  const launchTab = useLaunchStore((s) => s.launchTab);
  const searchQuery = useLaunchStore((s) => s.searchQuery);
  const padSearchQuery = useLaunchStore((s) => s.padSearchQuery);
  const statusFilter = useLaunchStore((s) => s.statusFilter);
  const agencyFilter = useLaunchStore((s) => s.agencyFilter);
  const rocketFilter = useLaunchStore((s) => s.rocketFilter);

  const activeLaunches = useMemo(() => {
    return getActiveLaunches({
      launches,
      launchTab,
      searchQuery,
      statusFilter,
      agencyFilter,
      rocketFilter,
      timelineEnabled,
      timelineDate,
    } as any);
  }, [
    launches,
    launchTab,
    searchQuery,
    statusFilter,
    agencyFilter,
    rocketFilter,
    timelineEnabled,
    timelineDate,
  ]);

  const timelineLaunchesForGlobe = useMemo(() => {
    if (!timelineEnabled || globeMode !== "launches" || !timelineDate) return [];
    return activeLaunches
      .filter((l) => l.net && new Date(l.net) <= timelineDate)
      .sort(
        (a, b) => new Date(a.net || 0).getTime() - new Date(b.net || 0).getTime(),
      );
  }, [timelineEnabled, globeMode, timelineDate, activeLaunches]);

  const padById = useMemo(() => {
    const map = new Map<number, (typeof pads)[number]>();
    pads.forEach((pad) => {
      map.set(pad.id, pad);
    });
    return map;
  }, [pads]);

  const launchesForPads = useMemo(() => {
    if (globeMode === "launches") {
      return timelineEnabled ? timelineLaunchesForGlobe : activeLaunches;
    }
    return launches;
  }, [
    globeMode,
    timelineEnabled,
    timelineLaunchesForGlobe,
    activeLaunches,
    launches,
  ]);

  const padCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const launch of launchesForPads) {
      if (!launch.pad_id) continue;
      map.set(launch.pad_id, (map.get(launch.pad_id) || 0) + 1);
    }
    return map;
  }, [launchesForPads]);

  const agencyPositions = useMemo(() => {
    return computeAgencyPositions(agencies, pads, launches);
  }, [agencies, pads, launches]);

  // Compute pads to show based on mode and filters
  const padsToShow = useMemo(() => {
    let filteredPads = pads;

    // Apply search filter for pads mode
    if (globeMode === "pads" && padSearchQuery) {
      const query = padSearchQuery.toLowerCase();
      filteredPads = filteredPads.filter((p) =>
        p.name.toLowerCase().includes(query)
      );
    }

    if (globeMode === "launches") {
      // WHEN TIMELINE IS ENABLED: Show all pads (they'll be colored based on activity)
      if (timelineEnabled) {
        return filteredPads;
      }

      // WHEN TIMELINE IS DISABLED: Show only pads with active launches (original behavior)
      const padIds = new Set(
        activeLaunches.map((l) => l.pad_id).filter((id): id is number => !!id)
      );
      return filteredPads.filter((p) => padIds.has(p.id));
    }

    if (globeMode === "pads") return filteredPads;

    if (globeMode === "rockets" && selectedRocket) {
      const rocketLaunches = getLaunchesForRocket(launches, selectedRocket.id);
      const padIds = new Set(
        rocketLaunches.map((l) => l.pad_id).filter((id): id is number => !!id)
      );
      return filteredPads.filter((p) => padIds.has(p.id));
    }

    if (globeMode === "agencies" && selectedAgency) {
      const agencyLaunches = getLaunchesForAgency(launches, selectedAgency.id);
      const padIds = new Set(
        agencyLaunches.map((l) => l.pad_id).filter((id): id is number => !!id)
      );
      return filteredPads.filter((p) => padIds.has(p.id));
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
    padSearchQuery,
    statusFilter,
    agencyFilter,
    rocketFilter,
    activeLaunches,
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

        // Use EllipsoidTerrainProvider for faster initial load
        const terrainProvider = new Cesium.EllipsoidTerrainProvider();
        // Optionally upgrade to WorldTerrainAsync later for better visuals
        // const terrainProvider = await Cesium.createWorldTerrainAsync();

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
          // Performance optimizations
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
        });

        const padsSource = new Cesium.CustomDataSource("pads");
        const agenciesSource = new Cesium.CustomDataSource("agencies");
        const overlaySource = new Cesium.CustomDataSource("overlay");
        await viewer.dataSources.add(padsSource);
        await viewer.dataSources.add(agenciesSource);
        await viewer.dataSources.add(overlaySource);
        padsDataSourceRef.current = padsSource;
        agenciesDataSourceRef.current = agenciesSource;
        overlayDataSourceRef.current = overlaySource;

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
          let countries: Cesium.GeoJsonDataSource | null = null;
          let lastError: unknown = null;

          for (const source of COUNTRY_GEOJSON_SOURCES) {
            try {
              countries = await Cesium.GeoJsonDataSource.load(source, {
                stroke: Cesium.Color.TRANSPARENT,
                fill: Cesium.Color.TRANSPARENT,
                clampToGround: true,
                markerColor: Cesium.Color.TRANSPARENT,
              });
              break;
            } catch (error) {
              lastError = error;
            }
          }

          if (!countries) {
            throw lastError || new Error("Failed to load countries GeoJSON");
          }
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
              } catch {
              }
            }
          });

          await viewer.dataSources.add(countries);
          countriesRef.current = countries;
        } catch (error) {
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
              // Optional: You can add a toast notification or sidebar update here
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = viewer;
        handlerRef.current = handler;
        setViewerReady(true);
      } catch (error) {
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
      padsDataSourceRef.current = null;
      agenciesDataSourceRef.current = null;
      overlayDataSourceRef.current = null;
      setViewerReady(false);
    };
  }, [isReady]);

  // Update country highlighting when in agencies mode
  useEffect(() => {
    if (!viewerReady || !countriesRef.current) return;
    const countries = countriesRef.current;

    if (globeMode !== "agencies") {
      countries.entities.values.forEach((entity) => {
        if (entity.polygon) {
          entity.polygon.material = new Cesium.ColorMaterialProperty(
            Cesium.Color.TRANSPARENT
          );
          entity.polygon.outline = new Cesium.ConstantProperty(false);
        }
      });
      return;
    }

    const counts = getAgencyCountsByCountry(agencies);

    countries.entities.values.forEach((entity) => {
      if (!entity.polygon) return;

      try {
        const iso2Raw =
          entity.properties?.ISO_A2?.getValue() ||
          entity.properties?.ISO_A2_EH?.getValue();

        if (!iso2Raw || typeof iso2Raw !== "string") return;

        const iso2 = iso2Raw.toUpperCase();
        if (iso2 === "-99") return;

        const count = counts.get(iso2);

        if (count && count > 0) {
          const fill = getCountryFillColor(count);

          entity.polygon.material = new Cesium.ColorMaterialProperty(fill);
          entity.polygon.outline = new Cesium.ConstantProperty(true);
          entity.polygon.outlineColor = new Cesium.ConstantProperty(
            Cesium.Color.WHITE.withAlpha(0.35)
          );
          entity.polygon.outlineWidth = new Cesium.ConstantProperty(1);

          if (!entity.properties) {
            entity.properties = new Cesium.PropertyBag();
          }
          if (!entity.properties.hasProperty("agencyCount")) {
            entity.properties.addProperty("agencyCount", count);
          } else {
            entity.properties.agencyCount = count;
          }
        } else {
          entity.polygon.material = new Cesium.ColorMaterialProperty(
            Cesium.Color.TRANSPARENT
          );
          entity.polygon.outline = new Cesium.ConstantProperty(false);
        }
      } catch {
      }
    });
  }, [viewerReady, globeMode, agencies]);

  // Update pad or agency entities without rebuilding the entire viewer
  useEffect(() => {
    if (!viewerReady || isLoading) return;

    const padsSource = padsDataSourceRef.current;
    const agenciesSource = agenciesDataSourceRef.current;
    if (!padsSource || !agenciesSource) return;

    if (globeMode === "agencies") {
      if (padsSource.entities.values.length > 0) {
        padsSource.entities.removeAll();
      }
      syncAgencies(agenciesSource, agencyPositions);
    } else {
      if (agenciesSource.entities.values.length > 0) {
        agenciesSource.entities.removeAll();
      }
      syncPads(padsSource, padsToShow, padCounts);
    }
  }, [viewerReady, isLoading, globeMode, padsToShow, padCounts, agencyPositions]);

  // Highlight current launch during timeline mode and selected launch
  useEffect(() => {
    if (!viewerReady) return;
    const overlay = overlayDataSourceRef.current;
    if (!overlay) return;

    const highlightId = "highlight";
    const timelineId = "timeline-current";

    if (selectedLaunch?.pad_id) {
      const pad = padById.get(selectedLaunch.pad_id);
      if (pad) {
        const existing = overlay.entities.getById(highlightId);
        const entity = existing
          ? existing
          : overlay.entities.add({ id: highlightId });

        const highlightPosition = Cesium.Cartesian3.fromDegrees(
          pad.longitude,
          pad.latitude,
        );
        entity.position = new Cesium.ConstantPositionProperty(highlightPosition);
        entity.point = new Cesium.PointGraphics({
          pixelSize: 22,
          color: Cesium.Color.WHITE.withAlpha(0.95),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.5),
          outlineWidth: 3,
        });
      }
    } else {
      const existing = overlay.entities.getById(highlightId);
      if (existing) overlay.entities.remove(existing);
    }

    if (
      globeMode === "launches" &&
      timelineEnabled &&
      timelineDate &&
      timelineLaunchesForGlobe.length > 0
    ) {
      const currentLaunch =
        timelineLaunchesForGlobe[timelineLaunchesForGlobe.length - 1];
      if (currentLaunch?.pad_id) {
        const pad = padById.get(currentLaunch.pad_id);
        if (pad) {
          const existing = overlay.entities.getById(timelineId);
          const entity = existing
            ? existing
            : overlay.entities.add({ id: timelineId });

          const timelinePosition = Cesium.Cartesian3.fromDegrees(
            pad.longitude,
            pad.latitude,
          );
          entity.position = new Cesium.ConstantPositionProperty(timelinePosition);
          entity.point = new Cesium.PointGraphics({
            pixelSize: 16,
            color: Cesium.Color.WHITE.withAlpha(0.8),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.4),
            outlineWidth: 2,
          });
        }
      }
    } else {
      const existing = overlay.entities.getById(timelineId);
      if (existing) overlay.entities.remove(existing);
    }
  }, [
    viewerReady,
    selectedLaunch,
    padById,
    globeMode,
    timelineEnabled,
    timelineDate,
    timelineLaunchesForGlobe,
  ]);

  // Camera follow during timeline - only on manual steps, not during auto-play
  // This prevents camera overlap and blurriness during continuous playback
  useEffect(() => {
    if (
      !viewerRef.current ||
      !timelineEnabled ||
      !timelineDate ||
      globeMode !== "launches" ||
      isTimelinePlaying // Don't move camera during auto-play
    ) {
      return;
    }

    // Only move camera if date changed significantly (manual step)
    if (
      lastTimelineDateRef.current &&
      Math.abs(timelineDate.getTime() - lastTimelineDateRef.current.getTime()) <
        1000
    ) {
      return;
    }

    lastTimelineDateRef.current = timelineDate;

    const timelineLaunches = timelineLaunchesForGlobe;
    if (timelineLaunches.length === 0) return;

    const latest = timelineLaunches[timelineLaunches.length - 1];
    if (!latest.pad_id) return;

    const pad = padById.get(latest.pad_id);
    if (!pad) return;

    const viewer = viewerRef.current;

    // Prevent multiple simultaneous flyTos
    if (cameraFlyToRef.current) return;
    cameraFlyToRef.current = true;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        100000 // Comfortable zoom level
      ),
      duration: 1.5,
      complete: () => {
        cameraFlyToRef.current = false;
      },
      cancel: () => {
        cameraFlyToRef.current = false;
      },
    });
  }, [
    timelineDate,
    timelineEnabled,
    isTimelinePlaying,
    globeMode,
    padById,
    timelineLaunchesForGlobe,
  ]);

  // Fly to rocket's pads when selected
  useEffect(() => {
    if (!viewerRef.current || !selectedRocket || globeMode !== "rockets") return;

    const viewer = viewerRef.current;
    const rocketLaunches = getLaunchesForRocket(launches, selectedRocket.id);
    const padIds = new Set(
      rocketLaunches.map((l) => l.pad_id).filter((id): id is number => !!id)
    );
    const rocketPads = pads.filter((p) => padIds.has(p.id));

    if (rocketPads.length === 0) return;

    // Calculate bounding box of all pads
    const lats = rocketPads.map((p) => p.latitude);
    const lons = rocketPads.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;
    const maxSpan = Math.max(latSpan, lonSpan);
    
    // Calculate appropriate height based on span
    const height = maxSpan > 10 ? 2000000 : maxSpan > 5 ? 1000000 : 500000;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, height),
      duration: 2,
    });
  }, [selectedRocket, globeMode, pads, launches]);

  // Highlight selected launch (manual click)
  useEffect(() => {
    if (!viewerRef.current || !selectedLaunch?.pad_id) return;

    const viewer = viewerRef.current;
    const pad = padById.get(selectedLaunch.pad_id);
    if (!pad) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        50000 // Close zoom for selected launch
      ),
      duration: 2,
    });
  }, [selectedLaunch, padById]);

  return (
    <div
      className={`globe-container ${!sidebarOpen ? "sidebar-closed" : ""} ${
        showInset ? "has-inset" : ""
      }`}
    >
      <div ref={containerRef} className="cesium-viewer" />
      <div className="globe-overlays">
        <Legend
          mode={globeMode}
          timelineActive={globeMode === "launches" && timelineEnabled}
        />

        {/* Inset close-up view - Show when launch is selected, hide during timeline auto-play to reduce clutter */}
        {showInset && (
          <PadInsetView
            pad={selectedLaunch?.pad_id ? padById.get(selectedLaunch.pad_id) : null}
            launch={selectedLaunch}
            timelineActive={globeMode === "launches" && timelineEnabled}
          />
        )}
      </div>

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
    const normalized = normalizeCountryCode(a.country_code);
    if (!normalized) return;
    map.set(normalized, (map.get(normalized) || 0) + 1);
  });

  return map;
}

// ===== RENDERING FUNCTIONS =====

type AgencyPosition = {
  id: number;
  name: string;
  abbrev?: string | null;
  latitude: number;
  longitude: number;
};

function computeAgencyPositions(
  agencies: any[],
  pads: any[],
  launches: any[],
): AgencyPosition[] {
  const padById = new Map<number, any>();
  pads.forEach((pad) => {
    padById.set(pad.id, pad);
  });

  const agg = new Map<
    number,
    { sumLat: number; sumLon: number; count: number; padIds: Set<number> }
  >();

  for (const launch of launches) {
    if (!launch.agency_id || !launch.pad_id) continue;
    const pad = padById.get(launch.pad_id);
    if (!pad) continue;

    let entry = agg.get(launch.agency_id);
    if (!entry) {
      entry = { sumLat: 0, sumLon: 0, count: 0, padIds: new Set<number>() };
      agg.set(launch.agency_id, entry);
    }

    if (entry.padIds.has(pad.id)) continue;
    entry.padIds.add(pad.id);
    entry.sumLat += pad.latitude;
    entry.sumLon += pad.longitude;
    entry.count += 1;
  }

  const positions: AgencyPosition[] = [];
  for (const agency of agencies) {
    const entry = agg.get(agency.id);
    if (!entry || entry.count === 0) continue;

    positions.push({
      id: agency.id,
      name: agency.name,
      abbrev: agency.abbrev,
      latitude: entry.sumLat / entry.count,
      longitude: entry.sumLon / entry.count,
    });
  }

  return positions;
}

function syncPads(
  dataSource: Cesium.CustomDataSource,
  pads: any[],
  padCounts: Map<number, number>,
) {
  const wanted = new Set<string>();

  for (const pad of pads) {
    const entityId = `pad-${pad.id}`;
    wanted.add(entityId);

    const launchCount = padCounts.get(pad.id) || 0;
    const style = getPadStyle(launchCount);

    const existing = dataSource.entities.getById(entityId);
    const entity = existing
      ? existing
      : dataSource.entities.add({ id: entityId });

    entity.name = pad.name;
    const padPosition = Cesium.Cartesian3.fromDegrees(
      pad.longitude,
      pad.latitude,
    );
    entity.position = new Cesium.ConstantPositionProperty(padPosition);
    entity.point = new Cesium.PointGraphics({
      pixelSize: style.pixelSize,
      color: style.color,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
    });
    entity.properties = new Cesium.PropertyBag({
      type: "pad",
      padId: pad.id,
      padName: pad.name,
      launchCount,
    });
  }

  const toRemove = dataSource.entities.values.filter(
    (entity) => !wanted.has(String(entity.id)),
  );
  toRemove.forEach((entity) => dataSource.entities.remove(entity));
}

function syncAgencies(
  dataSource: Cesium.CustomDataSource,
  agencies: AgencyPosition[],
) {
  const wanted = new Set<string>();

  for (const agency of agencies) {
    const entityId = `agency-${agency.id}`;
    wanted.add(entityId);

    const existing = dataSource.entities.getById(entityId);
    const entity = existing
      ? existing
      : dataSource.entities.add({ id: entityId });

    entity.name = agency.name;
    const agencyPosition = Cesium.Cartesian3.fromDegrees(
      agency.longitude,
      agency.latitude,
    );
    entity.position = new Cesium.ConstantPositionProperty(agencyPosition);
    entity.point = new Cesium.PointGraphics({
      pixelSize: 14,
      color: Cesium.Color.WHITE.withAlpha(0.85),
      outlineColor: Cesium.Color.BLACK.withAlpha(0.45),
      outlineWidth: 2,
    });
    entity.label = new Cesium.LabelGraphics({
      text: agency.abbrev || agency.name,
      font: "13px sans-serif",
      fillColor: Cesium.Color.WHITE.withAlpha(0.9),
      outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -18),
      scale: 0.9,
    });
    entity.properties = new Cesium.PropertyBag({
      type: "agency",
      agencyId: agency.id,
      agencyName: agency.name,
    });
  }

  const toRemove = dataSource.entities.values.filter(
    (entity) => !wanted.has(String(entity.id)),
  );
  toRemove.forEach((entity) => dataSource.entities.remove(entity));
}

function getPadStyle(launchCount: number) {
  let alpha = 0.25;
  if (launchCount > 100) alpha = 0.95;
  else if (launchCount > 50) alpha = 0.85;
  else if (launchCount > 20) alpha = 0.75;
  else if (launchCount > 0) alpha = 0.6;

  const baseSize = 8;
  const activeBaseSize = 12;
  const maxSize = 22;

  const pixelSize =
    launchCount > 0
      ? Math.min(activeBaseSize + launchCount / 15, maxSize)
      : baseSize;

  return {
    pixelSize,
    color: Cesium.Color.WHITE.withAlpha(alpha),
    outlineColor: Cesium.Color.BLACK.withAlpha(0.35),
    outlineWidth: launchCount > 0 ? 2 : 1,
  };
}

function getCountryFillColor(count: number): Cesium.Color {
  let alpha = 0.1;
  if (count > 20) alpha = 0.35;
  else if (count > 10) alpha = 0.28;
  else if (count > 5) alpha = 0.22;
  else if (count > 2) alpha = 0.16;
  else if (count > 0) alpha = 0.12;
  return Cesium.Color.WHITE.withAlpha(alpha);
}
