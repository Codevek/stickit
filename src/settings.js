// settings.js — Settings window logic

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

// ── State ──────────────────────────────────────────────────────────────────
let settings = null;
let dirty = false;

// ── DOM refs ───────────────────────────────────────────────────────────────
const navItems   = document.querySelectorAll('.nav-item');
const sections   = document.querySelectorAll('.settings-section');
const $saveBtn   = document.getElementById('btn-save');
const $saveStatus= document.getElementById('save-status');

// Appearance
const themeBtns      = document.querySelectorAll('.theme-btn');
const swatches       = document.querySelectorAll('.swatch');
const $colorInput    = document.getElementById('accent-color');
const $accentPreview = document.getElementById('accent-preview');
const $opacityRange  = document.getElementById('opacity-range');
const $opacityVal    = document.getElementById('opacity-value');
const $fontRange     = document.getElementById('font-size-range');
const $fontVal       = document.getElementById('font-size-value');

// Behavior
const $toggleCompleted   = document.getElementById('toggle-show-completed');
const $toggleAutoLaunch  = document.getElementById('toggle-auto-launch');
const $toggleCollapseIdle= document.getElementById('toggle-collapse-idle');

// Data
const $statTotal  = document.getElementById('stat-total');
const $statDone   = document.getElementById('stat-done');
const $statActive = document.getElementById('stat-active');
const $clearAllDone = document.getElementById('btn-clear-all-done');
const $exportBtn  = document.getElementById('btn-export');

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  try {
    settings = await invoke('get_settings');
    applySettings(settings);
    await loadDataStats();
  } catch(e) { console.error('init settings:', e); }
  bindEvents();
}

function applySettings(s) {
  // Theme
  document.body.dataset.theme = s.theme;
  themeBtns.forEach(b => b.classList.toggle('active', b.dataset.themeVal === s.theme));

  // Accent
  setAccent(s.accent_color);
  $colorInput.value = s.accent_color;

  // Opacity
  const opacityPct = Math.round(s.opacity * 100);
  $opacityRange.value = opacityPct;
  $opacityVal.textContent = opacityPct + '%';

  // Font size
  $fontRange.value = s.font_size;
  $fontVal.textContent = s.font_size + 'px';

  // Toggles
  $toggleCompleted.checked   = s.show_completed;
  $toggleAutoLaunch.checked  = s.auto_launch;
  $toggleCollapseIdle.checked= s.collapse_on_idle;
}

function setAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-glow', color + '20');
  $accentPreview.style.background = color;
  swatches.forEach(s => s.classList.toggle('active', s.dataset.color === color));
}

async function loadDataStats() {
  try {
    const todos = await invoke('get_todos');
    const done = todos.filter(t => t.done).length;
    $statTotal.textContent  = todos.length;
    $statDone.textContent   = done;
    $statActive.textContent = todos.length - done;
  } catch(e) {}
}

// ── Collect current form state → settings object ───────────────────────────
function collectSettings() {
  const activeTheme = document.querySelector('.theme-btn.active');
  return {
    ...settings,
    theme:           activeTheme?.dataset.themeVal ?? settings.theme,
    accent_color:    $colorInput.value,
    opacity:         parseInt($opacityRange.value) / 100,
    font_size:       parseInt($fontRange.value),
    show_completed:  $toggleCompleted.checked,
    auto_launch:     $toggleAutoLaunch.checked,
    collapse_on_idle: $toggleCollapseIdle.checked,
  };
}

// ── Save ───────────────────────────────────────────────────────────────────
async function save() {
  const newSettings = collectSettings();
  try {
    await invoke('save_settings', { settings: newSettings });
    settings = newSettings;
    dirty = false;
    showSaved();
  } catch(e) {
    console.error('save settings:', e);
    $saveStatus.textContent = '✗ Error saving';
    $saveStatus.style.color = 'var(--danger)';
    $saveStatus.classList.add('visible');
    setTimeout(() => $saveStatus.classList.remove('visible'), 3000);
  }
}

function showSaved() {
  $saveStatus.textContent = '✓ Saved';
  $saveStatus.style.color = 'var(--success)';
  $saveStatus.classList.add('visible');
  setTimeout(() => $saveStatus.classList.remove('visible'), 2500);
}

function markDirty() { dirty = true; }

// ── Event bindings ─────────────────────────────────────────────────────────
function bindEvents() {
  // Nav
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const sec = item.dataset.section;
      navItems.forEach(n => n.classList.toggle('active', n === item));
      sections.forEach(s => s.classList.toggle('active', s.id === 'section-' + sec));
      if (sec === 'data') loadDataStats();
    });
  });

  // Theme
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.body.dataset.theme = btn.dataset.themeVal;
      markDirty();
    });
  });

  // Swatches
  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      setAccent(sw.dataset.color);
      $colorInput.value = sw.dataset.color;
      markDirty();
    });
  });

  $colorInput.addEventListener('input', () => {
    setAccent($colorInput.value);
    swatches.forEach(s => s.classList.remove('active'));
    markDirty();
  });

  // Opacity
  $opacityRange.addEventListener('input', () => {
    $opacityVal.textContent = $opacityRange.value + '%';
    markDirty();
  });

  // Font size
  $fontRange.addEventListener('input', () => {
    $fontVal.textContent = $fontRange.value + 'px';
    markDirty();
  });

  // Toggles
  [$toggleCompleted, $toggleAutoLaunch, $toggleCollapseIdle].forEach(t => {
    t.addEventListener('change', markDirty);
  });

  // Save
  $saveBtn.addEventListener('click', save);

  // Data management
  $clearAllDone.addEventListener('click', async () => {
    if (!confirm('Clear all completed tasks? This cannot be undone.')) return;
    try {
      await invoke('clear_completed');
      await loadDataStats();
    } catch(e) { console.error(e); }
  });

  $exportBtn.addEventListener('click', async () => {
    try {
      const todos = await invoke('get_todos');
      const json = JSON.stringify(todos, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'stickit-todos.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) { console.error(e); }
  });

  // Warn before closing if dirty
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
