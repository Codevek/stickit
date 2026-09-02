// settings.js — Settings window logic

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;
const { emit } = window.__TAURI__.event;

// ── Window controls ────────────────────────────────────────────────────────
document.getElementById('btn-win-close').addEventListener('click', () => {
  getCurrentWindow().hide().catch(() => getCurrentWindow().close());
});

// ── State ──────────────────────────────────────────────────────────────────
let settings = null;
let dirty = false;

// ── DOM refs ───────────────────────────────────────────────────────────────
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.settings-section');
const $saveBtn = document.getElementById('btn-save');
const $saveStatus = document.getElementById('save-status');

// Appearance
const themeBtns = document.querySelectorAll('.theme-btn');
const swatches = document.querySelectorAll('.swatch:not(.theme-swatch)');
const $colorInput = document.getElementById('accent-color');
const $accentPreview = document.getElementById('accent-preview');

const $customThemeColors = document.getElementById('custom-theme-colors');
const themeSwatches = document.querySelectorAll('.theme-swatch');
const $customBgColor = document.getElementById('custom-bg-color');
const $customThemePreview = document.getElementById('custom-theme-color-preview');

const $opacityRange = document.getElementById('opacity-range');
const $opacityVal = document.getElementById('opacity-value');
const $fontRange = document.getElementById('font-size-range');
const $fontVal = document.getElementById('font-size-value');

// Behavior
const $toggleCompleted = document.getElementById('toggle-show-completed');
const $toggleAutoLaunch = document.getElementById('toggle-auto-launch');
const $toggleCollapseIdle = document.getElementById('toggle-collapse-idle');

// Data
const $statTotal = document.getElementById('stat-total');
const $statDone = document.getElementById('stat-done');
const $statActive = document.getElementById('stat-active');
const $clearAllDone = document.getElementById('btn-clear-all-done');
const $exportBtn = document.getElementById('btn-export');

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  try {
    settings = await invoke('get_settings');
    applySettings(settings);
    await loadDataStats();
  } catch (e) { console.error('init settings:', e); }
  bindEvents();
}

function applySettings(s) {
  // Theme
  let isCustom = s.theme && s.theme.startsWith('#');
  document.body.dataset.theme = isCustom ? 'custom' : s.theme;
  
  themeBtns.forEach(b => b.classList.toggle('active', b.dataset.themeVal === (isCustom ? 'custom' : s.theme)));
  $customThemeColors.style.display = isCustom ? 'block' : 'none';

  if (isCustom) {
    setCustomThemeColor(s.theme);
  }

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
  $toggleCompleted.checked = s.show_completed;
  $toggleAutoLaunch.checked = s.auto_launch;
  $toggleCollapseIdle.checked = s.collapse_on_idle;
}

function setAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-glow', color + '20');
  $accentPreview.style.background = color;
  swatches.forEach(s => s.classList.toggle('active', s.dataset.color === color));
}

function setCustomThemeColor(color) {
  $customThemePreview.style.background = color;
  $customBgColor.value = color;
  themeSwatches.forEach(s => s.classList.toggle('active', s.dataset.color.toLowerCase() === color.toLowerCase()));
}

async function loadDataStats() {
  try {
    const todos = await invoke('get_todos');
    const done = todos.filter(t => t.done).length;
    $statTotal.textContent = todos.length;
    $statDone.textContent = done;
    $statActive.textContent = todos.length - done;
  } catch (e) { }
}

// ── Collect current form state → settings object ───────────────────────────
function collectSettings() {
  const activeThemeBtn = document.querySelector('.theme-btn.active');
  const themeVal = activeThemeBtn?.dataset.themeVal;
  
  return {
    ...settings,
    theme: themeVal === 'custom' ? $customBgColor.value : (themeVal ?? settings.theme),
    accent_color: $colorInput.value,
    opacity: parseInt($opacityRange.value) / 100,
    font_size: parseInt($fontRange.value),
    show_completed: $toggleCompleted.checked,
    auto_launch: $toggleAutoLaunch.checked,
    collapse_on_idle: $toggleCollapseIdle.checked,
  };
}

// ── Live preview ── emit to widget so it applies changes instantly ──────────
function livePreview(patch) {
  if (!settings) return;
  const preview = { ...collectSettings(), ...patch };
  emit('settings-changed', preview).catch(() => { });
}

// ── Save ───────────────────────────────────────────────────────────────────
async function save() {
  const newSettings = collectSettings();
  try {
    await invoke('save_settings', { settings: newSettings });
    settings = newSettings;
    dirty = false;
    showSaved();
  } catch (e) {
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

  // Theme buttons
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const themeVal = btn.dataset.themeVal;
      const isCustom = themeVal === 'custom';
      
      document.body.dataset.theme = themeVal;
      $customThemeColors.style.display = isCustom ? 'block' : 'none';
      
      markDirty();
      livePreview({ theme: isCustom ? $customBgColor.value : themeVal });
    });
  });

  // Custom theme swatches
  themeSwatches.forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      setCustomThemeColor(color);
      markDirty();
      livePreview({ theme: color });
    });
  });

  $customBgColor.addEventListener('input', () => {
    const color = $customBgColor.value;
    setCustomThemeColor(color);
    markDirty();
    livePreview({ theme: color });
  });

  // Accent Swatches
  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      setAccent(sw.dataset.color);
      $colorInput.value = sw.dataset.color;
      markDirty();
      livePreview({ accent_color: sw.dataset.color });
    });
  });

  $colorInput.addEventListener('input', () => {
    setAccent($colorInput.value);
    swatches.forEach(s => s.classList.remove('active'));
    markDirty();
    livePreview({ accent_color: $colorInput.value });
  });

  // Opacity — live preview as you drag
  $opacityRange.addEventListener('input', () => {
    const pct = $opacityRange.value;
    $opacityVal.textContent = pct + '%';
    markDirty();
    livePreview({ opacity: parseInt(pct) / 100 });
  });

  // Font size — live preview as you drag
  $fontRange.addEventListener('input', () => {
    const sz = $fontRange.value;
    $fontVal.textContent = sz + 'px';
    markDirty();
    livePreview({ font_size: parseInt(sz) });
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
    } catch (e) { console.error(e); }
  });

  $exportBtn.addEventListener('click', async () => {
    try {
      const todos = await invoke('get_todos');
      const json = JSON.stringify(todos, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stickit-todos.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  });

  // Warn before closing if dirty
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
