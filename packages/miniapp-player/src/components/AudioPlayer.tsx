import React from 'react';
import styles from './AudioPlayer.module.css';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

interface AudioPlayerProps {
  fileName: string;
  src: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function AudioPlayer({
  fileName,
  src,
  playing,
  currentTime,
  duration,
  volume,
  muted,
  canGoPrevious,
  canGoNext,
  audioRef,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeek,
  onTogglePlayback,
  onToggleMute,
  onVolumeChange,
  onPrevious,
  onNext,
}: AudioPlayerProps) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const seekValue = Math.min(currentTime, safeDuration);

  return (
    <div className={styles.shell}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
      />

      <div className={styles.hero}>
        <div className={styles.icon}>{'\u{1F3B5}'}</div>
        <div className={styles.title}>{fileName}</div>
      </div>

      <div className={styles.seekGroup}>
        <span className={styles.time}>{formatTime(currentTime)}</span>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={safeDuration || 0}
          step={0.1}
          value={seekValue}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
        <span className={styles.time}>{formatTime(duration)}</span>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.transportButton}
          onClick={onPrevious}
          disabled={!canGoPrevious}
          title="Previous file"
        >
          {'\u23EE'}
        </button>
        <button type="button" className={styles.playButton} onClick={onTogglePlayback}>
          {playing ? '\u23F8' : '\u25B6'}
        </button>
        <button
          type="button"
          className={styles.transportButton}
          onClick={onNext}
          disabled={!canGoNext}
          title="Next file"
        >
          {'\u23ED'}
        </button>
      </div>

      <div className={styles.volumeGroup}>
        <span className={styles.label}>Volume</span>
        <button type="button" className={styles.muteButton} onClick={onToggleMute} title="Mute">
          {muted || volume === 0 ? '\u{1F507}' : '\u{1F50A}'}
        </button>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
