// src/components/Globe/Globe.tsx
import { useEffect, useRef, useState, useMemo } from 'react';
import * as Cesium from 'cesium';
import {
  useLaunchStore,
  getActiveLaunches,
  getLaunchesForRocket,
  getLaunchesForAgency,
  getTimelineLaunchesForGlobe,
} from '../../store/launchStore';
import './Globe.css';
import { Legend } from './Legend';

Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5ZTAwNzk4ZS0zYzUwLTQzMzItYmYzNi1iOWIyZjU1ODg3ZmEiLCJpZCI6MzY3ODk4LCJpYXQiOjE3NjUyNjA2OTl9.NKrR0XhbDD_R8dyteyC6srb_Bxi4BHEMOib7O5CHa0s';

export function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  // Store slices
  const pads = useLaunchStore(state => state.pads);
  const launches = useLaunchStore(state => state.launches);
  const agencies = useLaunchStore(state => state.agencies);
  const rockets = useLaunchStore(state => state.rockets);

  const selectedLaunch = useLaunchStore(state => state.selectedLaunch);
  const selectedRocket = useLaunchStore(state => state.selectedRocket);
  const selectedAgency = useLaunchStore(state => state.selectedAgency);

  const timelineDate = useLaunchStore(state => state.timelineDate);
  const timelineEnabled = useLaunchStore(s => s.timelineEnabled);
  const isTimelinePlaying = useLaunchStore(state => state.isTimelinePlaying);

  const globeMode = useLaunchStore(state => state.globeMode);
  const isLoading = useLaunchStore(state => state.isLoading);
  const sidebarOpen = useLaunchStore(state => state.sidebarOpen);

  const launchTab = useLaunchStore(s => s.launchTab);
  const searchQuery = useLaunchStore(s => s.searchQuery);
  const statusFilter = useLaunchStore(s => s.statusFilter);
  const agencyFilter = useLaunchStore(s => s.agencyFilter);
  const rocketFilter = useLaunchStore(s => s.rocketFilter);

  // Pads to render for each mode
const padsToShow = useMemo(() => {
  const state = useLaunchStore.getState();

  if (globeMode === 'launches') {
    const launchesForPads = timelineEnabled
      ? getTimelineLaunchesForGlobe(state)
      : getActiveLaunches(state);

    const padIds = new Set(
      launchesForPads.map(l => l.pad_id).filter((id): id is number => !!id),
    );
    return pads.filter(p => padIds.has(p.id));
  }

  if (globeMode === 'pads') return pads;

  if (globeMode === 'rockets' && selectedRocket) {
    const rocketLaunches = getLaunchesForRocket(launches, selectedRocket.id);
    const padIds = new Set(
      rocketLaunches.map(l => l.pad_id).filter((id): id is number => !!id),
    );
    return pads.filter(p => padIds.has(p.id));
  }

  if (globeMode === 'agencies' && selectedAgency) {
    const agencyLaunches = getLaunchesForAgency(launches, selectedAgency.id);
    const padIds = new Set(
      agencyLaunches.map(l => l.pad_id).filter((id): id is number => !!id),
    );
    return pads.filter(p => padIds.has(p.id));
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


  // Container ready
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

  // Initialize Cesium
  useEffect(() => {
    if (!isReady || !containerRef.current || viewerRef.current) return;

    let viewer: Cesium.Viewer | null = null;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const initializeViewer = async () => {
      try {
        if (!containerRef.current) throw new Error('Container lost');

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
        const imageryProvider = await Cesium.IonImageryProvider.fromAssetId(2);
        viewer.imageryLayers.addImageryProvider(imageryProvider);

        viewer.scene.globe.enableLighting = false;
        if (viewer.scene.sun) viewer.scene.sun.show = false;
        if (viewer.scene.moon) viewer.scene.moon.show = false;

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(0, 30, 20000000),
        });

        // Click handler
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction(
          (movement: any) => {
            const pickedObject = viewer!.scene.pick(movement.position);
            if (Cesium.defined(pickedObject) && pickedObject.id) {
              const entity = pickedObject.id;
              const entityType = entity.properties?.type?.getValue();

              if (entityType === 'pad') {
                const padId = entity.properties?.padId?.getValue();
                if (padId) {
                  useLaunchStore.getState().navigateToPad(padId);

                  const position = entity.position?.getValue(
                    Cesium.JulianDate.now(),
                  );
                  if (position) {
                    const cartographic =
                      Cesium.Cartographic.fromCartesian(position);
                    viewer!.camera.flyTo({
                      destination: Cesium.Cartesian3.fromRadians(
                        cartographic.longitude,
                        cartographic.latitude,
                        500000,
                      ),
                      duration: 2,
                    });
                  }
                }
              } else if (entityType === 'agency') {
                const agencyId = entity.properties?.agencyId?.getValue();
                if (agencyId) {
                  useLaunchStore.getState().navigateToAgency(agencyId);
                }
              }
            }
          },
          Cesium.ScreenSpaceEventType.LEFT_CLICK,
        );

        viewerRef.current = viewer;
        handlerRef.current = handler;
        setViewerReady(true);
      } catch (error) {
        console.error('Failed to initialize Cesium viewer:', error);
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
      setViewerReady(false);
    };
  }, [isReady]);

  // Render entities
  useEffect(() => {
    if (!viewerReady || !viewerRef.current || isLoading) return;
    const viewer = viewerRef.current;
    viewer.entities.removeAll();

    if (globeMode === 'agencies') {
      renderAgencies(viewer, agencies);
      return;
    }

    const state = useLaunchStore.getState();
    const launchesForPads = globeMode === 'launches'
      ? (timelineEnabled ? getTimelineLaunchesForGlobe(state) : getActiveLaunches(state))
      : launches; // rockets/pads/agencies modes

    const effectiveTimelineDate =
      globeMode === 'launches' && timelineEnabled ? timelineDate : null;

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

  // Camera follow while timeline playing (launches mode only)
  useEffect(() => {
    if (
      !viewerRef.current ||
      !timelineEnabled ||
      !isTimelinePlaying ||
      !timelineDate ||
      globeMode !== 'launches'
    ) {
      return;
    }

    const state = useLaunchStore.getState();
    const timelineLaunches = getTimelineLaunchesForGlobe(state);
    if (timelineLaunches.length === 0) return;

    const latest = timelineLaunches[timelineLaunches.length - 1];
    if (!latest.pad_id) return;

    const pad = pads.find(p => p.id === latest.pad_id);
    if (!pad) return;

    const viewer = viewerRef.current;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        500000,
      ),
      duration: 1.5,
    });
  }, [
    timelineDate,
    timelineEnabled,
    isTimelinePlaying,
    globeMode,
    pads,
  ]);

  // Highlight selected launch (manual click)
  useEffect(() => {
    if (!viewerRef.current || !selectedLaunch) return;

    const viewer = viewerRef.current;
    const pad = pads.find(p => p.id === selectedLaunch.pad_id);
    if (!pad) return;

    const oldHighlight = viewer.entities.getById('highlight');
    if (oldHighlight) viewer.entities.remove(oldHighlight);

    viewer.entities.add({
      id: 'highlight',
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
        500000,
      ),
      duration: 2,
    });

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        const highlight = viewer.entities.getById('highlight');
        if (highlight) viewer.entities.remove(highlight);
      }
    };
  }, [selectedLaunch, pads]);

  return (
    <div
      className={`globe-container ${!sidebarOpen ? 'sidebar-closed' : ''}`}
    >
      <div ref={containerRef} className="cesium-viewer" />
      <Legend mode={globeMode} />
      {!viewerReady && (
        <div className="globe-loading-overlay">
          <div className="loading-spinner" />
          <div>Initializing globe...</div>
        </div>
      )}
    </div>
  );
}

// ===== RENDERING FUNCTIONS =====

function renderPads(
  viewer: Cesium.Viewer,
  pads: any[],
  launches: any[],
  timelineDate: Date | null,
) {
  pads.forEach(pad => {
    const padLaunches = launches.filter((l: any) => l.pad_id === pad.id);

    const filteredLaunches = timelineDate
      ? padLaunches.filter(
          (l: any) => l.net && new Date(l.net) <= timelineDate,
        )
      : padLaunches;

    const launchCount = filteredLaunches.length;

    let color = Cesium.Color.GRAY;
    if (launchCount > 100) color = Cesium.Color.LIME;
    else if (launchCount > 50) color = Cesium.Color.YELLOW;
    else if (launchCount > 20) color = Cesium.Color.ORANGE;
    else if (launchCount > 0) color = Cesium.Color.CYAN;

    viewer.entities.add({
      id: `pad-${pad.id}`,
      name: pad.name,
      position: Cesium.Cartesian3.fromDegrees(pad.longitude, pad.latitude),
      point: {
        pixelSize: 12,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      properties: {
        type: 'pad',
        padId: pad.id,
        padName: pad.name,
        launchCount,
      },
    });
  });
}

function renderAgencies(viewer: Cesium.Viewer, agencies: any[]) {
  const agenciesWithCoords = agencies.filter(
    (a: any) => a.latitude && a.longitude,
  );

  agenciesWithCoords.forEach((agency: any) => {
    viewer.entities.add({
      id: `agency-${agency.id}`,
      name: agency.name,
      position: Cesium.Cartesian3.fromDegrees(
        agency.longitude,
        agency.latitude,
      ),
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString('#3b82f6'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
      },
      label: {
        text: agency.abbrev || agency.name,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        scale: 0.9,
      },
      properties: {
        type: 'agency',
        agencyId: agency.id,
        agencyName: agency.name,
      },
    });
  });
}
