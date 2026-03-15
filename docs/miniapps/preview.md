# Preview MiniApp Specification

## Overview

The Preview MiniApp is an image viewer modeled after macOS Preview. It is launched from the File Explorer when a user opens a supported image file. In its first version, Preview supports viewing JPEG, PNG, and WebP images with standard viewing controls such as zoom, pan, and file navigation.

## Features

### Core

- Open and display images from the File Explorer.
- Supported formats: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`).
- Zoom in and zoom out with configurable step.
- Fit-to-window and actual-size (1:1) display modes.
- Pan (move) the image in all directions when zoomed in.
- Navigate to the previous/next image in the same directory.

### Integration with File Explorer

- Double-clicking a supported image file in the File Explorer opens Preview.
- Preview receives the file path and its parent directory path to enable sibling navigation.
- If the file is not a supported format, Preview shows an unsupported-format message.

## UI Layout

Toolbar (zoom controls, navigation) | Image viewport (zoomable, pannable)

### Elements

- **Toolbar**: Top bar with zoom in/out buttons, zoom percentage indicator, fit-to-window button, actual-size button, previous/next file buttons, and the current filename.
- **Image Viewport**: Central area displaying the image. Supports mouse-wheel zoom, click-and-drag panning, and pinch-to-zoom on trackpad.

### Interactions

- Scroll wheel or pinch gesture to zoom in/out.
- Click and drag to pan when the image is larger than the viewport.
- Toolbar buttons for zoom in, zoom out, fit-to-window, actual size.
- Previous/Next buttons or left/right arrow keys to navigate sibling images.
- Keyboard shortcuts: `+` / `=` to zoom in, `-` to zoom out, `0` to fit-to-window, arrow keys to pan, `←` / `→` to navigate previous/next.

## Frontend Components

| Component | Responsibility |
|-----------|----------------|
| PreviewToolbar | Renders zoom controls, fit/actual-size buttons, prev/next navigation, filename display |
| ImageViewport | Displays the image with zoom and pan support, handles mouse/wheel/keyboard events |
| PreviewActions | Provides actions via `<ActionsProvider>` |

## Actions (AI-invokable)

| Action | Description | Parameters |
|--------|-------------|------------|
| Open File | Open an image file for preview | path |
| Zoom In | Increase zoom level by one step | -- |
| Zoom Out | Decrease zoom level by one step | -- |
| Fit to Window | Scale image to fit the viewport | -- |
| Actual Size | Display image at 1:1 pixel ratio | -- |
| Pan | Pan the viewport in a direction | direction: "up" \| "down" \| "left" \| "right" |
| Previous File | Navigate to previous image in directory | -- |
| Next File | Navigate to next image in directory | -- |

## Backend

No HTTP server. All logic in `activate` function via core hooks.

### Root Directory

Operates within the scoped data directory via `ctx.fs`. The backend reads image files and lists sibling images in the same directory. Core's FileSystemHook enforces scoping and prevents traversal.

### Commands (MessagingHook)

| Command | Request | Response | Description |
|---------|---------|----------|-------------|
| preview.open | { path } | PreviewFile | Open an image file and return its data |
| preview.siblings | { path } | SiblingList | List supported image files in the same directory |
| preview.next | { currentPath } | PreviewFile | Open the next image in the directory |
| preview.previous | { currentPath } | PreviewFile | Open the previous image in the directory |

### Data Model

```ts
interface PreviewFile {
  name: string;
  path: string;        // Relative to root
  mimeType: string;    // e.g. "image/png"
  dataUrl: string;     // Base64-encoded data URL for rendering
  width: number;       // Image intrinsic width in pixels
  height: number;      // Image intrinsic height in pixels
}

interface SiblingList {
  files: SiblingEntry[];
  currentIndex: number; // Index of the current file in the list
}

interface SiblingEntry {
  name: string;
  path: string; // Relative to root
}
```

### Supported MIME Types

| Extension | MIME Type |
|-----------|-----------|
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.webp` | `image/webp` |
