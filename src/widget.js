// widget.js — StickIt widget logic

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, PhysicalPosition, PhysicalSize } = window.__TAURI__.window;

// ── State ──────────────────────────────────────────────────────────────────
let todos = [];
let filter = 'all';   // 'all' | 'active' | 'done'
let selectedPriority = 1;
let ctxTodoId = null;
let isCollapsed = false;
let isPinned = true;
let debounceTimer = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const $list        = document.getElementById('todo-list');
const $input       = document.getElementById('todo-input');
const $btnAdd      = document.getElementById('btn-add');
const $statsText   = document.getElementById('stats-text');
const $clearDone   = document.getElementById('btn-clear-done');
const $empty       = document.getElementById('empty-state');
const $body        = document.getElementById('widget-body');
const $btnCollapse = document.getElementById('btn-collapse');
const $btnHide     = document.getElementById('btn-hide');
const $btnPin      = document.getElementById('btn-pin');
const $btnSettings = document.getElementById('btn-settings');
const $ctxMenu     = document.getElementById('ctx-menu');
const prioBtns     = document.querySelectorAll('.prio-btn');
const filterTabs   = document.querySelectorAll('.filter-tab');

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  await loadTodos();
  bindEvents();
}

async function loadSettings() {
  try {
    const s = await invoke('get_settings');
    document.body.dataset.theme = s.theme;
    document.documentElement.style.setProperty('--accent', s.accent_color);
    document.documentElement.style.setProperty('--accent-glow', s.accent_color + '40');
    document.documentElement.style.setProperty('--accent-dim', s.accent_color);
    document.body.style.fontSize = s.font_size + 'px';
    // Apply opacity to the window
    getCurrentWindow().setOpacity(s.opacity).catch(() => {});
  } catch(e) { console.warn('loadSettings:', e); }
}

// ── Todos ──────────────────────────────────────────────────────────────────
async function loadTodos() {
  try {
    todos = await invoke('get_todos');
    render();
  } catch(e) { console.error('loadTodos:', e); }
}

function getVisible() {
  if (filter === 'active') return todos.filter(t => !t.done);
  if (filter === 'done')   return todos.filter(t =>  t.done);
  return todos;
}

function render() {
  const visible = getVisible();
  $list.innerHTML = '';

  if (visible.length === 0) {
    $empty.style.display = 'flex';
    $list.style.display  = 'none';
  } else {
    $empty.style.display = 'none';
    $list.style.display  = 'block';
    visible.forEach(t => $list.appendChild(createItem(t)));
  }

  // Stats
  const total   = todos.length;
  const done    = todos.filter(t => t.done).length;
  const active  = total - done;
  $statsText.textContent = active > 0
    ? `${active} remaining`
    : total > 0 ? '🎉 All done!' : '0 tasks';

  $clearDone.style.display = done > 0 ? 'block' : 'none';
}

function createItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' done' : '');
  li.dataset.id = todo.id;

  // Priority dot
  const dot = document.createElement('span');
  dot.className = `prio-dot prio-${todo.priority}`;
  dot.title = ['', 'Low', 'Medium', 'High'][todo.priority];

  // Checkbox
  const chk = document.createElement('div');
  chk.className = 'todo-check' + (todo.done ? ' checked' : '');
  chk.setAttribute('role', 'checkbox');
  chk.setAttribute('aria-checked', todo.done);
  chk.addEventListener('click', () => toggleDone(todo.id, !todo.done));

  // Text
  const txt = document.createElement('span');
  txt.className = 'todo-text';
  txt.textContent = todo.title;
  txt.addEventListener('dblclick', () => startEdit(txt, todo));

  // Delete btn
  const del = document.createElement('button');
  del.className = 'todo-delete';
  del.textContent = '×';
  del.title = 'Delete';
  del.addEventListener('click', () => removeTodo(todo.id, li));

  // Right-click context menu
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, todo.id);
  });

  li.append(dot, chk, txt, del);
  return li;
}

function startEdit(el, todo) {
  el.setAttribute('contenteditable', 'true');
  el.focus();
  // select all
  const range = document.createRange();
  range.selectNodeContents(el);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);

  const finish = async () => {
    el.removeAttribute('contenteditable');
    const newTitle = el.textContent.trim();
    if (newTitle && newTitle !== todo.title) {
      try {
        const updated = await invoke('update_todo', { input: { id: todo.id, title: newTitle } });
        const idx = todos.findIndex(t => t.id === todo.id);
        if (idx !== -1) todos[idx] = updated;
      } catch(e) { el.textContent = todo.title; }
    } else {
      el.textContent = todo.title;
    }
  };

  el.addEventListener('blur', finish, { once: true });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = todo.title; el.blur(); }
  }, { once: true });
}

async function toggleDone(id, done) {
  try {
    const updated = await invoke('update_todo', { input: { id, done } });
    const idx = todos.findIndex(t => t.id === id);
    if (idx !== -1) todos[idx] = updated;
    render();
  } catch(e) { console.error('toggleDone:', e); }
}

async function addTodo() {
  const title = $input.value.trim();
  if (!title) { $input.focus(); return; }

  $btnAdd.style.transform = 'scale(0.85)';
  setTimeout(() => $btnAdd.style.transform = '', 150);

  try {
    const todo = await invoke('create_todo', { input: { title, priority: selectedPriority } });
    todos.unshift(todo);
    $input.value = '';
    filter = 'all';
    filterTabs.forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
    render();
    // Scroll to top
    $list.scrollTop = 0;
  } catch(e) { console.error('addTodo:', e); }
}

async function removeTodo(id, li) {
  li.classList.add('removing');
  li.addEventListener('animationend', async () => {
    try {
      await invoke('delete_todo', { id });
      todos = todos.filter(t => t.id !== id);
      render();
    } catch(e) { li.classList.remove('removing'); }
  }, { once: true });
}

async function clearCompleted() {
  try {
    await invoke('clear_completed');
    todos = todos.filter(t => !t.done);
    render();
  } catch(e) { console.error('clearCompleted:', e); }
}

// ── Context menu ───────────────────────────────────────────────────────────
function showCtxMenu(x, y, id) {
  ctxTodoId = id;
  $ctxMenu.style.display = 'block';
  // Keep within window bounds
  const rect = $ctxMenu.getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  $ctxMenu.style.left = Math.min(x, winW - rect.width  - 4) + 'px';
  $ctxMenu.style.top  = Math.min(y, winH - rect.height - 4) + 'px';
}

function hideCtxMenu() {
  $ctxMenu.style.display = 'none';
  ctxTodoId = null;
}

async function ctxSetPriority(prio) {
  if (!ctxTodoId) return;
  try {
    const updated = await invoke('update_todo', { input: { id: ctxTodoId, priority: prio } });
    const idx = todos.findIndex(t => t.id === ctxTodoId);
    if (idx !== -1) todos[idx] = updated;
    render();
  } catch(e) { console.error('ctxSetPriority:', e); }
  hideCtxMenu();
}

async function ctxEdit() {
  if (!ctxTodoId) return;
  hideCtxMenu();
  // find the element and trigger edit
  const li  = $list.querySelector(`[data-id="${ctxTodoId}"]`);
  const txt = li?.querySelector('.todo-text');
  const t   = todos.find(t => t.id === ctxTodoId);
  if (txt && t) startEdit(txt, t);
}

async function ctxDelete() {
  if (!ctxTodoId) return;
  const li = $list.querySelector(`[data-id="${ctxTodoId}"]`);
  const id = ctxTodoId;
  hideCtxMenu();
  if (li) removeTodo(id, li);
}

// ── Window actions ─────────────────────────────────────────────────────────
function toggleCollapse() {
  isCollapsed = !isCollapsed;
  $body.classList.toggle('collapsed', isCollapsed);
  $btnCollapse.textContent = isCollapsed ? '+' : '−';
  $btnCollapse.title = isCollapsed ? 'Expand' : 'Collapse';
}

async function togglePin() {
  try {
    isPinned = await invoke('toggle_always_on_top');
    $btnPin.classList.toggle('active', isPinned);
    $btnPin.title = isPinned ? 'Always on top (on)' : 'Always on top (off)';
  } catch(e) { console.error('togglePin:', e); }
}

function hideToTray() {
  getCurrentWindow().hide().catch(console.error);
}

function openSettings() {
  invoke('open_settings').catch(console.error);
}

// ── Persist widget bounds (debounced) ──────────────────────────────────────
async function persistBounds() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    try {
      const pos  = await getCurrentWindow().outerPosition();
      const size = await getCurrentWindow().outerSize();
      await invoke('save_widget_bounds', {
        x: pos.x, y: pos.y, w: size.width, h: size.height,
      });
    } catch(e) {}
  }, 800);
}

// ── Event bindings ─────────────────────────────────────────────────────────
function bindEvents() {
  // Add task
  $btnAdd.addEventListener('click', addTodo);
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
    if (e.key === 'Escape') $input.value = '';
  });

  // Filter tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filter = tab.dataset.filter;
      filterTabs.forEach(t => t.classList.toggle('active', t === tab));
      render();
    });
  });

  // Priority picker
  prioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPriority = parseInt(btn.dataset.prio);
      prioBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // Header buttons
  $btnCollapse.addEventListener('click', toggleCollapse);
  $btnPin.addEventListener('click', togglePin);
  $btnHide.addEventListener('click', hideToTray);
  $btnSettings.addEventListener('click', openSettings);
  $clearDone.addEventListener('click', clearCompleted);

  // Context menu actions
  document.getElementById('ctx-edit').addEventListener('click',   ctxEdit);
  document.getElementById('ctx-delete').addEventListener('click', ctxDelete);
  document.getElementById('ctx-prio-1').addEventListener('click', () => ctxSetPriority(1));
  document.getElementById('ctx-prio-2').addEventListener('click', () => ctxSetPriority(2));
  document.getElementById('ctx-prio-3').addEventListener('click', () => ctxSetPriority(3));

  // Close ctx menu on click elsewhere
  document.addEventListener('click', (e) => {
    if (!$ctxMenu.contains(e.target)) hideCtxMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCtxMenu();
  });

  // Persist position on move
  window.addEventListener('tauri://move', persistBounds);
  window.addEventListener('tauri://resize', persistBounds);
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
