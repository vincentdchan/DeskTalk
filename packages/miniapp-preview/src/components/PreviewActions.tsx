import React, { useCallback } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { PreviewActionState, PreviewFile, PreviewMode } from '../types';

interface PreviewActionsProps {
  children: React.ReactNode;
  state: PreviewActionState;
  onFileOpened: (file: PreviewFile) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToWindow: () => void;
  onActualSize: () => void;
  onPan: (direction: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function PreviewActions({
  children,
  state,
  onFileOpened,
  onZoomIn,
  onZoomOut,
  onFitToWindow,
  onActualSize,
  onPan,
  onPrevious,
  onNext,
}: PreviewActionsProps) {
  const openFile = useCommand<{ path: string }, PreviewFile>('preview.open');

  const handleOpen = useCallback(
    async (params?: Record<string, unknown>) => {
      const path = params?.path as string;
      if (!path) return { error: 'path parameter is required' };
      const file = await openFile({ path });
      onFileOpened(file);
      return file;
    },
    [openFile, onFileOpened],
  );

  const handleGetState = useCallback(async () => state, [state]);

  const handleZoomIn = useCallback(async () => {
    onZoomIn();
  }, [onZoomIn]);

  const handleZoomOut = useCallback(async () => {
    onZoomOut();
  }, [onZoomOut]);

  const handleFitToWindow = useCallback(async () => {
    onFitToWindow();
  }, [onFitToWindow]);

  const handleActualSize = useCallback(async () => {
    onActualSize();
  }, [onActualSize]);

  const handlePan = useCallback(
    async (params?: Record<string, unknown>) => {
      const direction = params?.direction as string;
      if (!direction) return { error: 'direction parameter is required' };
      onPan(direction);
    },
    [onPan],
  );

  const handlePrevious = useCallback(async () => {
    onPrevious();
  }, [onPrevious]);

  const handleNext = useCallback(async () => {
    onNext();
  }, [onNext]);

  const isImage = state.mode === 'image';

  return (
    <ActionsProvider>
      <Action
        name="Get State"
        description="Get the current preview mode and opened file"
        handler={handleGetState}
      />
      <Action
        name="Open File"
        description="Open an image or HTML file for preview"
        params={{
          path: { type: 'string', description: 'Path to the file', required: true },
        }}
        handler={handleOpen}
      />
      {isImage && (
        <>
          <Action
            name="Zoom In"
            description="Increase zoom level by one step"
            handler={handleZoomIn}
          />
          <Action
            name="Zoom Out"
            description="Decrease zoom level by one step"
            handler={handleZoomOut}
          />
          <Action
            name="Fit to Window"
            description="Scale image to fit the viewport"
            handler={handleFitToWindow}
          />
          <Action
            name="Actual Size"
            description="Display image at 1:1 pixel ratio"
            handler={handleActualSize}
          />
          <Action
            name="Pan"
            description="Pan the viewport in a direction"
            params={{
              direction: {
                type: 'string',
                description: 'Direction to pan: "up", "down", "left", or "right"',
                required: true,
              },
            }}
            handler={handlePan}
          />
          <Action
            name="Previous File"
            description="Navigate to previous image in directory"
            handler={handlePrevious}
          />
          <Action
            name="Next File"
            description="Navigate to next image in directory"
            handler={handleNext}
          />
        </>
      )}
      {children}
    </ActionsProvider>
  );
}
