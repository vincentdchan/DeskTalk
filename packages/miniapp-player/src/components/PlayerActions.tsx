import React, { useCallback } from 'react';
import { Action, ActionsProvider } from '@desktalk/sdk';
import type { PlayerActionState } from '../types';

interface PlayerActionsProps {
  children: React.ReactNode;
  state: PlayerActionState;
  onOpenFile: (path: string) => Promise<PlayerActionState | { error: string }>;
  onPlay: () => Promise<PlayerActionState | { error: string }>;
  onPause: () => Promise<PlayerActionState | { error: string }>;
  onPrevious: () => Promise<PlayerActionState | { error: string }>;
  onNext: () => Promise<PlayerActionState | { error: string }>;
}

export function PlayerActions({
  children,
  state,
  onOpenFile,
  onPlay,
  onPause,
  onPrevious,
  onNext,
}: PlayerActionsProps) {
  const handleGetState = useCallback(async () => state, [state]);

  const handleOpenFile = useCallback(
    async (params?: Record<string, unknown>) => {
      const path = typeof params?.path === 'string' ? params.path : '';
      if (!path) {
        return { error: 'path parameter is required' };
      }
      return onOpenFile(path);
    },
    [onOpenFile],
  );

  return (
    <ActionsProvider>
      <Action
        name="Get State"
        description="Return the current player state"
        handler={handleGetState}
      />
      <Action
        name="Open File"
        description="Open a supported audio or video file"
        params={{
          path: { type: 'string', description: 'Relative media file path', required: true },
        }}
        handler={handleOpenFile}
      />
      <Action name="Play" description="Start or resume playback" handler={onPlay} />
      <Action name="Pause" description="Pause playback" handler={onPause} />
      <Action
        name="Previous File"
        description="Open the previous sibling media file"
        handler={onPrevious}
      />
      <Action name="Next File" description="Open the next sibling media file" handler={onNext} />
      {children}
    </ActionsProvider>
  );
}
