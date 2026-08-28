import { Viewer, Entity } from 'resium';
import { 
  Cartesian3,
  Cartesian2,
  Color, 
  Ion, 
  Math as CesiumMath,
  createWorldTerrainAsync,
  LabelStyle
} from 'cesium';
import { useRef, useEffect } from 'react';

Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5ZTAwNzk4ZS0zYzUwLTQzMzItYmYzNi1iOWIyZjU1ODg3ZmEiLCJpZCI6MzY3ODk4LCJpYXQiOjE3NjUyNjA2OTl9.NKrR0XhbDD_R8dyteyC6srb_Bxi4BHEMOib7O5CHa0s';

const CAMERA_HEIGHT = 3000000;
const POINT_PIXEL_SIZE = 20;
const SRIHARIKOTA_COORDS = { 
  longitude: 80.209822, 
  latitude: 13.742378, 
  height: 100 
};

export function Globe() {
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;

      // FIX BLURRINESS: Use native device resolution
      viewer.resolutionScale = window.devicePixelRatio || 1.0;

      // Load HIGH-QUALITY terrain
      createWorldTerrainAsync().then((terrainProvider) => {
        viewer.terrainProvider = terrainProvider;
      });

      // ULTRA-SHARP SETTINGS
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.fxaa = true; // Anti-aliasing
      viewer.scene.globe.maximumScreenSpaceError = 0.8; // Lower = sharper (was 1.0)
      viewer.scene.globe.tileCacheSize = 1000; // More tiles cached = sharper
      
      // High-res texture loading
      viewer.scene.globe.preloadAncestors = true;
      viewer.scene.globe.preloadSiblings = true;

      // Better atmosphere
      viewer.scene.skyAtmosphere.brightnessShift = 0.3;
      viewer.scene.skyAtmosphere.hueShift = -0.05;

      // Remove fog (makes it clearer)
      viewer.scene.fog.enabled = false;
      viewer.scene.fog.density = 0;

      // Better shadows (optional - can slow down)
      // viewer.shadows = true;

      // Fly to India
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          SRIHARIKOTA_COORDS.longitude,
          SRIHARIKOTA_COORDS.latitude,
          CAMERA_HEIGHT
        ),
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-45),
          roll: 0.0,
        },
        duration: 3,
      });
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Viewer
        ref={viewerRef}
        full
        timeline={false}
        animation={false}
        homeButton={false}
        geocoder={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        baseLayerPicker={false}
        fullscreenButton={false}
        vrButton={false}
        infoBox={false}
        selectionIndicator={false}
        requestRenderMode={false} // Force continuous rendering (smoother)
        maximumRenderTimeChange={Infinity} // Always render
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0 
        }}
      >
<Entity
  name="Sriharikota"
  position={Cartesian3.fromDegrees(
    SRIHARIKOTA_COORDS.longitude,
    SRIHARIKOTA_COORDS.latitude,
    SRIHARIKOTA_COORDS.height
  )}
  point={{
    pixelSize: POINT_PIXEL_SIZE,
    color: Color.fromCssColorString('#ff1a40'),
    outlineColor: Color.fromCssColorString('#ffffff'),
    outlineWidth: 3,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  }}
  label={{
    text: 'ISRO Sriharikota',
    font: '18px sans-serif',
    fillColor: Color.WHITE,
    outlineColor: Color.BLACK,
    outlineWidth: 3,
    style: LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cartesian2(0, -35),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    showBackground: true,
    backgroundColor: Color.fromCssColorString('rgba(0, 0, 0, 0.8)'),
    backgroundPadding: new Cartesian2(10, 6),
    eyeOffset: new Cartesian3(0, 0, 0),
    horizontalOrigin: 0, // CENTER
    verticalOrigin: 1, // BOTTOM
  }}
  description="Satish Dhawan Space Centre"
/>

      </Viewer>
    </div>
  );
}
