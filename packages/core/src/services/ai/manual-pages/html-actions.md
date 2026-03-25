# LiveApp Actions

LiveApps can register actions that the AI can invoke by name.

Use `window.DeskTalk.actions` to register, replace, or remove actions at runtime.

## API

```html
<script>
  await window.DeskTalk.actions.register({
    name: 'Add Task',
    description: 'Create a task in the board',
    params: {
      title: { type: 'string', description: 'Task title', required: true },
      column: { type: 'string', description: 'Optional target column' },
    },
    handler: async ({ title, column }) => {
      addTask(title, column || 'Todo');
      return { created: true };
    },
  });

  await window.DeskTalk.actions.unregister('Add Task');
  await window.DeskTalk.actions.clear();
</script>
```

## Behavior

- `register()` requires `name` and `handler`.
- Registering an action with an existing name replaces the previous action.
- `handler` receives one params object and can return any JSON-serializable result.
- `unregister(name)` removes one action.
- `clear()` removes all LiveApp-registered actions for the current page state.

## Sub-Page Pattern

When the user navigates between in-app views, clear old actions before registering the new view's actions.

```html
<script>
  function showBoardPage() {
    window.DeskTalk.actions.clear();
    window.DeskTalk.actions.register({
      name: 'Add Task',
      description: 'Create a task in the board',
      handler: async ({ title }) => {
        addTask(title);
      },
      params: {
        title: { type: 'string', required: true },
      },
    });
  }

  function showSettingsPage() {
    window.DeskTalk.actions.clear();
    window.DeskTalk.actions.register({
      name: 'Save Settings',
      description: 'Persist the current settings form',
      handler: async () => saveSettings(),
    });
  }
</script>
```

## Reloads

LiveApp actions are tied to the current iframe session.

- If the LiveApp reloads, previous action registrations are cleared.
- Re-register actions during page startup or view initialization.
- The AI will see the latest registered actions in the focused Preview window's Desktop Context.
