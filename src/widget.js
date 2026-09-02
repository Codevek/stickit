// widget.js — StickIt widget logic

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, PhysicalPosition, PhysicalSize } =
  window.__TAURI__.window;
const { listen } = window.__TAURI__.event;

// ── State ──────────────────────────────────────────────────────────────────
let todos = [];
let filter = "all"; // 'all' | 'active' | 'done'
let selectedPriority = 1;
let ctxTodoId = null;
let editingTodo = null;  // todo being edited via the input field
let isCollapsed = false;
let isPinned = true;
let debounceTimer = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const $list = document.getElementById("todo-list");
const $input = document.getElementById("todo-input");
const $btnAdd = document.getElementById("btn-add");
const $statsText = document.getElementById("stats-text");
const $clearDone = document.getElementById("btn-clear-done");
const $empty = document.getElementById("empty-state");
const $body = document.getElementById("widget-body");
const $btnCollapse = document.getElementById("btn-collapse");
const $btnPin = document.getElementById("btn-pin");
const $btnSettings = document.getElementById("btn-settings");
const $ctxMenu = document.getElementById("ctx-menu");
const prioBtns = document.querySelectorAll(".prio-btn");
const filterTabs = document.querySelectorAll(".filter-tab");

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  await loadTodos();
  bindEvents();
}

async function loadSettings() {
  try {
    const s = await invoke("get_settings");
    applySettingsToWindow(s);
  } catch (e) {
    console.warn("loadSettings:", e);
  }
}

// ── Todos ──────────────────────────────────────────────────────────────────
async function loadTodos() {
  try {
    todos = await invoke("get_todos");
    render();
  } catch (e) {
    console.error("loadTodos:", e);
  }
}

function getVisible() {
  if (filter === "active") return todos.filter((t) => !t.done);
  if (filter === "done") return todos.filter((t) => t.done);
  return todos;
}

function render() {
  const visible = getVisible();
  $list.innerHTML = "";

  if (visible.length === 0) {
    $empty.style.display = "flex";
    $list.style.display = "none";
  } else {
    $empty.style.display = "none";
    $list.style.display = "block";
    visible.forEach((t) => $list.appendChild(createItem(t)));
  }

  // Stats
  const total = todos.length;
  const done = todos.filter((t) => t.done).length;
  const active = total - done;
  $statsText.textContent =
    active > 0 ? `${active} remaining` : total > 0 ? "🎉 All done!" : "0 tasks";

  $clearDone.style.display = done > 0 ? "block" : "none";
}

function createItem(todo) {
  const li = document.createElement("li");
  li.className = "todo-item" + (todo.done ? " done" : "");
  li.dataset.id = todo.id;

  // Priority dot
  const dot = document.createElement("span");
  dot.className = `prio-dot prio-${todo.priority}`;
  dot.title = ["", "Low", "Medium", "High"][todo.priority];

  // Checkbox
  const chk = document.createElement("div");
  chk.className = "todo-check" + (todo.done ? " checked" : "");
  chk.setAttribute("role", "checkbox");
  chk.setAttribute("aria-checked", todo.done);
  chk.addEventListener("click", () => toggleDone(todo.id, !todo.done));

  // Text
  const txt = document.createElement("span");
  txt.className = "todo-text";
  txt.textContent = todo.title;
  txt.classList.add(`priority-${todo.priority}`);
  txt.addEventListener("dblclick", () => startInputEdit(todo));

  // Delete btn
  const del = document.createElement("button");
  del.className = "todo-delete";
  del.textContent = "×";
  del.title = "Delete";
  del.addEventListener("click", () => removeTodo(todo.id, li));

  // Right-click context menu
  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, todo.id);
  });

  li.append(dot, chk, txt, del);
  return li;
}

// ── Edit via input field ───────────────────────────────────────────────────
function startInputEdit(todo) {
  editingTodo = todo;
  $input.value = todo.title;
  $input.placeholder = "Edit task…";
  invoke("set_widget_focus_mode").catch(console.warn);
  setTimeout(() => $input.focus(), 50);
  $input.select();
  $btnAdd.textContent = "✓";
  $btnAdd.title = "Save";
  $btnAdd.classList.add("save-mode");
}

function cancelEdit() {
  editingTodo = null;
  $input.value = "";
  $input.placeholder = "Add a task…";
  $btnAdd.textContent = "+";
  $btnAdd.title = "Add task";
  $btnAdd.classList.remove("save-mode");
}

async function finishEdit() {
  if (!editingTodo) return;
  const title = $input.value.trim();
  if (!title) { cancelEdit(); return; }
  try {
    const updated = await invoke("update_todo", {
      input: { id: editingTodo.id, title },
    });
    const idx = todos.findIndex((t) => t.id === editingTodo.id);
    if (idx !== -1) todos[idx] = updated;
    render();
  } catch (e) { console.error("finishEdit:", e); }
  cancelEdit();
}

async function submitInput() {
  if (editingTodo) {
    await finishEdit();
  } else {
    await addTodo();
  }
}

async function toggleDone(id, done) {
  try {
    const updated = await invoke("update_todo", { input: { id, done } });
    const idx = todos.findIndex((t) => t.id === id);
    if (idx !== -1) todos[idx] = updated;
    render();
  } catch (e) {
    console.error("toggleDone:", e);
  }
}

async function addTodo() {
  const title = $input.value.trim();
  if (!title) {
    $input.focus();
    return;
  }

  $btnAdd.style.transform = "scale(0.85)";
  setTimeout(() => ($btnAdd.style.transform = ""), 150);

  try {
    const todo = await invoke("create_todo", {
      input: { title, priority: selectedPriority },
    });
    todos.unshift(todo);
    $input.value = "";
    filter = "all";
    filterTabs.forEach((t) =>
      t.classList.toggle("active", t.dataset.filter === "all"),
    );
    render();
    // Scroll to top
    $list.scrollTop = 0;
  } catch (e) {
    console.error("addTodo:", e);
  }
}

async function removeTodo(id, li) {
  li.classList.add("removing");
  li.addEventListener(
    "animationend",
    async () => {
      try {
        await invoke("delete_todo", { id });
        todos = todos.filter((t) => t.id !== id);
        render();
      } catch (e) {
        li.classList.remove("removing");
      }
    },
    { once: true },
  );
}

async function clearCompleted() {
  try {
    await invoke("clear_completed");
    todos = todos.filter((t) => !t.done);
    render();
  } catch (e) {
    console.error("clearCompleted:", e);
  }
}

// ── Context menu ───────────────────────────────────────────────────────────
function showCtxMenu(x, y, id) {
  ctxTodoId = id;
  // Make sure the menu is visible and interactive regardless of focus state
  $ctxMenu.style.display = "block";
  $ctxMenu.style.pointerEvents = "auto";
  // Position after display so getBoundingClientRect is accurate
  requestAnimationFrame(() => {
    const rect = $ctxMenu.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    $ctxMenu.style.left = Math.min(x, winW - rect.width - 4) + "px";
    $ctxMenu.style.top = Math.min(y, winH - rect.height - 4) + "px";
  });
}

function hideCtxMenu() {
  $ctxMenu.style.display = "none";
  ctxTodoId = null;
}

async function ctxSetPriority(prio) {
  if (!ctxTodoId) return;
  try {
    const updated = await invoke("update_todo", {
      input: { id: ctxTodoId, priority: prio },
    });
    const idx = todos.findIndex((t) => t.id === ctxTodoId);
    if (idx !== -1) todos[idx] = updated;
    render();
  } catch (e) {
    console.error("ctxSetPriority:", e);
  }
  hideCtxMenu();
}

async function ctxEdit() {
  if (!ctxTodoId) return;
  const t = todos.find((t) => t.id === ctxTodoId);
  hideCtxMenu();
  if (t) startInputEdit(t);
}

async function ctxDelete() {
  if (!ctxTodoId) return;
  const li = $list.querySelector(`[data-id="${ctxTodoId}"]`);
  const id = ctxTodoId;
  hideCtxMenu();
  if (li) removeTodo(id, li);
}

// ── Window actions ─────────────────────────────────────────────────────────
const TITLEBAR_H = 40; // approximate collapsed height in px (just titlebar)

async function toggleCollapse() {
  isCollapsed = !isCollapsed;
  $body.classList.toggle("collapsed", isCollapsed);
  $btnCollapse.textContent = isCollapsed ? "+" : "−";
  $btnCollapse.title = isCollapsed ? "Expand" : "Collapse";

  // Physically resize the Tauri window so there's no dead space
  try {
    const win = getCurrentWindow();
    const size = await win.outerSize();
    if (isCollapsed) {
      // Store current full height and shrink to titlebar only
      win._fullHeight = size.height;
      await win.setSize(new PhysicalSize(size.width, TITLEBAR_H));
    } else {
      // Restore previous height
      const restoreH = win._fullHeight || 380;
      await win.setSize(new PhysicalSize(size.width, restoreH));
    }
  } catch (e) { console.error("toggleCollapse resize:", e); }
}

async function togglePin() {
  try {
    isPinned = await invoke("toggle_always_on_top");
    $btnPin.classList.toggle("active", isPinned);
    $btnPin.title = isPinned ? "Always on top (on)" : "Always on top (off)";
  } catch (e) {
    console.error("togglePin:", e);
  }
}

function hideToTray() {
  getCurrentWindow().hide().catch(console.error);
}

function openSettings() {
  // Toggle: show if hidden, hide if visible
  invoke("toggle_settings").catch(console.error);
}

// ── Persist widget bounds (debounced) ──────────────────────────────────────
async function persistBounds() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    try {
      const pos = await getCurrentWindow().outerPosition();
      const size = await getCurrentWindow().outerSize();
      await invoke("save_widget_bounds", {
        x: pos.x,
        y: pos.y,
        w: size.width,
        h: size.height,
      });
    } catch (e) { }
  }, 800);
}

// ── Event bindings ─────────────────────────────────────────────────────────
function bindEvents() {
  // Add / Edit task
  $btnAdd.addEventListener("click", submitInput);
  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitInput();
    if (e.key === "Escape") {
      if (editingTodo) cancelEdit();
      else $input.value = "";
    }
  });

  // Filter tabs
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filter = tab.dataset.filter;
      filterTabs.forEach((t) => t.classList.toggle("active", t === tab));
      render();
    });
  });

  // Priority picker
  prioBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedPriority = parseInt(btn.dataset.prio);
      prioBtns.forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  // Header buttons
  if ($btnCollapse) $btnCollapse.addEventListener("click", toggleCollapse);
  if ($btnPin) $btnPin.addEventListener("click", togglePin);
  if ($btnSettings) $btnSettings.addEventListener("click", openSettings);
  $clearDone.addEventListener("click", clearCompleted);

  // Context menu actions
  document.getElementById("ctx-edit").addEventListener("click", ctxEdit);
  document.getElementById("ctx-delete").addEventListener("click", ctxDelete);
  document
    .getElementById("ctx-prio-1")
    .addEventListener("click", () => ctxSetPriority(1));
  document
    .getElementById("ctx-prio-2")
    .addEventListener("click", () => ctxSetPriority(2));
  document
    .getElementById("ctx-prio-3")
    .addEventListener("click", () => ctxSetPriority(3));

  // Close ctx menu on click elsewhere
  document.addEventListener("click", (e) => {
    if (!$ctxMenu.contains(e.target)) hideCtxMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCtxMenu();
  });

  // Persist position on move
  window.addEventListener("tauri://move", persistBounds);
  window.addEventListener("tauri://resize", persistBounds);
}


// $list.addEventListener("focus", () => {
//   document.getElementById("app").classList.add("focused");
//   console.log($list);

// })


window.addEventListener("click", () => {
  document.getElementById("app").classList.add("focused");
});

window.addEventListener("blur", () => {
  document.getElementById("app").classList.remove("focused");
});

// ── Apply settings to this window ─────────────────────────────────────────
function applySettingsToWindow(s) {
  if (s.theme && s.theme.startsWith('#')) {
    document.body.dataset.theme = 'custom';
    const hex = s.theme.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    document.documentElement.style.setProperty("--bg-base", `${r}, ${g}, ${b}`);
    // Automatically set text color for custom themes (simple contrast check could be added, but for now we rely on the custom theme CSS block if needed)
  } else {
    document.body.dataset.theme = s.theme;
    document.documentElement.style.removeProperty("--bg-base");
  }
  document.documentElement.style.setProperty("--accent", s.accent_color);
  document.documentElement.style.setProperty("--accent-glow", s.accent_color + "40");
  document.documentElement.style.setProperty("--accent-dim", s.accent_color);
  // Font size — via CSS variable so all scaled elements update
  document.documentElement.style.setProperty("--base-fs", s.font_size + "px");
  // Opacity — via background-alpha CSS variable (transparent window, opaque control)
  document.documentElement.style.setProperty("--bg-alpha", s.opacity);
  // Clear any leftover element-level opacity from older code
  document.getElementById("app").style.opacity = "";
}


// ── Boot ───────────────────────────────────────────────────────────────────
init();

// When user clicks the input area, they need focus.
// WS_EX_NOACTIVATE prevents focus natively, so we request it from Rust.
document.addEventListener("mousedown", (e) => {
  if (e.target.closest("#todo-input") || e.target.closest("#add-area")) {
    invoke("set_widget_focus_mode").then(() => {
      // Ensure input gets focus after window activates
      setTimeout(() => {
        document.getElementById("todo-input").focus();
      }, 50);
    }).catch(e => console.warn(e));
  }
});

// Listen for settings changes from the Settings window
listen("settings-changed", (event) => {
  applySettingsToWindow(event.payload);
}).catch(console.error);
