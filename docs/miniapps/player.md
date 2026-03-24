# Player MiniApp Specification

## Overview

The Player MiniApp is a media player that supports two modes:

1. **Audio mode** -- playback for MP3, WAV, OGG, FLAC, AAC, and M4A files with transport controls, seek bar, and volume.
2. **Video mode** -- playback for MP4, WebM, and MOV files with native video controls filling the viewport.

Player is launched from the File Explorer when a user opens a supported media file, or programmatically by the AI via the `desktop` tool.

## Features

### Core -- Audio Mode

- Open and play audio files from the File Explorer.
- Supported formats: MP3 (`.mp3`), WAV (`.wav`), OGG (`.ogg`), FLAC (`.flac`), AAC (`.aac`), M4A (`.m4a`).
- Play, pause, and seek via transport controls and keyboard shortcuts.
- Volume control with mute toggle.
- Time display showing current position and total duration.
- Navigate to the previous/next audio file in the same directory.

### Core -- Video Mode

- Open and play video files from the File Explorer.
- Supported formats: MP4 (`.mp4`), WebM (`.webm`), MOV (`.mov`).
- Native `<video>` element with built-in browser controls (play/pause, seek, volume, fullscreen).
- Navigate to the previous/next video file in the same directory.

### Sibling Navigation

Sibling navigation is scoped by media type. In audio mode, previous/next cycles only through audio files in the same directory. In video mode, previous/next cycles only through video files. This prevents unexpected mode switches while navigating.

### Integration with File Explorer

- Double-clicking a supported audio or video file in the File Explorer opens Player because Player is the default app for those file types.
- Right-clicking a supported file shows `Open` and `Open with`; `Open` uses Player as the default app, while `Open with` lists every MiniApp whose manifest declares support for that file type.
- Player appears in `Open with` for all supported audio and video extensions.
- Player receives the file path via launch `args` to enable immediate playback.
- Opening Player for the same file path focuses the existing Player window instead of opening a duplicate.
- Opening Player for a different file path opens a separate Player window.
- If the file is not a supported format, Player shows an unsupported-format message.

## UI Layout

### Audio Mode

```
|---------------------------------------------|
| [<] [>]  song.mp3                           |
|---------------------------------------------|
|                                              |
|               (file icon)                    |
|              song.mp3                        |
|                                              |
|     0:42 ====|================= 3:15         |
|         [<<] [play/pause] [>>]               |
|         volume: [====|=======]               |
|                                              |
|---------------------------------------------|
```

### Video Mode

```
|---------------------------------------------|
| [<] [>]  video.mp4                          |
|---------------------------------------------|
|                                              |
|          (native <video> element             |
|           fills viewport with                |
|           browser controls)                  |
|                                              |
|---------------------------------------------|
```

### Elements

- **Toolbar**: Top bar showing the current filename and previous/next navigation buttons for cycling through sibling media files.
- **Audio Viewport** (audio mode only): Centered layout with a large file icon, filename, seek bar with time display, transport controls (previous track, play/pause, next track), and a volume slider.
- **Video Viewport** (video mode only): A native `<video>` element with the `controls` attribute, filling the content area below the toolbar.

### Interactions

#### Audio Mode

- Click play/pause button or press `Space` to toggle playback.
- Click the seek bar or press `Left` / `Right` arrow keys to seek (5-second increments).
- Press `Up` / `Down` arrow keys to adjust volume (10% increments).
- Press `M` to toggle mute.
- Previous/Next buttons or `Shift+Left` / `Shift+Right` to navigate sibling audio files.

#### Video Mode

- The native `<video>` element handles its own play/pause, seek, volume, and fullscreen controls.
- `Space` toggles play/pause.
- Previous/Next buttons or `Shift+Left` / `Shift+Right` to navigate sibling video files.

## Player Mode Detection

Player determines its mode from the file extension in the launch `args`:

| Args                       | Mode  | Source        |
| -------------------------- | ----- | ------------- |
| `{ path: "<audio file>" }` | Audio | File Explorer |
| `{ path: "<video file>" }` | Video | File Explorer |

When `path` ends in an audio extension (`.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.m4a`), Player enters audio mode. When `path` ends in a video extension (`.mp4`, `.webm`, `.mov`), Player enters video mode. The mode may change when navigating siblings only if the user explicitly opens a file of a different type, but sibling navigation itself stays within the same type.

## Frontend Components

| Component     | Responsibility                                                              |
| ------------- | --------------------------------------------------------------------------- |
| PlayerToolbar | Renders filename display and prev/next navigation buttons                   |
| AudioPlayer   | Audio playback view with seek bar, time display, transport controls, volume |
| VideoPlayer   | Video playback view with native `<video>` element and controls              |
| PlayerActions | Provides AI-invokable actions via `<ActionsProvider>`                       |

## Actions (AI-invokable)

| Action        | Description                                    | Parameters |
| ------------- | ---------------------------------------------- | ---------- |
| Get State     | Return the current player mode and opened file | --         |
| Open File     | Open a media file for playback                 | path       |
| Play          | Start or resume playback                       | --         |
| Pause         | Pause playback                                 | --         |
| Previous File | Navigate to previous media file in directory   | --         |
| Next File     | Navigate to next media file in directory       | --         |

`Get State` returns `PlayerActionState`, including `file.path` when a file is open and `playing` indicating whether playback is active.

## Backend

No HTTP server. All logic in `activate` function via core hooks.

### Root Directory

Operates within the authenticated user's home directory via `ctx.fs` (`<data>/home/<username>/`). The backend reads media files and lists sibling media files in the same directory. Core's FileSystemHook enforces scoping and prevents traversal outside that home directory.

### Commands (MessagingHook)

| Command         | Request         | Response    | Description                                         |
| --------------- | --------------- | ----------- | --------------------------------------------------- |
| player.open     | { path }        | MediaFile   | Open a media file and return its data as a data URL |
| player.siblings | { path }        | SiblingList | List media files of the same type in the directory  |
| player.next     | { currentPath } | MediaFile   | Open the next media file of the same type           |
| player.previous | { currentPath } | MediaFile   | Open the previous media file of the same type       |

### Data Model

```ts
interface MediaFile {
  name: string;
  path: string; // Relative to root
  mimeType: string; // e.g. "audio/mpeg", "video/mp4"
  dataUrl: string; // Base64-encoded data URL for playback
  kind: 'audio' | 'video';
}

interface SiblingList {
  files: SiblingEntry[];
  currentIndex: number; // Index of the current file in the list
}

interface SiblingEntry {
  name: string;
  path: string; // Relative to root
}

interface PlayerOpenedFileState {
  name: string;
  path: string;
  kind: 'audio' | 'video';
  mimeType: string;
}

interface PlayerActionState {
  mode: 'audio' | 'video';
  playing: boolean;
  file: PlayerOpenedFileState | null;
}
```

`Get State` returns `PlayerActionState`, so the agent can inspect the current player mode, playback state, and the currently opened file.

### Supported MIME Types

| Extension | MIME Type         | Mode  |
| --------- | ----------------- | ----- |
| `.mp3`    | `audio/mpeg`      | Audio |
| `.wav`    | `audio/wav`       | Audio |
| `.ogg`    | `audio/ogg`       | Audio |
| `.flac`   | `audio/flac`      | Audio |
| `.aac`    | `audio/aac`       | Audio |
| `.m4a`    | `audio/mp4`       | Audio |
| `.mp4`    | `video/mp4`       | Video |
| `.webm`   | `video/webm`      | Video |
| `.mov`    | `video/quicktime` | Video |

### File Serving

Media files are read via `ctx.fs.readFileBase64()` and returned as base64-encoded data URLs (`data:<mimeType>;base64,...`). The frontend uses these data URLs as the `src` attribute for `<audio>` and `<video>` elements. This is consistent with how the Preview MiniApp serves images.

For large video files, base64 encoding over WebSocket introduces overhead. This is an acceptable V1 tradeoff for architectural consistency. A future optimization could introduce chunked streaming or a dedicated binary endpoint in the core.
