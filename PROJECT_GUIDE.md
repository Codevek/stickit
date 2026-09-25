# StickIt Project Guide

This document is a complete project-context handoff for **StickIt**, a small Windows desktop sticky todo application. It is written so you can paste it into ChatGPT (along with the change you want) without needing to provide the whole source codebase.

## 1. What This Project Is

StickIt is a desktop todo-list widget built with **Tauri 2**, **Rust**, plain **HTML/CSS/JavaScript**, and **SQLite**.

It runs as a small translucent window that stays above other windows. The user can add todos, mark them complete, filter them, change priority, move/resize the widget, and use a tray menu to show, hide, open settings, or quit. A separate settings window controls appearance and a few behavior preferences.

It is **not** a web app in a browser and it does **not** use React, Vue, Vite, or a JavaScript bundler. Tauri loads the HTML files in `src/` directly into the native Windows WebView.

## 2. Technology Stack

| Area | Technology | Why it is used |
| --- | --- | --- |
| Desktop shell | Tauri 2 | Creates native desktop windows, system tray integration, native commands, and installers. |
| Native/backend code | Rust | Handles app startup, windows, tray behavior, database access, and JavaScript-to-native commands. |
| UI | Plain HTML, CSS, JavaScript | Renders the widget and settings interfaces. No frontend framework is involved. |
| Local database | SQLite via `rusqlite` | Stores todos and settings locally in one database file. |
| Build tooling | npm plus Cargo | `npm` starts Tauri's CLI; Tauri invokes Cargo to compile the Rust application. |

## 3. Mental Model: How the Pieces Talk

```text
User clicks/types in the widget or settings window
                |
                v
JavaScript in src/widget.js or src/settings.js
                |
                | window.__TAURI__.core.invoke("command_name", payload)
                v
Rust command in src-tauri/src/commands.rs
                |
                v
SQLite operations in src-tauri/src/db.rs
                |
                v
stickit.db in the application's local data directory
                |
                v
Rust returns JSON-compatible data back to JavaScript
                |
                v
JavaScript updates the HTML UI
```

There are two separate Tauri windows:

| Window label | HTML entry point | Purpose |
| --- | --- | --- |
| `widget` | `src/widget.html` | The always-on-top todo widget. |
| `settings` | `src/settings.html` | The larger configuration window, initially hidden. |

The Rust application creates both windows from configuration. JavaScript only controls the contents and calls approved native APIs.

## 4. Folder Structure

```text
stickIt/
├── package.json                 # npm scripts and JavaScript-side dependencies
├── package-lock.json            # Exact npm dependency versions
├── README.md                    # Existing short project readme
├── PROJECT_GUIDE.md             # This detailed handoff document
├── src/                         # Frontend files loaded by Tauri
│   ├── widget.html              # Main compact todo widget markup
│   ├── widget.css               # Main widget styling and themes
│   ├── widget.js                # Main widget behavior and Tauri calls
│   ├── settings.html            # Settings window markup
│   ├── settings.css             # Settings window styling
│   ├── settings.js              # Settings behavior and persistence
│   ├── index.html               # Unused Tauri starter-template file
│   ├── main.js                  # Unused starter-template JavaScript
│   ├── styles.css               # Unused starter-template CSS
│   └── assets/                  # Starter-template assets; currently unused
└── src-tauri/                   # Rust/Tauri native application
    ├── Cargo.toml               # Rust package/dependency configuration
    ├── Cargo.lock               # Exact Rust dependency versions
    ├── build.rs                 # Tauri build-script entry point
    ├── tauri.conf.json          # Windows, bundle, tray, and app configuration
    ├── icons/                   # App/tray/installer icons
    ├── capabilities/            # Security permissions available to each window
    │   ├── default.json         # Permissions for the widget window
    │   └── settings.json        # Permissions for the settings window
    ├── .cargo/config.toml       # Current Windows GNU linker configuration
    └── src/
        ├── main.rs              # Tiny executable entry point
        ├── lib.rs               # Tauri setup, tray setup, window lifecycle
        ├── commands.rs          # JavaScript-callable Rust commands
        ├── db.rs                # SQLite schema and database queries
        └── models.rs            # Todo/settings Rust data models
```

## 5. Important Configuration Files

### `package.json`

This is the JavaScript/npm entry point. The useful scripts are:

```json
{
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build"
  }
}
```

Use `npm run dev` while developing and `npm run build` for release installers.

It includes `@tauri-apps/api`, which exposes the `window.__TAURI__` APIs used in frontend JavaScript, and `@tauri-apps/cli`, which provides the `tauri` command used by npm scripts.

### `src-tauri/Cargo.toml`

This is Rust's project manifest, similar in role to `package.json`.

Important dependencies:

| Dependency | Use in StickIt |
| --- | --- |
| `tauri` | Native app runtime, windows, tray icon/menu, commands. |
| `tauri-plugin-shell` | Shell integration plugin; registered, though the current UI does not use it. |
| `rusqlite` with `bundled` | SQLite database access; bundled means SQLite is compiled in rather than relying on a system install. |
| `serde` / `serde_json` | Converts Rust structs to and from JavaScript-friendly JSON. |
| `uuid` | Generates todo IDs. |
| `chrono` | Generates timestamps. |

The release profile favors a small executable: size optimization, link-time optimization, stripped debug symbols, and abort-on-panic behavior.

### `src-tauri/tauri.conf.json`

This is the central Tauri configuration.

Key values:

| Setting | Current value/meaning |
| --- | --- |
| `productName` | `StickIt`, the human-readable app name. |
| `identifier` | `com.stickit.app`, the app identifier. It should eventually be changed because ending an identifier with `.app` is discouraged and can conflict with macOS conventions. |
| `build.frontendDist` | `../src`, so Tauri serves the raw frontend files from `src/`; no frontend compilation is required. |
| `app.withGlobalTauri` | `true`, so frontend code can use `window.__TAURI__`. |
| `app.windows` | Defines both the `widget` and `settings` windows. |
| Widget appearance | 240x380, transparent, frameless, always on top, hidden from taskbar. |
| Settings appearance | Uses `settings.html` and starts hidden. |
| `app.trayIcon` | Enables the system tray icon. |
| `bundle.targets` | Builds both MSI and NSIS installers on Windows. |

## 6. Rust Backend, File by File

### `src-tauri/src/main.rs`

This file intentionally does almost nothing:

```rust
fn main() {
    stickit_lib::run();
}
```

It starts the actual application code in `lib.rs`. Keeping `main.rs` small is a common Rust pattern when the app also has a reusable library crate.

### `src-tauri/src/lib.rs`

This is the application composition root. It is responsible for:

1. Starting the Tauri builder and registering the shell plugin.
2. Finding Tauri's application-data directory.
3. Creating the SQLite database and its schema if needed.
4. Loading saved widget coordinates and size from settings.
5. Storing the database in shared Tauri state as `DbState(Mutex<Db>)`.
6. Creating the tray menu: Show Widget, Settings, Quit.
7. Handling tray clicks. A left click toggles widget visibility.
8. Registering all JavaScript-callable commands from `commands.rs`.
9. Intercepting window-close actions and hiding windows instead of destroying them.
10. Preventing an ordinary app-exit request, so the app keeps running in the tray.

The close behavior is important: pressing a close control usually hides the widget/settings window. The tray's Quit item is the intended way to fully close the application.

### `src-tauri/src/models.rs`

This file contains data shapes passed between JavaScript, Rust, and SQLite.

#### Todo models

| Rust model | Used for |
| --- | --- |
| `Todo` | A complete stored todo returned to the frontend. |
| `CreateTodo` | Input payload for creating a todo. |
| `UpdateTodo` | Partial input payload for updating title, completion state, or priority. |

A stored todo includes:

```text
id, title, done, priority, created_at, updated_at, deleted
```

`priority` is an integer from 1 to 3. The frontend maps this to Low, Medium, and High. `deleted` exists because deletion is soft deletion: records remain in SQLite but are hidden from normal queries.

#### `AppSettings`

The current settings are:

| Key | Default | Meaning |
| --- | --- | --- |
| `theme` | `dark` | UI theme name (`dark` or `light`). |
| `opacity` | `0.92` | Native widget-window opacity. |
| `font_size` | `13` | Todo text size in pixels. |
| `accent_color` | `#7C5CFC` | Main UI accent color. |
| `widget_x`, `widget_y` | `40`, `40` | Saved top-left screen position. |
| `widget_width`, `widget_height` | `240`, `380` | Saved widget dimensions. |
| `auto_launch` | `false` | Saved preference only; not implemented yet. |
| `collapse_on_idle` | `false` | Saved preference only; not implemented yet. |
| `show_completed` | `true` | Whether backend todo queries return completed todos. |

### `src-tauri/src/db.rs`

This file is the SQLite data layer. `Db` stores the path to the database file, opens a connection when an operation is needed, and runs SQL.

Database location:

```text
<Tauri app data directory>/stickit.db
```

On Windows, this is normally under the current user's application-data folders. The exact path can vary based on Tauri/Windows environment conventions, so do not hard-code it in features.

At connection time, it enables SQLite WAL (write-ahead logging) and `synchronous = NORMAL`. WAL generally improves practical desktop-app behavior by allowing readers and writers to coexist more comfortably.

The schema has two tables:

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Database operations:

| Method | What it does |
| --- | --- |
| `init()` | Creates both tables if they do not exist. |
| `get_todos(show_completed)` | Returns non-deleted todos, optionally excluding completed ones. Active todos appear first, then higher priority, then older creation time. |
| `create_todo()` | Generates a UUID and UTC timestamps, clamps priority to 1-3, and inserts a row. |
| `update_todo()` | Updates only fields provided by the caller, refreshes `updated_at`, then returns the new row. |
| `delete_todo()` | Soft-deletes one todo by setting `deleted = 1`. |
| `clear_completed()` | Soft-deletes every completed todo. |
| `get_settings()` | Starts with default settings and overlays database values. |
| `save_settings()` | Upserts all known settings keys. |
| `set_setting()` | Upserts a single arbitrary setting key/value. Currently unused by the UI. |

### `src-tauri/src/commands.rs`

This file is the bridge from frontend JavaScript to Rust. Any function registered in `lib.rs`'s `invoke_handler` can be called from JavaScript like this:

```js
const result = await window.__TAURI__.core.invoke("command_name", payload);
```

Available commands:

| JavaScript command | Payload | Result | Purpose |
| --- | --- | --- | --- |
| `get_todos` | none | `Todo[]` | Reads settings and returns visible todos. |
| `create_todo` | `CreateTodo` | `Todo` | Creates one todo. |
| `update_todo` | `id`, partial update object | `Todo` | Changes title, done, and/or priority. |
| `delete_todo` | `id` | none | Soft-deletes a todo. |
| `clear_completed` | none | none | Soft-deletes completed todos. |
| `get_settings` | none | `AppSettings` | Returns all settings with defaults applied. |
| `save_settings` | `AppSettings` | none | Saves all settings. |
| `set_setting` | `key`, `value` | none | Saves one setting. Not currently used. |
| `open_settings` | none | none | Shows and focuses the settings window. |
| `save_widget_bounds` | `x`, `y`, `width`, `height` | none | Persists widget position and size. |
| `toggle_always_on_top` | none | boolean | Changes widget pin state and returns its new state. |

All database access is protected by `Mutex<Db>`. This prevents simultaneous access to the shared `Db` state object from causing unsafe behavior.

## 7. Frontend, File by File

### `src/widget.html`

This is the main app interface. Its main regions are:

| Area | IDs/classes | Purpose |
| --- | --- | --- |
| Title bar | `.titlebar` | App name and window controls. |
| Header buttons | `#btn-settings`, `#btn-pin`, `#btn-collapse`, `#btn-hide` | Open settings, toggle pin, collapse, hide to tray. |
| Statistics | `#stats-bar`, `#stats-text` | Displays completion information. |
| Filters | `.filter-tab` | Switches between All, Active, and Done. |
| Todo list | `#todo-list` | JavaScript renders todo rows here. |
| Empty state | `#empty-state` | Displayed when the selected filter has no todos. |
| Add area | `#todo-input`, `#btn-add`, `.priority-btn` | Creates a todo with selected priority. |
| Context menu | `#ctx-menu` | Custom right-click actions for priority, edit, delete. |

`widget.html` loads `widget.js` as an ES module.

### `src/widget.js`

This file owns interactive widget behavior. It uses these Tauri globals:

```js
const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;
```

Main state held in memory:

| Variable | Meaning |
| --- | --- |
| `todos` | Last todo list returned by Rust. |
| `filter` | Current visual filter: `all`, `active`, or `done`. |
| `selectedPriority` | Priority assigned to the next new todo. |
| `ctxTodoId` | Todo being targeted by the context menu. |
| `isCollapsed` | Whether the widget body is visually hidden. |
| `isPinned` | Whether the native window is currently always-on-top. |
| `debounceTimer` | Wait timer used before storing a move/resize. |

Important functions:

| Function | What it does |
| --- | --- |
| `init()` | Loads settings and todos, then wires DOM events. |
| `loadSettings()` | Fetches settings and applies theme, accent color, font size, and native window opacity. |
| `loadTodos()` | Calls Rust's `get_todos` then calls `render()`. |
| `getVisible()` | Applies the frontend All/Active/Done filter. |
| `render()` | Rebuilds the todo list DOM and summary statistics. |
| `createItem(todo)` | Creates a single `<li>` todo row. |
| `startEdit(todo, element)` | Makes the title editable after a double-click. |
| `toggleDone(todo)` | Saves the inverse completion state. |
| `addTodo()` | Reads input, calls `create_todo`, clears input, refreshes list. |
| `removeTodo(id)` | Calls `delete_todo`, then refreshes list. |
| `clearCompleted()` | Calls `clear_completed`, then refreshes list. |
| `showCtxMenu(event, id)` | Displays right-click context menu. |
| `ctxSetPriority(priority)` | Updates current context-menu todo priority. |
| `toggleCollapse()` | Collapses/expands the body in the browser UI. |
| `togglePin()` | Calls native `toggle_always_on_top`. |
| `hideToTray()` | Hides the native widget window. |
| `openSettings()` | Calls Rust's `open_settings`. |
| `persistBounds()` | Debounces and saves current native window position/size. |
| `bindEvents()` | Connects buttons, keyboard events, native move/resize events, and menu events. |

How a todo is created:

```text
User types a title and presses Enter or Add
  -> widget.js addTodo()
  -> invoke("create_todo", { todo: { title, priority } })
  -> commands.rs create_todo()
  -> db.rs create_todo()
  -> SQLite insert
  -> Rust returns Todo
  -> widget.js reloads all todos and redraws the list
```

### `src/widget.css`

This is all visual styling for the widget. It uses CSS custom properties near the top of the file for its colors and visual system. Theme changes work by adding/removing the `light` class on `<body>`, which changes variables.

Main style groups include:

| CSS group | Purpose |
| --- | --- |
| `:root` and `body.light` | Theme variables and base theme values. |
| `.app` | Main glass-like widget container. |
| `.titlebar` | Draggable header region. |
| `.stats-bar`, `.filter-tabs` | Stats and filters. |
| `.todo-list`, `.todo-item` | Todo rows and states. |
| `.empty-state` | No-items display. |
| `.add-area` | Priority picker and create input. |
| `.ctx-menu` | Right-click menu. |

### `src/settings.html`

This defines the settings window. The sidebar navigates among four sections:

| Section | ID | Purpose |
| --- | --- | --- |
| Appearance | `#appearance` | Theme, accent color, opacity, font size. |
| Behavior | `#behavior` | Completed-item visibility, auto-launch preference, idle-collapse preference. |
| Data | `#data` | Todo counts, clear-completed, export JSON. |
| About | `#about` | Application information. |

The save button is `#btn-save` in the fixed footer.

### `src/settings.js`

This file loads, displays, and saves settings.

| Function | What it does |
| --- | --- |
| `init()` | Loads settings, populates controls, gets stats, wires events. |
| `applySettings()` | Updates the form controls from the in-memory settings object. |
| `setAccent(color)` | Selects a color swatch or custom accent color. |
| `loadDataStats()` | Calls `get_todos` and calculates total/done/active counts. |
| `collectSettings()` | Reads all form controls into a settings object. |
| `save()` | Calls `invoke("save_settings", { settings })`. |
| `markDirty()` | Marks unsaved changes and enables the save button. |
| `bindEvents()` | Wires navigation, form changes, save, clear, export, and unload warning. |

Export builds a JSON file in the browser/WebView and triggers a normal download. It exports the array returned by `get_todos`.

### `src/settings.css`

All styling for the settings window: sidebar, content panels, color swatches, range controls, toggle rows, data card, about card, and save footer.

## 8. Capabilities and Security

Tauri does not let frontend JavaScript control every native feature by default. Capabilities explicitly grant permissions per window.

### `src-tauri/capabilities/default.json`

The widget has permissions for standard core APIs plus actions such as:

```text
set always on top
set position
set size
show/hide
check visibility
check always-on-top state
start dragging
open using shell plugin
```

### `src-tauri/capabilities/settings.json`

The settings window has standard core APIs plus shell-open permission.

If you add a frontend call to a native window API and it fails with a permission/capability error, add the specific allowed permission to the relevant capability JSON file. Keep permissions narrow; do not grant broad permissions "just in case".

## 9. How to Run the App During Development

### One-time prerequisites on Windows

Install these first:

1. Node.js LTS, which includes npm.
2. Rust using `rustup`.
3. Microsoft C++ Build Tools, selecting **Desktop development with C++**. This is the simplest supported Windows compiler setup for Tauri.
4. Microsoft Edge WebView2 Runtime. Most current Windows installations already include it.

Tauri's official prerequisites are documented at <https://v2.tauri.app/start/prerequisites/>.

### Install project dependencies

Open PowerShell in the project root (`stickIt`) and run:

```powershell
npm install
```

This installs the JavaScript-side Tauri CLI and API packages. Rust crates download/compile automatically the first time Tauri starts or builds.

### Start development mode

```powershell
npm run dev
```

This compiles the Rust app when needed and opens the widget. It is a desktop window, not a localhost website.

Useful development behavior:

- Changes to HTML/CSS/JavaScript in `src/` are typically picked up quickly by Tauri development mode.
- Changes to Rust files in `src-tauri/src/` trigger a Rust recompile/restart and take longer.
- The widget can be hidden, not closed. If it disappears, find the StickIt tray icon and select **Show Widget** or left-click the icon.
- Use the tray menu's **Quit** item to terminate the app completely.

## 10. How to Edit the Project Safely

Use this decision table before changing code:

| You want to change... | Start in... | You may also need... |
| --- | --- | --- |
| Text, button positions, layout | `src/widget.html` or `src/settings.html` | Relevant CSS and JavaScript event bindings. |
| Colors, spacing, animation, fonts | `src/widget.css` or `src/settings.css` | Usually nothing else. |
| UI behavior that uses existing commands | `src/widget.js` or `src/settings.js` | Existing Rust command names/payload shapes must match. |
| Stored todo data or SQL behavior | `models.rs`, `db.rs`, `commands.rs` | Frontend rendering/payload updates. |
| A brand-new frontend-to-Rust operation | `commands.rs` | Register it in `lib.rs`; add capability if a native API requires one. |
| Window size, title, tray, installers | `tauri.conf.json` or `lib.rs` | Restart/rebuild the app. |
| App icon | `src-tauri/icons/` | Rebuild installers. |

### Editing a visible label or layout

For example, to rename the Add button, edit `src/widget.html`. To make it wider or change its color, edit the matching selector in `src/widget.css`. If the element's ID or class changes, update any references in `widget.js` too.

### Adding a UI-only feature

If it does not need persistence or native OS access, you can often implement it entirely in JavaScript/CSS/HTML. Keep state in a JavaScript variable and update the DOM in `render()` or an event handler.

### Adding a new persisted setting

For a setting such as `compact_mode`:

1. Add a `compact_mode: bool` field and default value in `src-tauri/src/models.rs`.
2. Make `Db::get_settings()` read the `compact_mode` key from SQLite.
3. Make `Db::save_settings()` upsert the new key.
4. Add the relevant control in `src/settings.html`.
5. Include it in `applySettings()` and `collectSettings()` in `src/settings.js`.
6. Read and apply it in `src/widget.js`.
7. Decide whether it should affect the widget immediately. If yes, add a notification/event or reload settings when the widget becomes visible.

### Adding a new Rust command

For an operation such as `archive_all`:

1. Add database logic in `src-tauri/src/db.rs`.
2. Add a `#[tauri::command]` function in `src-tauri/src/commands.rs`.
3. Add the command to `.invoke_handler(tauri::generate_handler![...])` in `src-tauri/src/lib.rs`.
4. Call it from frontend code using `invoke("archive_all", payload)`.
5. Ensure JavaScript payload property names match Rust function parameter names.
6. Reload affected UI state after the command succeeds.

### Adding a new todo field

For a field such as `due_date`, update all layers consistently:

```text
SQLite schema/migration in db.rs
        -> Rust Todo/CreateTodo/UpdateTodo models in models.rs
        -> SQL insert/select/update statements in db.rs
        -> Rust command payloads in commands.rs
        -> JavaScript invoke payload and rendering
        -> HTML/CSS controls
```

For an existing user's database, a new `CREATE TABLE IF NOT EXISTS` statement is not enough to add a column to an existing table. You need a migration, for example an `ALTER TABLE todos ADD COLUMN due_date TEXT`, applied safely and only once.

## 11. How to Build a Release Version

The intended release command is:

```powershell
npm run build
```

This runs `tauri build`, which:

1. Uses the static files under `src/` as frontend assets.
2. Compiles the Rust application in release mode.
3. Bundles the executable and configured Windows installers.

Expected output folders are under a target directory similar to:

```text
src-tauri/target/release/
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

The exact target path changes if you build for a specific Rust target triple.

### Current build status in this checkout

`npm run build` was tested and currently **fails** while compiling Windows resources. The observed failure comes from the configured GNU Windows toolchain:

```text
windres: preprocessing failed
package.metadata does not exist
tauri-winres failed to compile resource.rc
```

The project currently forces the GNU compiler/linker in `src-tauri/.cargo/config.toml`:

```toml
[target.x86_64-pc-windows-gnu]
linker = "C:/msys64/mingw64/bin/gcc.exe"
rustflags = ["-C", "link-arg=-fuse-ld=lld"]
```

The reliable Windows path for Tauri is normally the Microsoft Visual C++ toolchain. Install the C++ Build Tools, then run:

```powershell
rustup default stable-msvc
rustup target add x86_64-pc-windows-msvc
npm run build -- --target x86_64-pc-windows-msvc
```

Do not delete or alter `.cargo/config.toml` casually; it is part of the current GNU setup. If the project is intentionally meant to use GNU/MSYS2, diagnose the `windres` resource preprocessing issue instead. If you are moving the whole project to MSVC, update/remove that GNU-specific configuration deliberately and test both development and release builds.

To compile the release executable without building an installer:

```powershell
npm run build -- --no-bundle
```

Tauri's official Windows installer documentation is at <https://v2.tauri.app/distribute/windows-installer/> and general distribution documentation is at <https://v2.tauri.app/distribute/>.

## 12. Current Functional Gaps and Important Caveats

These are not guesses; they are behaviors visible in the current source.

1. `auto_launch` is saved but does not configure operating-system startup. Implementing it requires a Tauri autostart plugin or Windows startup integration.
2. `collapse_on_idle` is saved but no timer or idle-detection code uses it.
3. Saving settings does not fully update an already-open widget. `widget.js` applies settings only during its initial load. A refresh/event mechanism is needed for true live preview.
4. `show_completed` affects the Rust `get_todos` command itself, not only the widget filter. Therefore the settings page's totals and JSON export can omit completed todos when this setting is false.
5. `delete_todo` and `clear_completed` use soft deletion. Data remains in `stickit.db` and there is no permanent-delete or restore UI.
6. `src/index.html`, `src/main.js`, `src/styles.css`, and `src/assets/` are leftover starter-template files. They are not loaded by either configured window. `main.js` calls a `greet` command that does not exist in the Rust backend, so it should not be used as a reference for current behavior.
7. The shell plugin and shell-open permissions are present, but no current frontend feature uses them. Remove them only after confirming no future feature depends on them.
8. There are no automated test files or test scripts at present. Verification is manual: run the app and test CRUD, filters, resizing, tray actions, and settings persistence.

## 13. Suggested Manual Test Checklist

After any meaningful change, run `npm run dev` and check:

- Widget opens and can be moved/resized.
- Closing/hiding it leaves the tray icon available.
- Tray Show Widget and Settings items work.
- Create a todo using Enter and the Add button.
- Edit a todo by double-clicking its title.
- Toggle completion and test All/Active/Done filters.
- Change priority from the context menu.
- Delete one todo and clear completed todos.
- Change each setting, save it, hide/show or restart the app, and verify persistence.
- Confirm widget position/size restores after restart.
- Run a release build before publishing any installer.

## 14. Useful ChatGPT Prompt Templates

When asking another AI to modify this project, paste the relevant section of this guide and use a specific prompt such as:

```text
This is a Tauri 2 desktop todo app using Rust, plain HTML/CSS/JS, and SQLite.
The widget frontend is src/widget.html, src/widget.css, and src/widget.js.
Rust commands are in src-tauri/src/commands.rs, database code is in db.rs,
models are in models.rs, and commands must be registered in lib.rs.

Please add a due date to each todo. Preserve existing behavior. Include a safe
SQLite migration for existing databases, update all Rust models/SQL/commands,
and add/edit the widget UI. Explain each changed file and provide a manual test plan.
```

```text
This project uses direct static frontend files under src/, not React or Vite.
Please change the widget's visual design only: improve spacing and make the
priority colors more accessible. Do not change Rust files, persistence, Tauri
configuration, command names, or element IDs used by widget.js.
```

```text
The app saves auto_launch and collapse_on_idle settings but neither feature is
implemented. Propose the smallest correct Tauri 2 implementation for Windows,
identify required plugins/capabilities/dependencies, then make the changes.
Do not claim a setting works unless the native behavior is implemented.
```

## 15. Quick Reference

```powershell
# Install JavaScript dependencies once
npm install

# Run in development mode
npm run dev

# Build Windows release bundles (after resolving compiler/toolchain setup)
npm run build

# Build a release executable without MSI/NSIS installers
npm run build -- --no-bundle
```

Core references:

- Tauri setup prerequisites: <https://v2.tauri.app/start/prerequisites/>
- Tauri JavaScript API reference: <https://v2.tauri.app/reference/javascript/api/>
- Tauri Windows installers: <https://v2.tauri.app/distribute/windows-installer/>

## 16. One-Sentence Project Summary

StickIt is a two-window Tauri 2 Windows desktop todo app where plain JavaScript renders the UI, Rust exposes native commands and tray/window behavior, and SQLite stores todos plus preferences in a local `stickit.db` file.
