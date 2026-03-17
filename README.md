# DeskTalk

An AI-native desktop environment that runs in your browser.

<!-- demo video -->
<!-- ![DeskTalk Demo](link-to-demo-video) -->

## What is this?

DeskTalk is an experiment in building an operating system designed for AI from the ground up. Instead of bolting AI onto traditional apps, every app here — we call them MiniApps — is built to work with AI natively, while still being fully visible and usable by you. Think of it as exploring a new kind of relationship between humans and AI: we still need a GUI, but the way we interact with it needs to change. DeskTalk is our take on what that could look like.

<!-- screenshot -->
<!-- ![Screenshot](link-to-screenshot) -->

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

<!-- getting started video -->
<!-- ![Getting Started](link-to-getting-started-video) -->

## MiniApps

DeskTalk comes with a few built-in MiniApps out of the box:

- **Note** — a simple note-taking app
- **Todo** — task management
- **File Explorer** — browse and manage files
- **Preferences** — system settings

You can also install third-party MiniApps:

```bash
desktalk install <package-name>
```

<!-- miniapps screenshot -->
<!-- ![MiniApps](link-to-miniapps-screenshot) -->

## Contributing

Contributions and suggestions are very much appreciated! Whether it's a bug report, a feature idea, or a pull request — all of it helps shape this project. Feel free to open an issue or submit a PR. We'd love to hear from you.

## License

MIT