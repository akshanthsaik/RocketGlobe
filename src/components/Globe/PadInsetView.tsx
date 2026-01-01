// src/components/Globe/PadInsetView.tsx
import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "./PadInsetView.css";

interface PadInsetViewProps {
  pad: any;
  launch: any;
}

export function PadInsetView({ pad, launch }: PadInsetViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current || !pad) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      navigationInstructionsInitiallyVisible: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider()
    });

    viewer.scene.globe.enableLighting = false;

    // Initial close view
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        pad.longitude,
        pad.latitude,
        800
      )
    });

    // Add pad marker
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pad.longitude, pad.latitude),
      point: {
        pixelSize: 20,
        color: Cesium.Color.RED.withAlpha(0.9),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3
      }
    });

    // --- IMPORTANT PART: Limit zoom so you never see the whole globe ---
    const controller = viewer.scene.screenSpaceCameraController;

    // Still allow interaction, but keep it local
    controller.minimumZoomDistance = 200;    // don't go underground
    controller.maximumZoomDistance = 4000;   // prevents zooming out into space

    // Optional: soften mouse wheel zoom speed
    controller.zoomEventTypes = [
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH
    ];

    viewerRef.current = viewer;

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, [pad]);

  if (!pad) return null;

  return (
    <div className="pad-inset-view">
      <div className="inset-header">
        <span className="inset-title">{pad.name}</span>
        <span className="inset-subtitle">{launch?.name}</span>
      </div>
      <div ref={containerRef} className="inset-viewer" />
    </div>
  );
}
