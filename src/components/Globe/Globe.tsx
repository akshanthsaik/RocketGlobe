// src/components/Globe/Globe.tsx
import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { useLaunchStore } from '../../store/launchStore';
import './Globe.css';
import { Legend } from './Legend';

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5ZTAwNzk4ZS0zYzUwLTQzMzItYmYzNi1iOWIyZjU1ODg3ZmEiLCJpZCI6MzY3ODk4LCJpYXQiOjE3NjUyNjA2OTl9.NKrR0XhbDD_R8dyteyC6srb_Bxi4BHEMOib7O5CHa0s';

export function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const entitiesRef = useRef<{
    pads: boolean;
    heatmap: boolean;
    trajectories: boolean;
    agencies: boolean;
  }>({
    pads: false,
    heatmap: false,
    trajectories: false,
    agencies: false,
  });
  
  const [isReady, setIsReady] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  
  const pads = useLaunchStore(state => state.pads);
  const launches = useLaunchStore(state => state.launches);
  const agencies = useLaunchStore(state => state.agencies);
  const selectedLaunch = useLaunchStore(state => state.selectedLaunch);
  const timelineDate = useLaunchStore(state => state.timelineDate);
  const globeMode = useLaunchStore(state => state.globeMode);
  const isLoading = useLaunchStore(state => state.isLoading);

  // Container ready check
  useEffect(() => {
    if (!containerRef.current) return;

    const checkContainer = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log('✅ Container ready:', rect.width, 'x', rect.height);
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
    
    console.log('🌍 Initializing Cesium viewer...');

    let viewer: Cesium.Viewer | null = null;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;

    const initializeViewer = async () => {
      try {
        if (!containerRef.current) throw new Error('Container lost');

        const terrainProvider = await Cesium.createWorldTerrainAsync();
        
        viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider: terrainProvider,
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
        handler.setInputAction((movement: any) => {
          const pickedObject = viewer!.scene.pick(movement.position);
          if (Cesium.defined(pickedObject) && pickedObject.id) {
            const entity = pickedObject.id;
            const entityType = entity.properties?.type?.getValue();
            
            if (entityType === 'pad') {
              const padId = entity.properties?.padId?.getValue();
              if (padId) {
                console.log('🎯 Clicked pad:', padId);
                useLaunchStore.getState().navigateToPad(padId);
                
                const position = entity.position?.getValue(Cesium.JulianDate.now());
                if (position) {
                  const cartographic = Cesium.Cartographic.fromCartesian(position);
                  viewer!.camera.flyTo({
                    destination: Cesium.Cartesian3.fromRadians(
                      cartographic.longitude,
                      cartographic.latitude,
                      500000
                    ),
                    duration: 2,
                  });
                }
              }
            } else if (entityType === 'agency') {
              const agencyId = entity.properties?.agencyId?.getValue();
              if (agencyId) {
                console.log('🏢 Clicked agency:', agencyId);
                useLaunchStore.getState().navigateToAgency(agencyId);
              }
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = viewer;
        handlerRef.current = handler;
        
        console.log('✅ Cesium viewer initialized successfully');
        setViewerReady(true);
      } catch (error) {
        console.error('❌ Failed to initialize Cesium viewer:', error);
        setIsReady(false);
      }
    };

    initializeViewer();

    return () => {
      console.log('🧹 Cleaning up Cesium viewer...');
      if (handler && !handler.isDestroyed()) {
        handler.destroy();
        handlerRef.current = null;
      }
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
        viewerRef.current = null;
      }
      entitiesRef.current = {
        pads: false,
        heatmap: false,
        trajectories: false,
        agencies: false,
      };
      setViewerReady(false);
    };
  }, [isReady]);

  // Render based on globe mode
  useEffect(() => {
    if (!viewerReady || !viewerRef.current || isLoading) return;

    const viewer = viewerRef.current;
    console.log(`🎨 Switching to mode: ${globeMode}`);

    // Clear all entities when switching modes
    viewer.entities.removeAll();
    entitiesRef.current = {
      pads: false,
      heatmap: false,
      trajectories: false,
      agencies: false,
    };

    // Render based on current mode
    switch (globeMode) {
      case 'pads':
        renderPads(viewer, pads, launches, timelineDate);
        entitiesRef.current.pads = true;
        break;
      case 'heatmap':
        renderHeatmap(viewer, pads, launches, timelineDate);
        entitiesRef.current.heatmap = true;
        break;
      case 'trajectories':
        renderTrajectories(viewer, launches, pads, timelineDate);
        entitiesRef.current.trajectories = true;
        break;
      case 'timeline':
        renderPads(viewer, pads, launches, timelineDate);
        entitiesRef.current.pads = true;
        break;
      case 'agencies':
        renderAgencies(viewer, agencies);
        entitiesRef.current.agencies = true;
        break;
    }
  }, [viewerReady, globeMode, pads.length, launches.length, agencies.length, isLoading]);

  // Update colors when timeline changes (for pads mode)
  useEffect(() => {
    if (!viewerRef.current || !timelineDate || globeMode !== 'pads' && globeMode !== 'timeline') return;

    const viewer = viewerRef.current;
    const visibleLaunches = launches.filter(l => l.net && new Date(l.net) <= timelineDate);

    pads.forEach(pad => {
      const entity = viewer.entities.getById(`pad-${pad.id}`);
      if (!entity || !entity.point) return;

      const launchCount = visibleLaunches.filter(l => l.pad_id === pad.id).length;
      
      let color = Cesium.Color.GRAY;
      if (launchCount > 100) color = Cesium.Color.LIME;
      else if (launchCount > 50) color = Cesium.Color.YELLOW;
      else if (launchCount > 20) color = Cesium.Color.ORANGE;
      else if (launchCount > 0) color = Cesium.Color.CYAN;

      entity.point.color = new Cesium.ConstantProperty(color);
    });
  }, [timelineDate, globeMode, pads, launches]);

  // Highlight selected launch
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
      destination: Cesium.Cartesian3.fromDegrees(pad.longitude, pad.latitude, 500000),
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
    <div className="globe-container">
      <div ref={containerRef} className="cesium-viewer" />
      <Legend mode={globeMode} />
      {!viewerReady && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          fontSize: '14px',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div className="loading-spinner" style={{
            width: '40px',
            height: '40px',
            border: '4px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
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
  timelineDate: Date | null
) {
  console.log(`🎯 Rendering ${pads.length} pads`);
  
  pads.forEach(pad => {
    const padLaunches = launches.filter(l => l.pad_id === pad.id);
    const filteredLaunches = timelineDate 
      ? padLaunches.filter(l => l.net && new Date(l.net) <= timelineDate)
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
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      properties: {
        type: 'pad',
        padId: pad.id,
        padName: pad.name,
        launchCount: launchCount,
      },
    });
  });
}

function renderHeatmap(
  viewer: Cesium.Viewer,
  pads: any[],
  launches: any[],
  timelineDate: Date | null
) {
  console.log('🔥 Rendering heatmap');
  
  pads.forEach(pad => {
    const padLaunches = launches.filter(l => l.pad_id === pad.id);
    const filteredLaunches = timelineDate 
      ? padLaunches.filter(l => l.net && new Date(l.net) <= timelineDate)
      : padLaunches;
    
    const launchCount = filteredLaunches.length;
    if (launchCount === 0) return;

    // Create expanding circle for heatmap effect
    const radius = Math.min(launchCount * 10000, 800000); // Max 800km
    const alpha = Math.min(launchCount / 50, 0.8);

    viewer.entities.add({
      id: `heatmap-${pad.id}`,
      position: Cesium.Cartesian3.fromDegrees(pad.longitude, pad.latitude),
      ellipse: {
        semiMinorAxis: radius,
        semiMajorAxis: radius,
        height: 10000,
        material: Cesium.Color.RED.withAlpha(alpha * 0.6),
        outline: true,
        outlineColor: Cesium.Color.YELLOW.withAlpha(alpha),
        outlineWidth: 3,
      },
      properties: {
        type: 'pad',
        padId: pad.id,
        launchCount: launchCount,
      },
    });

    // Add center point
    viewer.entities.add({
      id: `heatmap-center-${pad.id}`,
      position: Cesium.Cartesian3.fromDegrees(pad.longitude, pad.latitude),
      point: {
        pixelSize: 10,
        color: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.RED,
        outlineWidth: 2,
      },
    });
  });
}

function renderTrajectories(
  viewer: Cesium.Viewer,
  launches: any[],
  pads: any[],
  timelineDate: Date | null
) {
  console.log('🚀 Rendering trajectories');
  
  const filteredLaunches = timelineDate 
    ? launches.filter(l => l.net && new Date(l.net) <= timelineDate).slice(-200)
    : launches.slice(-200); // Last 200 launches

  filteredLaunches.forEach(launch => {
    const pad = pads.find(p => p.id === launch.pad_id);
    if (!pad) return;

    // Create arc from launch pad going up
    const startPos = Cesium.Cartesian3.fromDegrees(
      pad.longitude,
      pad.latitude,
      0
    );

    // Calculate arc endpoint with some randomness for visual effect
    const distance = 30 + Math.random() * 20; // 30-50 degrees
    const angle = Math.random() * Math.PI * 2;
    const endLon = pad.longitude + Math.cos(angle) * distance;
    const endLat = pad.latitude + Math.sin(angle) * distance;

    const endPos = Cesium.Cartesian3.fromDegrees(
      endLon,
      endLat,
      800000 // 800km altitude
    );

    // Color based on status
    let color = Cesium.Color.CYAN;
    if (launch.status?.includes('Success')) color = Cesium.Color.GREEN;
    else if (launch.status?.includes('Failure')) color = Cesium.Color.RED;
    else if (launch.status?.includes('Partial')) color = Cesium.Color.YELLOW;

    viewer.entities.add({
      id: `trajectory-${launch.id}`,
      polyline: {
        positions: [startPos, endPos],
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: color.withAlpha(0.7),
        }),
        arcType: Cesium.ArcType.GEODESIC,
      },
      properties: {
        type: 'trajectory',
        launchId: launch.id,
      },
    });

    // Add point at launch site
    viewer.entities.add({
      id: `traj-point-${launch.id}`,
      position: startPos,
      point: {
        pixelSize: 6,
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
    });
  });
}

function renderAgencies(viewer: Cesium.Viewer, agencies: any[]) {
  console.log(`🏢 Rendering ${agencies.length} agencies`);
  
  // Filter agencies with valid coordinates
  const agenciesWithCoords = agencies.filter(a => 
    a.latitude && a.longitude
  );

  console.log(`📍 Found ${agenciesWithCoords.length} agencies with coordinates`);

  agenciesWithCoords.forEach(agency => {
    viewer.entities.add({
      id: `agency-${agency.id}`,
      name: agency.name,
      position: Cesium.Cartesian3.fromDegrees(agency.longitude, agency.latitude),
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
