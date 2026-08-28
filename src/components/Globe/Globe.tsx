// src/components/Globe/Globe.tsx
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import * as Cesium from "cesium";
import {
  useLaunchStore,
  getActiveLaunches,
  getTimelineLaunchesForGlobe,
  getLaunchesForRocket,
  getLaunchesForAgency,
} from "../../store/launchStore";
import "./Globe.css";
import { Legend } from "./Legend";
import { tierFor } from "./padTiers";
import { GlobeStats } from "./GlobeStats";
import { GlobeControls } from "./GlobeControls";
import { PadInsetView } from "./PadInsetView";
import { PadFocusCard } from "./PadFocusCard";
import { normalizeCountryCode } from "../../lib/utils";
import type { Agency, Launch, Pad } from "../../lib/api";
import { useEntityLaunchCounts } from "../../hooks/useEntityLaunchCounts";

/**
 * Natural Earth 1:110m admin-0 boundaries, vendored into `public/data`.
 *
 * Local only, deliberately: outlines are the globe's only geography now, so
 * they cannot depend on a network fetch. The previous remote fallback also
 * used a different schema with no `ISO_A2`, which would have silently broken
 * the country shading in agencies mode even when it loaded.
 */
const COUNTRY_GEOJSON_SOURCE = "/data/countries.geojson";

/**
 * Natural Earth marks a handful of countries with "-99" in `ISO_A2` and puts
 * the usable code in `ISO_A2_EH` — France and Norway among them. A plain
 * `a || b` never reaches the fallback because "-99" is a truthy string, so
 * both were dropped from country shading.
 */
function readCountryCode(entity: Cesium.Entity): string | null {
  const candidates = [
    entity.properties?.ISO_A2?.getValue(),
    entity.properties?.ISO_A2_EH?.getValue(),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const code = candidate.trim().toUpperCase();
    if (code && code !== "-99") return code;
  }

  return null;
}

/**
 * The globe carries no imagery. Geography is drawn as country outlines over a
 * flat ground, which is the same schematic language as the rest of the UI —
 * photographic tiles read as a foreign object in a flat, hard-edged system.
 *
 * It also means the app needs no Cesium Ion token and no network to render.
 */
/**
 * With lighting off the globe is a flat fill, so it only reads as a sphere if
 * it is clearly lighter than the space behind it. These two must stay well
 * separated in value — when they were a step apart the Earth disappeared into
 * its own background.
 */
const GLOBE_BASE_COLOR = Cesium.Color.fromCssColorString("#33302e");
const SPACE_COLOR = Cesium.Color.fromCssColorString("#14100f");
const COUNTRY_STROKE = Cesium.Color.fromCssColorString("#8d8886");

/**
 * Country outlines are lifted just clear of the surface. Drawn at height 0
 * they are coplanar with the ellipsoid and z-fight, dropping out in patches.
 * Kept small: the lift also shows up as parallax against the pad markers at
 * grazing angles, so this trades just enough to stop the fighting.
 */
const OUTLINE_HEIGHT_METRES = 3_000;

/**
 * With no imagery there is nothing to look at below roughly regional scale, so
 * the camera stops where the schematic still reads: pads separate from their
 * neighbours and coastlines stay legible. Flying to a pinpoint over a
 * featureless surface would be worse than not flying at all.
 */
const MIN_ZOOM_METRES = 250_000;
const FOCUS_ALTITUDE_METRES = 650_000;

// Default overview camera position (used both on initial load and when
// resetting the view on tab/mode switch).
const DEFAULT_CAMERA_DESTINATION = Cesium.Cartesian3.fromDegrees(
  0,
  30,
  20000000,
);

/**
 * A flat point-to-point flyTo reads as a slide, not a flight. These two
 * options are Cesium's own arc controls — no manual multi-leg path needed:
 * `pitchAdjustHeight` is the altitude above which the camera pitches to look
 * further ahead instead of straight down, so the climb and descent actually
 * look like a climb and descent; `maximumHeight` caps how high a flight is
 * allowed to arc. Capped well under the full-overview altitude so a short
 * pad-to-pad hop doesn't climb as dramatically as a cross-globe one.
 */
const FLYOVER_PITCH_ADJUST_HEIGHT = FOCUS_ALTITUDE_METRES;
const FLYOVER_MAXIMUM_HEIGHT = 2_500_000;

interface PadFocusTarget {
  padName: string;
  agencyName: string | null;
}

/**
 * Shared by every "fly to a specific pad" call site (pad click, timeline
 * camera-follow, selected-launch highlight) so the arc tuning and callbacks
 * can't drift between them the way three independent flyTo calls did before.
 */
function flyToPadFocus(
  viewer: Cesium.Viewer,
  destination: Cesium.Cartesian3,
  options?: {
    duration?: number;
    onComplete?: () => void;
    onCancel?: () => void;
  },
) {
  viewer.camera.flyTo({
    destination,
    duration: options?.duration ?? 2,
    pitchAdjustHeight: FLYOVER_PITCH_ADJUST_HEIGHT,
    maximumHeight: FLYOVER_MAXIMUM_HEIGHT,
    complete: options?.onComplete,
    cancel: options?.onCancel,
  });
}

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
  // Set for the duration of a pad-focus flyTo, cleared on complete/cancel.
  // Drives the "Focusing" card and holds the pad inset back until the
  // flight actually lands, so the two don't show at once.
  const [focusTarget, setFocusTarget] = useState<PadFocusTarget | null>(null);

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
  const showInset = Boolean(selectedLaunch && !isLoading && !focusTarget);

  const launchTab = useLaunchStore((s) => s.launchTab);
  const searchQuery = useLaunchStore((s) => s.searchQuery);
  const padSearchQuery = useLaunchStore((s) => s.padSearchQuery);
  const statusFilter = useLaunchStore((s) => s.statusFilter);
  const agencyFilter = useLaunchStore((s) => s.agencyFilter);
  const rocketFilter = useLaunchStore((s) => s.rocketFilter);
  const countryFilter = useLaunchStore((s) => s.countryFilter);
  const orbitFilter = useLaunchStore((s) => s.orbitFilter);
  const scheduleFilter = useLaunchStore((s) => s.scheduleFilter);

  // Single source of truth for launch filtering - same helper LaunchTab.tsx
  // uses, so the sidebar list and the globe can never silently disagree.
  const filterState = useMemo(
    () => ({
      launches,
      pads,
      launchTab,
      searchQuery,
      statusFilter,
      agencyFilter,
      rocketFilter,
      countryFilter,
      orbitFilter,
      scheduleFilter,
      timelineEnabled,
      timelineDate,
    }),
    [
      launches,
      pads,
      launchTab,
      searchQuery,
      statusFilter,
      agencyFilter,
      rocketFilter,
      countryFilter,
      orbitFilter,
      scheduleFilter,
      timelineEnabled,
      timelineDate,
    ],
  );

  const activeLaunches = useMemo(
    () => getActiveLaunches(filterState),
    [filterState],
  );

  // Only meaningful in "launches" mode - every consumer below already gates
  // on globeMode itself, so this doesn't need its own globeMode check.
  const timelineLaunchesForGlobe = useMemo(
    () => getTimelineLaunchesForGlobe(filterState),
    [filterState],
  );

  const padById = useMemo(() => {
    const map = new Map<number, (typeof pads)[number]>();
    pads.forEach((pad) => {
      map.set(pad.id, pad);
    });
    return map;
  }, [pads]);

  const agencyById = useMemo(() => {
    const map = new Map<number, (typeof agencies)[number]>();
    agencies.forEach((agency) => {
      map.set(agency.id, agency);
    });
    return map;
  }, [agencies]);

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

  const padCounts = useEntityLaunchCounts(launchesForPads, "pad_id");

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
        p.name.toLowerCase().includes(query),
      );
    }

    if (globeMode === "launches") {
      // WHEN TIMELINE IS ENABLED: Show all pads (they'll be colored based on activity)
      if (timelineEnabled) {
        return filteredPads;
      }

      // WHEN TIMELINE IS DISABLED: Show only pads with active launches (original behavior)
      const padIds = new Set(
        activeLaunches.map((l) => l.pad_id).filter((id): id is number => !!id),
      );
      return filteredPads.filter((p) => padIds.has(p.id));
    }

    if (globeMode === "pads") return filteredPads;

    if (globeMode === "rockets" && selectedRocket) {
      const rocketLaunches = getLaunchesForRocket(launches, selectedRocket.id);
      const padIds = new Set(
        rocketLaunches.map((l) => l.pad_id).filter((id): id is number => !!id),
      );
      return filteredPads.filter((p) => padIds.has(p.id));
    }

    if (globeMode === "agencies" && selectedAgency) {
      const agencyLaunches = getLaunchesForAgency(launches, selectedAgency.id);
      const padIds = new Set(
        agencyLaunches.map((l) => l.pad_id).filter((id): id is number => !!id),
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
    padSearchQuery,
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

    // StrictMode runs this effect, cleans it up, and reruns it immediately in
    // dev to surface exactly this class of bug: initializeViewer is async, so
    // the cleanup below can destroy `viewer` while a suspended `await` still
    // holds a reference to it. Every await is followed by a `cancelled` check
    // so a stale continuation stops instead of calling methods on (or
    // reporting errors from) a viewer that cleanup already tore down.
    let cancelled = false;
    let viewer: Cesium.Viewer | null = null;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const initializeViewer = async () => {
      try {
        if (!containerRef.current) throw new Error("Container lost");

        // EllipsoidTerrainProvider for faster initial load. Could upgrade to
        // Cesium.createWorldTerrainAsync() later for real terrain visuals.
        const terrainProvider = new Cesium.EllipsoidTerrainProvider();

        viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider,
          baseLayerPicker: false,
          geocoder: false,
          // Cesium's own toolbar is disabled entirely: it anchors top-right,
          // where the globe controls live, and its chrome could only be
          // brought in line with the rest of the UI through !important
          // overrides. The reset it provided is reimplemented in GlobeControls.
          homeButton: false,
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
        if (cancelled) return;

        const padsSource = new Cesium.CustomDataSource("pads");
        const agenciesSource = new Cesium.CustomDataSource("agencies");
        const overlaySource = new Cesium.CustomDataSource("overlay");
        await viewer.dataSources.add(padsSource);
        if (cancelled) return;
        await viewer.dataSources.add(agenciesSource);
        if (cancelled) return;
        await viewer.dataSources.add(overlaySource);
        if (cancelled) return;
        padsDataSourceRef.current = padsSource;
        agenciesDataSourceRef.current = agenciesSource;
        overlayDataSourceRef.current = overlaySource;

        // No imagery layers at all — the globe is a flat ground with country
        // outlines drawn over it. Nothing here touches the network.
        viewer.imageryLayers.removeAll();
        viewer.scene.globe.baseColor = GLOBE_BASE_COLOR;

        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = false;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
        if (viewer.scene.sun) viewer.scene.sun.show = false;
        if (viewer.scene.moon) viewer.scene.moon.show = false;
        viewer.scene.backgroundColor = SPACE_COLOR;

        viewer.scene.screenSpaceCameraController.minimumZoomDistance =
          MIN_ZOOM_METRES;

        viewer.camera.setView({
          destination: DEFAULT_CAMERA_DESTINATION,
        });

        // Country outlines. Kept in its own try/catch: a failure here costs
        // the geography but must not take the viewer down with it — pads,
        // camera and picking all still work on a bare globe.
        try {
          // clampToGround must stay false: draped ground primitives cannot
          // carry an outline in Cesium, and the outline is the only geography
          // on this globe.
          const countries = await Cesium.GeoJsonDataSource.load(
            COUNTRY_GEOJSON_SOURCE,
            {
              stroke: COUNTRY_STROKE,
              fill: Cesium.Color.TRANSPARENT,
              strokeWidth: 1,
              clampToGround: false,
              markerColor: Cesium.Color.TRANSPARENT,
            },
          );
          if (cancelled) return;
          // Process each entity safely
          countries.entities.values.forEach((entity) => {
            // Only process if it's actually a polygon
            if (entity.polygon) {
              try {
                entity.polygon.material = new Cesium.ColorMaterialProperty(
                  Cesium.Color.TRANSPARENT,
                );
                entity.polygon.outline = new Cesium.ConstantProperty(true);
                entity.polygon.outlineColor = new Cesium.ConstantProperty(
                  COUNTRY_STROKE,
                );
                entity.polygon.outlineWidth = new Cesium.ConstantProperty(1);
                entity.polygon.height = new Cesium.ConstantProperty(
                  OUTLINE_HEIGHT_METRES,
                );
                // GeoJsonDataSource defaults polygons to arcType RHUMB. Rhumb
                // subdivision measures the wraparound edge of an antimeridian-
                // crossing country (Russia, Fiji, the US via the Aleutians) as
                // ~360deg wide instead of the true short distance, so its
                // bisection loop never converges and crashes a Cesium worker
                // with "Too many properties to enumerate". Geodesic doesn't
                // have that pathology.
                entity.polygon.arcType = new Cesium.ConstantProperty(
                  Cesium.ArcType.GEODESIC,
                );
                // No extrudedHeight: a polygon extruded to its own height is
                // a zero-volume solid, and it is not wanted here anyway.
                entity.polygon.extrudedHeight = undefined;
              } catch (error) {
                console.warn("Failed to style country polygon entity", error);
              }
            }
          });

          await viewer.dataSources.add(countries);
          if (cancelled) return;
          countriesRef.current = countries;
        } catch (error) {
          console.error(
            `Failed to load country outlines from ${COUNTRY_GEOJSON_SOURCE}`,
            error,
          );
          countriesRef.current = null;
        }

        // Click handler for pads, agencies, and countries. Captured as a
        // local const (rather than `viewer!` inside the closure) since
        // TS can't carry the outer null-check's narrowing into a callback
        // that might run long after this synchronous setup.
        const clickViewer = viewer;
        handler = new Cesium.ScreenSpaceEventHandler(clickViewer.scene.canvas);
        handler.setInputAction(
          (movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
            const pickedObject = clickViewer.scene.pick(movement.position);
            if (Cesium.defined(pickedObject) && pickedObject.id) {
              const entity = pickedObject.id;
              const entityType = entity.properties?.type?.getValue();

              if (entityType === "pad") {
                const padId = entity.properties?.padId?.getValue();
                if (padId) {
                  useLaunchStore.getState().navigateToPad(padId);

                  const position = entity.position?.getValue(
                    Cesium.JulianDate.now(),
                  );
                  if (position) {
                    const cartographic =
                      Cesium.Cartographic.fromCartesian(position);
                    const pad = useLaunchStore
                      .getState()
                      .pads.find((p) => p.id === padId);
                    // No launch is in context for a bare pad click, and
                    // Pad has no agency_id of its own (LL2 never sends one -
                    // a pad's operator is only known through its launches),
                    // so this path can't show an agency line.
                    setFocusTarget({
                      padName: pad?.name ?? "Launch pad",
                      agencyName: null,
                    });
                    flyToPadFocus(
                      clickViewer,
                      Cesium.Cartesian3.fromRadians(
                        cartographic.longitude,
                        cartographic.latitude,
                        FOCUS_ALTITUDE_METRES,
                      ),
                      {
                        onComplete: () => setFocusTarget(null),
                        onCancel: () => setFocusTarget(null),
                      },
                    );
                  }
                }
              } else if (entityType === "agency") {
                const agencyId = entity.properties?.agencyId?.getValue();
                if (agencyId) {
                  useLaunchStore.getState().navigateToAgency(agencyId);
                }
              }
            }
          },
          Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );

        if (cancelled) return;
        viewerRef.current = viewer;
        handlerRef.current = handler;
        setViewerReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to initialize Cesium viewer", error);
          setIsReady(false);
        }
      }
    };

    initializeViewer();

    return () => {
      cancelled = true;
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

  // Shared by the Reset view control and the mode-change effect below, so
  // both routes back to the overview behave identically.
  const resetView = useCallback(() => {
    // No maximumHeight here (unlike flyToPadFocus): this flight's destination
    // is already at the full overview altitude, well above that cap.
    viewerRef.current?.camera.flyTo({
      destination: DEFAULT_CAMERA_DESTINATION,
      duration: 1.5,
      pitchAdjustHeight: FLYOVER_PITCH_ADJUST_HEIGHT,
    });
  }, []);

  // Fly back to the default overview whenever the globe mode (tab) changes.
  // Skips the very first time viewerReady flips true, since the initial
  // camera.setView already placed it there during viewer init.
  const skippedInitialModeResetRef = useRef(false);
  useEffect(() => {
    if (!viewerReady || !viewerRef.current) return;

    if (!skippedInitialModeResetRef.current) {
      skippedInitialModeResetRef.current = true;
      return;
    }

    resetView();
  }, [globeMode, viewerReady, resetView]);

  // Update country highlighting when in agencies mode
  useEffect(() => {
    if (!viewerReady || !countriesRef.current) return;
    const countries = countriesRef.current;

    // Outlines are the globe's only geography, so they stay on in every mode —
    // this effect toggles the *fill* only.
    if (globeMode !== "agencies") {
      countries.entities.values.forEach((entity) => {
        if (entity.polygon) {
          entity.polygon.material = new Cesium.ColorMaterialProperty(
            Cesium.Color.TRANSPARENT,
          );
          entity.polygon.outline = new Cesium.ConstantProperty(true);
          entity.polygon.outlineColor = new Cesium.ConstantProperty(
            COUNTRY_STROKE,
          );
        }
      });
      return;
    }

    const counts = getAgencyCountsByCountry(agencies);

    countries.entities.values.forEach((entity) => {
      if (!entity.polygon) return;

      try {
        const iso2 = readCountryCode(entity);
        if (!iso2) return;

        const count = counts.get(iso2);

        if (count && count > 0) {
          const fill = getCountryFillColor(count);

          entity.polygon.material = new Cesium.ColorMaterialProperty(fill);
          entity.polygon.outline = new Cesium.ConstantProperty(true);
          entity.polygon.outlineColor = new Cesium.ConstantProperty(
            Cesium.Color.fromCssColorString("#ff9783").withAlpha(0.7),
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
            Cesium.Color.TRANSPARENT,
          );
          entity.polygon.outline = new Cesium.ConstantProperty(true);
          entity.polygon.outlineColor = new Cesium.ConstantProperty(
            COUNTRY_STROKE,
          );
        }
      } catch (error) {
        console.warn(
          "Failed to style country entity for agency highlight",
          error,
        );
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
  }, [
    viewerReady,
    isLoading,
    globeMode,
    padsToShow,
    padCounts,
    agencyPositions,
  ]);

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
        entity.position = new Cesium.ConstantPositionProperty(
          highlightPosition,
        );
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
          entity.position = new Cesium.ConstantPositionProperty(
            timelinePosition,
          );
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

    // Pad itself carries no agency_id - the launch flown from it does.
    const agency = latest.agency_id
      ? agencyById.get(latest.agency_id)
      : undefined;
    setFocusTarget({ padName: pad.name, agencyName: agency?.name ?? null });

    flyToPadFocus(
      viewer,
      Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        FOCUS_ALTITUDE_METRES,
      ),
      {
        duration: 1.5,
        onComplete: () => {
          cameraFlyToRef.current = false;
          setFocusTarget(null);
        },
        onCancel: () => {
          cameraFlyToRef.current = false;
          setFocusTarget(null);
        },
      },
    );
  }, [
    timelineDate,
    timelineEnabled,
    isTimelinePlaying,
    agencyById,
    globeMode,
    padById,
    timelineLaunchesForGlobe,
  ]);

  // Fly to rocket's pads when selected
  useEffect(() => {
    if (!viewerRef.current || !selectedRocket || globeMode !== "rockets")
      return;

    const viewer = viewerRef.current;
    const rocketLaunches = getLaunchesForRocket(launches, selectedRocket.id);
    const padIds = new Set(
      rocketLaunches.map((l) => l.pad_id).filter((id): id is number => !!id),
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
    const height =
      maxSpan > 10
        ? 2_000_000
        : maxSpan > 5
          ? 1_000_000
          : FOCUS_ALTITUDE_METRES;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, height),
      duration: 2,
    });
  }, [selectedRocket, globeMode, pads, launches]);

  // Highlight selected launch. playTimeline()'s auto-advance also sets
  // selectedLaunch on every step, so this is what flies the camera during
  // playback too - the camera-follow effect above still skips auto-play
  // (its own timelineDate trigger would otherwise fire a second, competing
  // flyTo for the same destination on every step).
  useEffect(() => {
    if (!viewerRef.current || !selectedLaunch?.pad_id) return;

    const viewer = viewerRef.current;
    const pad = padById.get(selectedLaunch.pad_id);
    if (!pad) return;

    // Pad itself carries no agency_id - the launch flown from it does.
    const agency = selectedLaunch.agency_id
      ? agencyById.get(selectedLaunch.agency_id)
      : undefined;
    setFocusTarget({ padName: pad.name, agencyName: agency?.name ?? null });

    flyToPadFocus(
      viewer,
      Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        FOCUS_ALTITUDE_METRES,
      ),
      {
        onComplete: () => setFocusTarget(null),
        onCancel: () => setFocusTarget(null),
      },
    );
  }, [selectedLaunch, padById, agencyById]);

  return (
    <div className="globe-container">
      <div ref={containerRef} className="cesium-viewer" />
      <div className="globe-overlays">
        <GlobeStats />
        <GlobeControls onResetView={resetView} />

        <Legend mode={globeMode} />

        {/* While a pad-focus flight is in the air, shown in place of the
            inset it hands off to on arrival (see showInset above). */}
        {focusTarget && (
          <PadFocusCard
            padName={focusTarget.padName}
            agencyName={focusTarget.agencyName}
          />
        )}

        {/* Close-up card for the selected launch's pad, including during
            timeline playback - selectedLaunch updates on every step. */}
        {showInset && (
          <PadInsetView
            pad={
              selectedLaunch?.pad_id ? padById.get(selectedLaunch.pad_id) : null
            }
            launch={selectedLaunch}
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
function getAgencyCountsByCountry(agencies: Agency[]): Map<string, number> {
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
  agencies: Agency[],
  pads: Pad[],
  launches: Launch[],
): AgencyPosition[] {
  const padById = new Map<number, Pad>();
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
  pads: Pad[],
  padCounts: Map<number, number>,
) {
  const wanted = new Set<string>();

  for (const pad of pads) {
    const entityId = `pad-${pad.id}`;
    wanted.add(entityId);

    const launchCount = padCounts.get(pad.id) || 0;
    const existing = dataSource.entities.getById(entityId);

    // During timeline playback this runs every tick since padCounts is a
    // fresh Map each time, but most individual pads' counts haven't
    // actually changed - skip reconstructing PointGraphics/PropertyBag for
    // those, rather than rebuilding every pad's style every tick.
    if (existing) {
      const prevCount = existing.properties?.launchCount?.getValue();
      if (prevCount === launchCount) {
        continue;
      }
    }

    const style = getPadStyle(launchCount);
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
      font: "13px Inter, sans-serif",
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
  const tier = tierFor(launchCount);

  if (tier.fill === null) {
    return {
      pixelSize: tier.size,
      color: Cesium.Color.TRANSPARENT,
      outlineColor: Cesium.Color.fromCssColorString("#605d5d").withAlpha(0.9),
      outlineWidth: 2,
    };
  }

  return {
    pixelSize: tier.size,
    color: Cesium.Color.fromCssColorString(tier.fill).withAlpha(0.95),
    outlineColor: Cesium.Color.fromCssColorString("#201e1d").withAlpha(0.85),
    outlineWidth: 2,
  };
}

/**
 * Country shading in agencies mode. Previously white at 10–35% alpha, which
 * was invisible at the low end against a dark ground; the accent carries it
 * further and reads as one ramp with the pad markers.
 */
function getCountryFillColor(count: number): Cesium.Color {
  const accent = Cesium.Color.fromCssColorString("#ec3013");
  let alpha = 0.14;
  if (count > 20) alpha = 0.5;
  else if (count > 10) alpha = 0.42;
  else if (count > 5) alpha = 0.34;
  else if (count > 2) alpha = 0.26;
  return accent.withAlpha(alpha);
}
