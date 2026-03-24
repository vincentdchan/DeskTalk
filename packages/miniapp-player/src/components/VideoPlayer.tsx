import React from 'react';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
}

export function VideoPlayer({
  src,
  videoRef,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
}: VideoPlayerProps) {
  return (
    <div className={styles.frame}>
      <video
        ref={videoRef}
        className={styles.video}
        src={src}
        controls
        autoPlay
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
      />
    </div>
  );
}
