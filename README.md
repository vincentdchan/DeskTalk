
![NPM Version](https://img.shields.io/npm/v/%40desktalk%2Fcore)


# DeskTalk

<a href="./README_CN.md">中文版</a>

An AI-native desktop environment that runs in your browser.

<!-- demo video -->
<!-- ![DeskTalk Demo](link-to-demo-video) -->

## What is this?

DeskTalk is an experiment in building an operating system designed for AI from the ground up. Instead of bolting AI onto traditional apps, every piece of the system is built to work with AI natively — while still being fully visible and usable by you.

<img width="3838" height="1634" alt="tail-based-desktop" src="https://github.com/user-attachments/assets/0d7daf0b-145b-4251-bea0-490a14a5d3d2" />


## Goals

### Fully AI-controlled system

DeskTalk is AI-native. Apps are designed for AI first. You describe what you want in natural language or voice, and the AI manipulates windows, invokes actions, edits content, and orchestrates your desktop on your behalf. Every app exposes actions the AI can call, making the entire system programmable through conversation.

### Generative apps

You don't install most of your software in DeskTalk — you generate it. Tell the AI what you need and it creates a **LiveApp**: a self-contained, interactive application that runs directly on your desktop. LiveApps can be edited, persisted, and relaunched across sessions. Build dashboards, trackers, utilities, and visualizations — all through conversation.

## Getting Started

Install DeskTalk from npm:

```bash
npm install -g @desktalk/core
```

Then start it:

```bash
desktalk start
```

That's it. Open your browser and you're in.

You can also customize the host and port:

```bash
desktalk start --host 0.0.0.0 --port 8080
```

### Docker

Pull the published image from GitHub Container Registry:

```bash
docker pull ghcr.io/vincentdchan/desktalk:latest
```

Available tags are published from GitHub releases:

- `latest` for stable releases
- `<version>` such as `0.1.0`
- `alpha` for `*-alpha.*` releases
- `beta` for `*-beta.*` releases
- `next` for `*-rc.*` releases

Then run it with persistent volumes for DeskTalk data and config:

```bash
docker run -p 3000:3000 \
  -v desktalk-data:/home/node/.local/share/desktalk \
  -v desktalk-config:/home/node/.config/desktalk \
  ghcr.io/vincentdchan/desktalk:latest
```

Open `http://localhost:3000` in your browser after the container starts.

The mounted volumes persist DeskTalk state across container restarts:

- `desktalk-data` stores LiveApps, AI sessions, MiniApp data, user files, and embedded databases
- `desktalk-config` stores DeskTalk configuration and AI provider credentials

If you want to use a different port on the host:

```bash
docker run -p 3000:3000 \
  -v desktalk-data:/home/node/.local/share/desktalk \
  -v desktalk-config:/home/node/.config/desktalk \
  ghcr.io/vincentdchan/desktalk:latest
```

If you want to build the image locally instead:

```bash
docker build -t desktalk .
```

<!-- getting started video -->
<!-- ![Getting Started](link-to-getting-started-video) -->

## LiveApps

LiveApps are the core user-facing concept. A user asks the AI for something — "build me a project tracker", "show me a chart of my disk usage" — and the AI generates a LiveApp: a self-contained HTML application that appears on the desktop and persists across sessions.

LiveApps can:

- Execute shell commands and read system state through the DeskTalk bridge
- Persist data with built-in KV and collection storage
- Be edited in-place by the AI when you ask for changes
- Use DeskTalk's full web component library for consistent, themed UI

## Development

For development setup, build commands, testing, and release instructions, see [docs/development.md](./docs/development.md).

## Contributing

Contributions and suggestions are very much appreciated! Whether it's a bug report, a feature idea, or a pull request — all of it helps shape this project. Feel free to open an issue or submit a PR. We'd love to hear from you.

## License

MIT
