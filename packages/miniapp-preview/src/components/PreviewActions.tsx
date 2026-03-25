import React, { useCallback, useMemo } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { ActionDefinition } from '@desktalk/sdk';
import type { PreviewActionState, PreviewFile } from '../types';
import type { PreviewBridgeActionDefinition } from '../types';

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
  liveAppActions: PreviewBridgeActionDefinition[];
  onInvokeLiveAppAction: (actionName: string, params?: Record<string, unknown>) => Promise<unknown>;
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
  liveAppActions,
  onInvokeLiveAppAction,
}: PreviewActionsProps) {
  const openFile = useCommand<{ path: string }, PreviewFile>('preview.open');
  const resolveAbsolutePath = useCommand<{ path: string }, string>('preview.resolveAbsolutePath');

  const toAbsolutePath = useCallback(
    async (path: string | null | undefined) => {
      if (!path) {
        return path ?? null;
      }

      return resolveAbsolutePath({ path });
    },
    [resolveAbsolutePath],
  );

  const toAgentFile = useCallback(
    async (file: PreviewFile) => ({
      ...file,
      path: await toAbsolutePath(file.path),
    }),
    [toAbsolutePath],
  );

  const handleOpen = useCallback(
    async (params?: Record<string, unknown>) => {
      const path = params?.path as string;
      if (!path) return { error: 'path parameter is required' };
      const file = await openFile({ path });
      onFileOpened(file);
      return toAgentFile(file);
    },
    [onFileOpened, openFile, toAgentFile],
  );

  const handleGetState = useCallback(async () => {
    if (!state.file?.path) {
      return state;
    }

    return {
      ...state,
      file: {
        ...state.file,
        path: await toAbsolutePath(state.file.path),
      },
    };
  }, [state, toAbsolutePath]);

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
  const mergedActions = useMemo(() => {
    const builtinActions: ActionDefinition[] = [
      {
        name: 'Get State',
        description: 'Get the current preview mode and opened file',
        handler: handleGetState,
      },
      {
        name: 'Open File',
        description: 'Open an image or HTML file for preview',
        params: {
          path: { type: 'string', description: 'Path to the file', required: true },
        },
        handler: handleOpen,
      },
    ];

    if (isImage) {
      builtinActions.push(
        {
          name: 'Zoom In',
          description: 'Increase zoom level by one step',
          handler: handleZoomIn,
        },
        {
          name: 'Zoom Out',
          description: 'Decrease zoom level by one step',
          handler: handleZoomOut,
        },
        {
          name: 'Fit to Window',
          description: 'Scale image to fit the viewport',
          handler: handleFitToWindow,
        },
        {
          name: 'Actual Size',
          description: 'Display image at 1:1 pixel ratio',
          handler: handleActualSize,
        },
        {
          name: 'Pan',
          description: 'Pan the viewport in a direction',
          params: {
            direction: {
              type: 'string',
              description: 'Direction to pan: "up", "down", "left", or "right"',
              required: true,
            },
          },
          handler: handlePan,
        },
        {
          name: 'Previous File',
          description: 'Navigate to previous image in directory',
          handler: handlePrevious,
        },
        {
          name: 'Next File',
          description: 'Navigate to next image in directory',
          handler: handleNext,
        },
      );
    }

    const merged = new Map<string, ActionDefinition>();
    for (const action of builtinActions) {
      merged.set(action.name, action);
    }
    for (const action of liveAppActions) {
      merged.set(action.name, {
        ...action,
        handler: async (params) => onInvokeLiveAppAction(action.name, params),
      });
    }

    return Array.from(merged.values());
  }, [
    handleActualSize,
    handleFitToWindow,
    handleGetState,
    handleNext,
    handleOpen,
    handlePan,
    handlePrevious,
    handleZoomIn,
    handleZoomOut,
    isImage,
    liveAppActions,
    onInvokeLiveAppAction,
  ]);

  return (
    <ActionsProvider>
      {mergedActions.map((action) => (
        <Action
          key={action.name}
          name={action.name}
          description={action.description}
          params={action.params}
          handler={action.handler}
        />
      ))}
      {children}
    </ActionsProvider>
  );
}
