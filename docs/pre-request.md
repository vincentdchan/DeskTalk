 
# DeskTalk

DeskTalk is an OS-like app that runs in the browser and includes a backend.
The whole app will be packaged as an npm package.

```
desktalk start
```

To start the server, run the command above. Use options to specify the host and port.

This OS-like app uses a "MiniApp" concept.
Each "MiniApp" can be published as an npm package and should
contain both backend and frontend code. Think of it like a VSCode extension, but managed on npm.

# Windows Management

Window management is the most important part of this app.
The global UI looks like this:


|-----------------------|
| Actions               |
|----------------|------|
|                |      |
|                |      |
|   Windows      | Info |
|                |      |
|                |      |
|----------------|------|
|     Dock like macOS   |
|----------------|------|


The top actions bar should show all actions supported by the currently focused window.

The Info area shows AI information such as thoughts, messages, and token usage.

## Action Provider

When implementing a MiniApp, you should provide "actions" in addition to the page UI.

```jsx
const Page = () => {
    return (
        <div>
            <ActionsProvider>
                <Action name="Add a TODO" description="xxx" />
                <Action name="Delete a TODO" description="xxx" />
            </ActionsProvider>
            <div>
                Content
            </div>
        </div>
    )
}
```

An action is like a "skill" on the page that the AI can invoke.


# Built-in MiniApp

## File Explorer

Keep it simple; implement it as you prefer.

## Preference

An app for configuring window preferences.

Keep it simple; implement it as you prefer.

# Engineering

Use a monorepo with pnpm. Each MiniApp should be an npm package.
The main package references them via dependencies.

## Frontend

Use React as the frontend framework.


# UI

# Please

1. Write an overall spec in `docs/`; if you have any questions, ask me.
2. Write a Markdown spec for each MiniApp in `docs/miniapps`.
