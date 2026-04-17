// src/components/Globe/PadInsetView.tsx
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as Cesium from "cesium";
import type { Launch, Pad } from "../../lib/api";
import "./PadInsetView.css";

interface PadInsetViewProps {
  pad?: Pad | null;
  launch?: Launch | null;
  timelineActive?: boolean;
}

export function PadInsetView({
  pad,
  launch,
  timelineActive = false,
}: PadInsetViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const markerRef = useRef<Cesium.Entity | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current && !viewerRef.current.isDestroyed()) return;

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
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });

    viewer.scene.globe.enableLighting = false;
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Infinity;

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
      if (viewerRef.current === viewer) {
        viewerRef.current = null;
      }
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !pad) return;

    const position = Cesium.Cartesian3.fromDegrees(
      pad.longitude,
      pad.latitude,
      800
    );

    viewer.camera.setView({
      destination: position
    });

    if (!markerRef.current) {
      markerRef.current = viewer.entities.add({
        id: "pad-inset-marker",
        position: new Cesium.ConstantPositionProperty(position),
        point: new Cesium.PointGraphics({
          pixelSize: 18,
          color: Cesium.Color.WHITE.withAlpha(0.9),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
          outlineWidth: 2,
        }),
      });
    } else {
      markerRef.current.position = new Cesium.ConstantPositionProperty(position);
    }

    viewer.scene.requestRender();
  }, [pad]);

  if (!pad) return null;

  const overlayStyle = {
    "--overlay-bottom-desktop": timelineActive
      ? "calc(var(--space-6) + var(--timeline-height))"
      : "var(--space-6)",
    "--overlay-bottom-mobile": timelineActive
      ? "calc(var(--space-4) + var(--timeline-height-mobile))"
      : "var(--space-4)",
  } as CSSProperties;

  return (
    <div className="pad-inset-view" style={overlayStyle}>
      <div className="inset-header">
        <span className="inset-title">{pad.name}</span>
        <span className="inset-subtitle">{launch?.name}</span>
      </div>
      <div ref={containerRef} className="inset-viewer" />
    </div>
  );
}
