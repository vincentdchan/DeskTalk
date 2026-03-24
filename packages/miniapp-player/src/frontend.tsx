import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';
import { MiniAppIdProvider, WindowIdProvider, useCommand } from '@desktalk/sdk';
import styles from './PlayerApp.module.css';
import { AudioPlayer } from './components/AudioPlayer';
import { PlayerActions } from './components/PlayerActions';
import { PlayerToolbar } from './components/PlayerToolbar';
import { VideoPlayer } from './components/VideoPlayer';
import type { MediaFile, PlayerActionState, SiblingList } from './types';

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.1;

function createActionState(currentFile: MediaFile | null, playing: boolean): PlayerActionState {
  return {
    mode: currentFile?.kind ?? 'audio',
    playing,
    file: currentFile
      ? {
          name: currentFile.name,
          path: currentFile.path,
          kind: currentFile.kind,
          mimeType: currentFile.mimeType,
        }
      : null,
  };
}

function PlayerApp({ initialPath }: { initialPath?: string }) {
  const openFile = useCommand<{ path: string }, MediaFile>('player.open');
  const getSiblings = useCommand<{ path: string }, SiblingList>('player.siblings');
  const nextFile = useCommand<{ currentPath: string }, MediaFile>('player.next');
  const previousFile = useCommand<{ currentPath: string }, MediaFile>('player.previous');

  const [currentFile, setCurrentFile] = useState<MediaFile | null>(null);
  const [siblings, setSiblings] = useState<SiblingList | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getActiveMediaElement = useCallback(() => {
    return currentFile?.kind === 'video' ? videoRef.current : audioRef.current;
  }, [currentFile?.kind]);

  const syncPlaybackMetrics = useCallback(() => {
    const media = currentFile?.kind === 'video' ? videoRef.current : audioRef.current;
    if (!media) return;
    setCurrentTime(media.currentTime || 0);
    setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    setVolume(media.volume);
    setMuted(media.muted);
  }, [currentFile?.kind]);

  const loadMedia = useCallback(
    async (path: string) => {
      const file = await openFile({ path });
      setCurrentFile(file);
      setError(null);
      setCurrentTime(0);
      setDuration(0);
      const nextSiblings = await getSiblings({ path: file.path });
      setSiblings(nextSiblings);
      return file;
    },
    [getSiblings, openFile],
  );

  const loadMediaSafe = useCallback(
    async (path: string) => {
      try {
        const file = await loadMedia(path);
        return createActionState(file, false);
      } catch (err) {
        setCurrentFile(null);
        setSiblings(null);
        setPlaying(false);
        setError(err instanceof Error ? err.message : 'Failed to open media file.');
        return { error: err instanceof Error ? err.message : 'Failed to open media file.' };
      }
    },
    [loadMedia],
  );

  useEffect(() => {
    if (!initialPath) return;
    void loadMediaSafe(initialPath);
  }, [initialPath, loadMediaSafe]);

  useEffect(() => {
    if (!currentFile) return;
    const media = currentFile.kind === 'video' ? videoRef.current : audioRef.current;
    if (!media) return;

    media.currentTime = 0;
    media.muted = muted;
    media.volume = volume;
    const playPromise = media.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setPlaying(false);
      });
    }
  }, [currentFile, muted, volume]);

  const handlePrevious = useCallback(async () => {
    if (!currentFile) {
      return { error: 'No media file is open.' };
    }
    try {
      const file = await previousFile({ currentPath: currentFile.path });
      setCurrentFile(file);
      setError(null);
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setSiblings(await getSiblings({ path: file.path }));
      return createActionState(file, false);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to open previous file.' };
    }
  }, [currentFile, getSiblings, previousFile]);

  const handleNext = useCallback(async () => {
    if (!currentFile) {
      return { error: 'No media file is open.' };
    }
    try {
      const file = await nextFile({ currentPath: currentFile.path });
      setCurrentFile(file);
      setError(null);
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setSiblings(await getSiblings({ path: file.path }));
      return createActionState(file, false);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to open next file.' };
    }
  }, [currentFile, getSiblings, nextFile]);

  const togglePlayback = useCallback(async () => {
    const media = getActiveMediaElement();
    if (!media) return;
    if (media.paused) {
      await media.play();
    } else {
      media.pause();
    }
  }, [getActiveMediaElement]);

  const handlePlay = useCallback(async () => {
    const media = getActiveMediaElement();
    if (!media) return { error: 'No media file is open.' };
    await media.play();
    return createActionState(currentFile, true);
  }, [currentFile, getActiveMediaElement]);

  const handlePause = useCallback(async () => {
    const media = getActiveMediaElement();
    if (!media) return { error: 'No media file is open.' };
    media.pause();
    return createActionState(currentFile, false);
  }, [currentFile, getActiveMediaElement]);

  const handleSeek = useCallback(
    (time: number) => {
      const media = getActiveMediaElement();
      if (!media) return;
      media.currentTime = time;
      setCurrentTime(time);
    },
    [getActiveMediaElement],
  );

  const handleVolumeChange = useCallback(
    (nextVolume: number) => {
      const media = getActiveMediaElement();
      const normalized = Math.max(0, Math.min(1, nextVolume));
      if (media) {
        media.volume = normalized;
        media.muted = normalized === 0;
      }
      setVolume(normalized);
      setMuted(normalized === 0);
    },
    [getActiveMediaElement],
  );

  const handleToggleMute = useCallback(() => {
    const media = getActiveMediaElement();
    if (!media) return;
    const nextMuted = !media.muted;
    media.muted = nextMuted;
    setMuted(nextMuted);
  }, [getActiveMediaElement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!currentFile) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        void handlePrevious();
        return;
      }

      if (event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault();
        void handleNext();
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        void togglePlayback();
        return;
      }

      if (currentFile.kind !== 'audio') {
        return;
      }

      const media = audioRef.current;
      if (!media) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleSeek(Math.max(0, media.currentTime - SEEK_STEP_SECONDS));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleSeek(Math.min(media.duration || 0, media.currentTime + SEEK_STEP_SECONDS));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        handleVolumeChange((media.muted ? 0 : media.volume) + VOLUME_STEP);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        handleVolumeChange((media.muted ? 0 : media.volume) - VOLUME_STEP);
      } else if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        handleToggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentFile,
    handleNext,
    handlePrevious,
    handleSeek,
    handleToggleMute,
    handleVolumeChange,
    togglePlayback,
  ]);

  const canNavigate = (siblings?.files.length ?? 0) > 1;
  const actionState = createActionState(currentFile, playing);

  return (
    <PlayerActions
      state={actionState}
      onOpenFile={loadMediaSafe}
      onPlay={handlePlay}
      onPause={handlePause}
      onPrevious={handlePrevious}
      onNext={handleNext}
    >
      <div className={styles.root}>
        <PlayerToolbar
          filename={currentFile?.name ?? 'Player'}
          canGoPrevious={canNavigate}
          canGoNext={canNavigate}
          onPrevious={() => {
            void handlePrevious();
          }}
          onNext={() => {
            void handleNext();
          }}
        />

        <div className={styles.viewport}>
          {currentFile ? (
            currentFile.kind === 'audio' ? (
              <AudioPlayer
                fileName={currentFile.name}
                src={currentFile.dataUrl}
                playing={playing}
                currentTime={currentTime}
                duration={duration}
                volume={volume}
                muted={muted}
                canGoPrevious={canNavigate}
                canGoNext={canNavigate}
                audioRef={audioRef}
                onLoadedMetadata={syncPlaybackMetrics}
                onTimeUpdate={syncPlaybackMetrics}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onSeek={handleSeek}
                onTogglePlayback={() => {
                  void togglePlayback();
                }}
                onToggleMute={handleToggleMute}
                onVolumeChange={handleVolumeChange}
                onPrevious={() => {
                  void handlePrevious();
                }}
                onNext={() => {
                  void handleNext();
                }}
              />
            ) : (
              <VideoPlayer
                src={currentFile.dataUrl}
                videoRef={videoRef}
                onLoadedMetadata={syncPlaybackMetrics}
                onTimeUpdate={syncPlaybackMetrics}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            )
          ) : error ? (
            <div className={styles.errorState}>
              <div className={styles.errorIcon}>{'\u26A0'}</div>
              <div>{error}</div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div>No media file open</div>
              <div className={styles.hint}>
                Open a supported audio or video file from File Explorer, or launch Player with a
                `path` argument.
              </div>
            </div>
          )}
        </div>
      </div>
    </PlayerActions>
  );
}

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const initialPath = typeof ctx.args?.path === 'string' ? ctx.args.path : undefined;
  const root = createRoot(ctx.root);

  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <PlayerApp initialPath={initialPath} />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
