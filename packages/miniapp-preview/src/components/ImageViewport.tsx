import React, { useRef, useEffect, useCallback, useState } from 'react';
import styles from '../PreviewApp.module.css';

const PAN_STEP = 50;

interface ImageViewportProps {
  dataUrl: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function ImageViewport({ dataUrl, zoom, onZoomChange }: ImageViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset pan when image changes
  useEffect(() => {
    setPanX(0);
    setPanY(0);
  }, [dataUrl]);

  // ─── Wheel zoom ──────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.1, Math.min(10, zoom + delta));
      onZoomChange(newZoom);
    },
    [zoom, onZoomChange],
  );

  // ─── Click-and-drag panning ──────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    },
    [panX, panY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPanX(dragStart.current.panX + dx);
      setPanY(dragStart.current.panY + dy);
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ─── Keyboard navigation ──────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setPanY((y) => y + PAN_STEP);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPanY((y) => y - PAN_STEP);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPanX((x) => x + PAN_STEP);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPanX((x) => x - PAN_STEP);
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, []);

  /** Expose a method to pan from parent (used by actions) */
  const panInDirection = useCallback((direction: string) => {
    switch (direction) {
      case 'up':
        setPanY((y) => y + PAN_STEP);
        break;
      case 'down':
        setPanY((y) => y - PAN_STEP);
        break;
      case 'left':
        setPanX((x) => x + PAN_STEP);
        break;
      case 'right':
        setPanX((x) => x - PAN_STEP);
        break;
    }
  }, []);

  // Store panInDirection on the container element for external access
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      (el as HTMLDivElement & { panInDirection?: (d: string) => void }).panInDirection =
        panInDirection;
    }
  }, [panInDirection]);

  return (
    <div
      ref={containerRef}
      className={styles.viewport}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      tabIndex={0}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <img
        className={styles.image}
        src={dataUrl}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
        }}
      />
    </div>
  );
}
