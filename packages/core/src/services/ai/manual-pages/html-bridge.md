# HTML Bridge

Generated previews automatically receive `window.DeskTalk`.

For persistent app data, use `window.DeskTalk.storage`. Read `html/storage` for the full storage reference.

## Reading State

Use `await window.DeskTalk.getState(selector)`.

Supported selectors:

- `desktop.summary`
- `desktop.windows`
- `desktop.focusedWindow`
- `theme.current`
- `preview.context`

Example:

```html
<script>
  async function loadDesktopState() {
    const desktop = await window.DeskTalk.getState('desktop.summary');
    console.log(desktop.windows);
  }
</script>
```

## Running Commands

`DeskTalk.exec` and `DeskTalk.execute` are equivalent.

- Shell string form: `await DeskTalk.exec("ls -la")`
- Explicit args form: `await DeskTalk.exec("git", ["status", "--short"])`
- Optional options object: `await DeskTalk.exec("git", ["status"], { cwd: "subdir" })`

Prefer explicit args when user input may be involved.

`DeskTalk.exec()` returns a structured result object, not just stdout text.

TypeScript shape:

```ts
type DeskTalkExecResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  command: {
    program: string;
    args: string[];
    cwd: string;
  };
};
```

Example value:

```ts
const result: DeskTalkExecResult = {
  ok: true,
  exitCode: 0,
  stdout: 'file-a\nfile-b\n',
  stderr: '',
  timedOut: false,
  truncated: false,
  command: {
    program: 'ls',
    args: ['-la'],
    cwd: '/path/to/working/dir',
  },
};
```

Typical usage:

```html
<script>
  async function listFiles() {
    const result = await window.DeskTalk.exec('ls', ['-la']);

    if (!result.ok) {
      console.error('Command failed:', result.stderr || result.exitCode);
      return;
    }

    console.log(result.stdout);
  }
</script>
```

## Persistent Storage

Use `DeskTalk.storage` for durable LiveApp data.

- KV: `await DeskTalk.storage.get('settings')`, `await DeskTalk.storage.set('settings', value)`
- Collections: `const tasks = DeskTalk.storage.collection('tasks')`
- Use collections for lists of records instead of writing large JSON blobs manually.

Example:

```html
<script>
  const tasks = window.DeskTalk.storage.collection('tasks');

  async function addTask(title) {
    await tasks.insert({
      id: crypto.randomUUID(),
      title,
      status: 'todo',
      createdAt: Date.now(),
    });
  }
</script>
```

## Safety

- Dangerous commands such as `rm`, `chmod`, `sudo`, `kill`, or destructive git subcommands trigger a native confirmation dialog.
- Catastrophic commands such as formatting disks or `rm` against `/` are blocked outright.
- The bridge is for constrained interaction; do not assume unrestricted shell access.
- Prefer `DeskTalk.storage` over shell commands for normal app persistence.
