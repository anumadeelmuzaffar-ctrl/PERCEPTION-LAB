/* ============================================================
   PERCEPTION LAB — admin.js
   Local content management: edit text, presets, animation,
   evaluation weights; import/export JSON; persist via localStorage.
   ============================================================ */
'use strict';
const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const LS_KEY = 'pl_content';
const IMAGE_LS_KEY = 'pl_image_overrides';
let BASE = null;      // content.json defaults
let EDIT = null;      // working copy
let IMAGE_OVERRIDES = {};
const GALLERY_IMAGE_IDS = [
  '204047', '204050', '204055', '204058', '204100', '204111', '204120',
  '204129', '204143', '204147', '204153', '204203', '204210', '204217',
  '204147', '204047', '204100', '204111', '204120', '204153', '204058',
  '204217', '204129', '204210', '204055', '204047', '204143', '204058',
  '204111', '204153', '204120', '204210', '204055', '204217', '204129'
];

/* These are deliberately occurrence-based, rather than source-based. Two cards
   that start with the same file still remain independently editable. */
const IMAGE_SLOTS = [
  ...[
    'coca-cola-friends.png', 'coca-cola-santa.png', 'snickers-hungry.png', 'snickers-campaign.png', 'mms-campaign.png',
    'rosie-campaign.png', 'heinz-campaign.png', 'guinness-campaign.png', 'mcdonalds-campaign.png'
  ].map((file, index) => ({ section: 'HERO / HEADER COLLAGE', id: `hero.${index}`, label: `Campaign card ${String(index + 1).padStart(2, '0')}`, src: `assets/hero-campaigns/${file}` })),
  ...['LUXURY', 'AFFORDABLE', 'YOUTHFUL', 'CLINICAL', 'EXCLUSIVE'].map(key => ({ section: 'PERCEPTION TILES', id: `lab.${key}`, label: key, src: `assets/lab-positions/${key.toLowerCase()}.png` })),
  { section: 'WHAT CHANGED', id: 'mirror.primary', label: 'Editable campaign composition', src: 'assets/mirror/brand-bottle.png' },
  ...GALLERY_IMAGE_IDS.map((id, index) => ({ section: 'CAMPAIGNS / BLACK FADE COLLAGE', id: `gallery.${index}`, label: `Campaign occurrence ${String(index + 1).padStart(2, '0')}`, src: `assets/gallery-3/${id}.png` }))
];

async function boot() {
  const res = await fetch('content.json');
  BASE = await res.json();
  EDIT = JSON.parse(JSON.stringify(BASE));
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) EDIT = merge(EDIT, JSON.parse(saved));
  } catch (e) { console.warn('Saved content ignored:', e); }
  try { IMAGE_OVERRIDES = JSON.parse(localStorage.getItem(IMAGE_LS_KEY) || '{}') || {}; } catch (e) { IMAGE_OVERRIDES = {}; }
  EDIT.mirror.layers = Array.isArray(EDIT.mirror.layers) ? EDIT.mirror.layers : [];

  buildTabs();
  buildContentTab();
  buildHeadingPositionsTab();
  buildImagesTab();
  buildPresetsTab();
  buildAnimTab();
  buildEvalTab();
  buildManageTab();
}

/* ---------- TEST YOUR BRAND HEADING POSITIONS ---------- */
const TEST_HEADING_TARGETS = [
  ['section', 'Section heading — TEST YOUR BRAND'],
  ['define', 'Step heading — WHAT ARE YOU SELLING?'],
  ['intended', 'Step heading — INTENDED PERCEPTION'],
  ['reality', 'Step heading — PRODUCT REALITY'],
  ['compare', 'Step heading — COMPARE'],
  ['result', 'Step heading — EVALUATION RESULT']
];
function buildHeadingPositionsTab() {
  const wrap = $('#testHeadingPositions');
  wrap.innerHTML = '';
  EDIT.test.headingPositions = EDIT.test.headingPositions || {};
  TEST_HEADING_TARGETS.forEach(([key, label]) => {
    const value = EDIT.test.headingPositions[key] || { x: key === 'section' ? 0 : -2, y: key === 'section' ? 0 : 30 };
    const row = document.createElement('div');
    row.className = 'preset-editor';
    row.innerHTML = `<h3>${esc(label)}</h3><div class="a-grid">
      <div class="a-field"><label>HORIZONTAL (PX)</label><input type="number" min="-180" max="180" step="1" data-heading="${key}" data-axis="x" value="${Number(value.x) || 0}"></div>
      <div class="a-field"><label>VERTICAL (PX)</label><input type="number" min="-180" max="180" step="1" data-heading="${key}" data-axis="y" value="${Number(value.y) || 0}"></div>
    </div>`;
    wrap.appendChild(row);
  });
  $('#saveHeadingPositionsBtn').onclick = () => {
    $$('#testHeadingPositions input').forEach(input => {
      const key = input.dataset.heading;
      EDIT.test.headingPositions[key] = EDIT.test.headingPositions[key] || { x: 0, y: 0 };
      EDIT.test.headingPositions[key][input.dataset.axis] = Math.max(-180, Math.min(180, Number(input.value) || 0));
    });
    persist(); msg('#headingPositionsMsg', 'Heading positions saved. Reload the site preview to apply them.', 'ok');
  };
  $('#resetHeadingPositionsBtn').onclick = () => {
    TEST_HEADING_TARGETS.forEach(([key]) => {
      EDIT.test.headingPositions[key] = { x: key === 'section' ? 0 : -2, y: key === 'section' ? 0 : 30 };
    });
    persist(); buildHeadingPositionsTab(); msg('#headingPositionsMsg', 'Test Your Brand heading positions reset.', 'ok');
  };
}

function merge(base, over) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') out[k] = merge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

/* ---------- tabs ---------- */
function buildTabs() {
  $$('.admin-tabs button').forEach(b => b.addEventListener('click', () => {
    $$('.admin-tabs button').forEach(x => x.classList.remove('is-active'));
    $$('.admin-panel').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    $('#tab-' + b.dataset.tab).classList.add('is-active');
  }));
}

/* ---------- CONTENT TAB ---------- */
const CONTENT_FIELDS = [
  ['site.name', 'Site name'], ['site.tagline', 'Tagline'],
  ['hero.headlineTop', 'Hero headline (top line)'], ['hero.headlineBottom', 'Hero headline (bottom line)'],
  ['lab.label', 'Section 1 label'], ['lab.headlineA', 'Section 1 headline A'], ['lab.headlineB', 'Section 1 headline B'],
  ['lab.description', 'Section 1 description'],
  ['decide.label', 'Section 2 label'], ['decide.headline', 'Section 2 headline'], ['decide.description', 'Section 2 description'],
  ['decide.revealLine', 'Section 2 reveal line'],
  ['mirror.label', 'Section 3 label'], ['mirror.headline', 'Section 3 headline'], ['mirror.description', 'Section 3 description'],
  ['test.label', 'Section 4 label'], ['test.headlineA', 'Section 4 headline A'], ['test.headlineB', 'Section 4 headline B'],
  ['publish.label', 'Section 5 label'], ['publish.headlineA', 'Section 5 headline A'], ['publish.headlineB', 'Section 5 headline B'],
  ['final.line1', 'Final line 1'], ['final.line2', 'Final line 2'], ['final.line3', 'Final line 3 (lime)'], ['final.line4', 'Final line 4'],
  ['site.footerNote', 'Footer note'], ['site.copyright', 'Copyright']
];
function getPath(obj, path) { return path.split('.').reduce((o, p) => o && o[p], obj); }
function setPath(obj, path, v) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = v;
}
function buildContentTab() {
  const wrap = $('#contentFields');
  CONTENT_FIELDS.forEach(([path, label]) => {
    const div = document.createElement('div');
    div.className = 'a-field';
    const val = getPath(EDIT, path) ?? '';
    div.innerHTML = `<label>${esc(label)}</label><input type="text" data-path="${esc(path)}" value="${esc(val)}">`;
    wrap.appendChild(div);
  });
  $('#saveContentBtn').addEventListener('click', () => {
    $$('#contentFields input').forEach(i => setPath(EDIT, i.dataset.path, i.value));
    persist(); msg('#contentMsg', 'Saved. Reload the site to see changes.', 'ok');
  });
  $('#resetContentBtn').addEventListener('click', () => {
    CONTENT_FIELDS.forEach(([path]) => setPath(EDIT, path, getPath(BASE, path)));
    $$('#contentFields input').forEach(i => { i.value = getPath(BASE, i.dataset.path) ?? ''; });
    persist(); msg('#contentMsg', 'Content reset to defaults.', 'ok');
  });
}

/* ---------- IMAGES TAB ---------- */
function buildImagesTab() {
  const wrap = $('#galleryItems');
  wrap.innerHTML = '';
  const sections = [...new Set(IMAGE_SLOTS.map(slot => slot.section))];
  sections.forEach(section => {
    const group = document.createElement('section');
    group.className = 'image-section';
    group.innerHTML = `<h3>${esc(section)}</h3>`;
    IMAGE_SLOTS.filter(slot => slot.section === section).forEach(slot => group.appendChild(createImageSlot(slot)));
    wrap.appendChild(group);
  });
  buildMirrorLayersAdmin(wrap);
  $('#saveImagesBtn').onclick = () => {
    persistImages(); msg('#imagesMsg', 'Image changes saved. Reload the site preview to apply them.', 'ok');
  };
  $('#restoreAllImagesBtn').onclick = () => {
    if (!confirm('Restore every image slot to its bundled default?')) return;
    IMAGE_OVERRIDES = {}; persistImages(); buildImagesTab(); msg('#imagesMsg', 'All image slots restored to defaults.', 'ok');
  };
}

function createImageSlot(slot) {
  const row = document.createElement('div');
  row.className = 'image-slot';
  const src = Object.prototype.hasOwnProperty.call(IMAGE_OVERRIDES, slot.id) ? IMAGE_OVERRIDES[slot.id] : slot.src;
  row.innerHTML = `
    <img src="${src || ''}" alt="" ${src ? '' : 'hidden'}>
    <div class="image-slot-copy"><span class="image-slot-label">${esc(slot.label)}</span><span class="image-slot-id">${esc(slot.id)} · ${src ? 'ACTIVE' : 'REMOVED'}</span></div>
    <div class="image-slot-actions">
      <label class="btn btn--small">REPLACE<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
      <button class="btn btn--small btn--ghost" type="button" data-remove>REMOVE</button>
      <button class="btn btn--small btn--ghost" type="button" data-restore>RESTORE</button>
    </div>`;
  $('input[type="file"]', row).addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      IMAGE_OVERRIDES[slot.id] = reader.result;
      if (!persistImages()) { delete IMAGE_OVERRIDES[slot.id]; msg('#imagesMsg', 'This file is too large for browser storage. Use a smaller image.', 'err'); return; }
      buildImagesTab(); msg('#imagesMsg', `${slot.label} replaced. Reload the site preview to apply it.`, 'ok');
    };
    reader.readAsDataURL(file);
  });
  $('[data-remove]', row).addEventListener('click', () => { IMAGE_OVERRIDES[slot.id] = null; persistImages(); buildImagesTab(); msg('#imagesMsg', `${slot.label} removed from this occurrence only.`, 'ok'); });
  $('[data-restore]', row).addEventListener('click', () => { delete IMAGE_OVERRIDES[slot.id]; persistImages(); buildImagesTab(); msg('#imagesMsg', `${slot.label} restored.`, 'ok'); });
  return row;
}

/* ---------- WHAT CHANGED LAYERS ---------- */
function mirrorLayerImageKey(layer) { return `mirror.layer.${layer.id}`; }
function createMirrorLayerId() { return `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function imageForOverride(id, fallback) {
  return Object.prototype.hasOwnProperty.call(IMAGE_OVERRIDES, id) ? IMAGE_OVERRIDES[id] : fallback;
}
function saveMirrorLayers(message) {
  const contentOK = persist();
  const imagesOK = persistImages();
  if (!contentOK || !imagesOK) msg('#imagesMsg', 'Could not save these layers. Use smaller images, then try again.', 'err');
  else msg('#imagesMsg', message || 'What Changed layers saved. Reload the site preview to apply them.', 'ok');
}
function buildMirrorLayersAdmin(wrap) {
  EDIT.mirror.layers = Array.isArray(EDIT.mirror.layers) ? EDIT.mirror.layers : [];
  const section = document.createElement('section');
  section.className = 'image-section mirror-layers-admin';
  section.innerHTML = `<h3>WHAT CHANGED — ADDED IMAGE LAYERS</h3>
    <p class="admin-subnote">These layers sit above the main campaign image. Each one has its own image, position and order. Website dragging remains available; this panel saves the setup in this browser.</p>
    <div class="mirror-layer-admin-list"></div>
    <div class="a-actions mirror-layer-admin-actions">
      <label class="btn btn--small">ADD IMAGE LAYER<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
      <button class="btn btn--small" type="button" data-save-layers>SAVE WHAT CHANGED LAYERS</button>
      <button class="btn btn--small btn--ghost" type="button" data-clear-layers>CLEAR ALL LAYERS</button>
    </div>`;
  const list = $('.mirror-layer-admin-list', section);
  if (!EDIT.mirror.layers.length) list.innerHTML = '<p class="admin-subnote">No added layers yet. Use Add Image Layer to build a composition.</p>';
  EDIT.mirror.layers.forEach((layer, index) => list.appendChild(createMirrorLayerAdminRow(layer, index)));
  $('input[type="file"]', section).addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const layer = { id: createMirrorLayerId(), x: 0, y: 0, src: '' };
      EDIT.mirror.layers.push(layer);
      IMAGE_OVERRIDES[mirrorLayerImageKey(layer)] = reader.result;
      if (!persistImages()) {
        EDIT.mirror.layers.pop();
        delete IMAGE_OVERRIDES[mirrorLayerImageKey(layer)];
        msg('#imagesMsg', 'This file is too large for browser storage. Use a smaller image.', 'err');
        return;
      }
      persist(); buildImagesTab(); msg('#imagesMsg', 'Layer added. Reload the site preview to apply it.', 'ok');
    };
    reader.readAsDataURL(file);
  });
  $('[data-save-layers]', section).addEventListener('click', () => saveMirrorLayers());
  $('[data-clear-layers]', section).addEventListener('click', () => {
    if (!confirm('Remove all added What Changed image layers?')) return;
    EDIT.mirror.layers.forEach(layer => delete IMAGE_OVERRIDES[mirrorLayerImageKey(layer)]);
    EDIT.mirror.layers = [];
    saveMirrorLayers('All What Changed layers cleared. Reload the site preview to apply it.');
    buildImagesTab();
  });
  wrap.appendChild(section);
}
function createMirrorLayerAdminRow(layer, index) {
  const row = document.createElement('div');
  row.className = 'image-slot mirror-layer-admin-row';
  const src = imageForOverride(mirrorLayerImageKey(layer), layer.src || '');
  row.innerHTML = `
    <img src="${src || ''}" alt="" ${src ? '' : 'hidden'}>
    <div class="image-slot-copy"><span class="image-slot-label">LAYER ${String(index + 1).padStart(2, '0')}</span><span class="image-slot-id">${esc(layer.id)} · X ${Number(layer.x) || 0} · Y ${Number(layer.y) || 0}</span>
      <div class="layer-position-fields"><label>X <input type="number" min="-500" max="500" step="1" data-axis="x" value="${Number(layer.x) || 0}"></label><label>Y <input type="number" min="-500" max="500" step="1" data-axis="y" value="${Number(layer.y) || 0}"></label></div></div>
    <div class="image-slot-actions">
      <label class="btn btn--small">REPLACE<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
      <button class="btn btn--small btn--ghost" type="button" data-up ${index === 0 ? 'disabled' : ''}>UP</button>
      <button class="btn btn--small btn--ghost" type="button" data-down ${index === EDIT.mirror.layers.length - 1 ? 'disabled' : ''}>DOWN</button>
      <button class="btn btn--small btn--ghost" type="button" data-remove-layer>DELETE</button>
    </div>`;
  $$('input[data-axis]', row).forEach(input => input.addEventListener('change', () => {
    layer[input.dataset.axis] = Math.max(-500, Math.min(500, Number(input.value) || 0));
    saveMirrorLayers('Layer position saved. Reload the site preview to apply it.');
    buildImagesTab();
  }));
  $('input[type="file"]', row).addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      IMAGE_OVERRIDES[mirrorLayerImageKey(layer)] = reader.result;
      if (!persistImages()) { delete IMAGE_OVERRIDES[mirrorLayerImageKey(layer)]; msg('#imagesMsg', 'This file is too large for browser storage. Use a smaller image.', 'err'); return; }
      persist(); buildImagesTab(); msg('#imagesMsg', `Layer ${index + 1} replaced. Reload the site preview to apply it.`, 'ok');
    };
    reader.readAsDataURL(file);
  });
  $('[data-up]', row).addEventListener('click', () => moveMirrorLayer(index, -1));
  $('[data-down]', row).addEventListener('click', () => moveMirrorLayer(index, 1));
  $('[data-remove-layer]', row).addEventListener('click', () => {
    delete IMAGE_OVERRIDES[mirrorLayerImageKey(layer)];
    EDIT.mirror.layers.splice(index, 1);
    saveMirrorLayers(`Layer ${index + 1} deleted. Reload the site preview to apply it.`);
    buildImagesTab();
  });
  return row;
}
function moveMirrorLayer(index, direction) {
  const next = index + direction;
  if (next < 0 || next >= EDIT.mirror.layers.length) return;
  [EDIT.mirror.layers[index], EDIT.mirror.layers[next]] = [EDIT.mirror.layers[next], EDIT.mirror.layers[index]];
  saveMirrorLayers('Layer order saved. Reload the site preview to apply it.');
  buildImagesTab();
}

/* ---------- PRESETS TAB ---------- */
const PRESET_FIELDS = [
  ['bg', 'Background', 'color'], ['surface', 'Surface', 'color'], ['text', 'Text', 'color'], ['accent', 'Accent', 'color'],
  ['font', 'Font', 'text'], ['weight', 'Weight', 'number'],
  ['sat', 'Saturation', 'number'], ['hue', 'Hue', 'number'], ['contrast', 'Contrast', 'number'], ['bright', 'Brightness', 'number'],
  ['imgScale', 'Image scale', 'number'], ['imgPos', 'Image position', 'number'], ['spacing', 'Spacing', 'number'],
  ['align', 'Alignment', 'text'], ['message', 'Messaging', 'textarea']
];
function buildPresetsTab() {
  const wrap = $('#presetEditors');
  wrap.innerHTML = '';
  Object.entries(EDIT.decide.presets).forEach(([key, p]) => {
    const box = document.createElement('div');
    box.className = 'preset-editor';
    box.innerHTML = `<h3>${esc(p.label)}</h3><div class="a-grid"></div>`;
    const grid = box.querySelector('.a-grid');
    PRESET_FIELDS.forEach(([f, label, type]) => {
      const div = document.createElement('div');
      div.className = 'a-field';
      const id = `preset-${key}-${f}`;
      if (type === 'textarea') {
        div.innerHTML = `<label>${esc(label)}</label><textarea id="${id}" rows="2">${esc(p[f])}</textarea>`;
      } else {
        div.innerHTML = `<label>${esc(label)}</label><input type="${type === 'color' ? 'color' : type}" id="${id}" value="${esc(p[f])}">`;
      }
      grid.appendChild(div);
    });
    wrap.appendChild(box);
  });
  $('#savePresetsBtn').addEventListener('click', () => {
    Object.keys(EDIT.decide.presets).forEach(key => {
      PRESET_FIELDS.forEach(([f, , type]) => {
        const el = $(`#preset-${key}-${f}`);
        EDIT.decide.presets[key][f] = type === 'number' ? +el.value : el.value;
      });
    });
    persist(); msg('#presetsMsg', 'Presets saved.', 'ok');
  });
}

/* ---------- ANIMATION TAB ---------- */
const ANIM_FIELDS = [
  ['animation.blackoutMs', 'Blackout duration (ms)'],
  ['animation.staggerMs', 'Stagger timing (ms)'],
  ['animation.floatIntensity', 'Floating intensity (0–2)'],
  ['animation.parallaxStrength', 'Parallax strength (0–2)'],
  ['animation.marqueeSpeed', 'Marquee speed (0–3)'],
  ['animation.sectionRevealMs', 'Section header reveal (ms)'],
  ['animation.gallerySwitchMs', 'Black collage switch interval (ms)'],
  ['animation.galleryShiftMs', 'Black collage position transition (ms)'],
  ['animation.preloaderMinMs', 'Advertisement preloader minimum (ms)']
];
function buildAnimTab() {
  const wrap = $('#animFields');
  ANIM_FIELDS.forEach(([path, label]) => {
    const div = document.createElement('div');
    div.className = 'a-field';
    div.innerHTML = `<label>${esc(label)}</label><input type="number" step="0.1" data-path="${esc(path)}" value="${esc(getPath(EDIT, path))}">`;
    wrap.appendChild(div);
  });
  $('#saveAnimBtn').addEventListener('click', () => {
    $$('#animFields input').forEach(i => setPath(EDIT, i.dataset.path, +i.value));
    persist(); msg('#animMsg', 'Animation settings saved. Reduced-motion mode always respects the OS preference.', 'ok');
  });
}

/* ---------- EVALUATION TAB ---------- */
const WEIGHT_KEYS = [['claimSupport','Claim support'],['priceConsistency','Price & value consistency'],['featureConsistency','Feature & quality consistency'],['impliedBenefits','Implied benefits'],['transparency','Transparency & missing info']];
function buildEvalTab() {
  const wr = $('#weightRows');
  WEIGHT_KEYS.forEach(([k, label]) => {
    const row = document.createElement('div');
    row.className = 'weight-row';
    row.innerHTML = `<label>${esc(label)}</label><input type="number" step="0.01" min="0" max="1" id="w-${k}" value="${EDIT.evaluation.weights[k]}">`;
    wr.appendChild(row);
  });
  const ef = $('#evalFields');
  EDIT.evaluation.recommendations.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'a-field';
    div.innerHTML = `<label>RECOMMENDATION ${i + 1}</label><input type="text" data-rec="${i}" value="${esc(r)}">`;
    ef.appendChild(div);
  });
  $('#saveEvalBtn').addEventListener('click', () => {
    let sum = 0;
    WEIGHT_KEYS.forEach(([k]) => {
      const v = clampW(+$(`#w-${k}`).value);
      EDIT.evaluation.weights[k] = v; sum += v;
    });
    if (Math.abs(sum - 1) > 0.001) { msg('#evalMsg', `Weights sum to ${sum.toFixed(2)} — they must sum to 1.00.`, 'err'); return; }
    $$('#evalFields input').forEach(i => { EDIT.evaluation.recommendations[+i.dataset.rec] = i.value; });
    persist(); msg('#evalMsg', 'Evaluation configuration saved.', 'ok');
  });
}
function clampW(v) { return Math.min(1, Math.max(0, isNaN(v) ? 0 : v)); }

/* ---------- MANAGE TAB ---------- */
function buildManageTab() {
  $('#exportBtn').addEventListener('click', () => {
    const exportData = Object.assign({}, EDIT, { _imageOverrides: IMAGE_OVERRIDES });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'perception-lab-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
    msg('#manageMsg', 'Configuration exported.', 'ok');
  });
  $('#importInput').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || !data.site || !data.decide) {
          throw new Error('Missing required top-level keys (site, decide).');
        }
        IMAGE_OVERRIDES = data._imageOverrides && typeof data._imageOverrides === 'object' ? data._imageOverrides : {};
        delete data._imageOverrides;
        EDIT = merge(BASE, data);
        persist(); persistImages();
        msg('#manageMsg', 'Configuration imported and saved. Reload panels to edit imported values.', 'ok');
      } catch (err) {
        msg('#manageMsg', 'Import failed: ' + err.message, 'err');
      }
    };
    reader.readAsText(f);
  });
  $('#wipeBtn').addEventListener('click', () => {
    if (!confirm('Reset ALL local changes to defaults?')) return;
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(IMAGE_LS_KEY);
    EDIT = JSON.parse(JSON.stringify(BASE));
    IMAGE_OVERRIDES = {};
    msg('#manageMsg', 'All local changes cleared. Reload the page.', 'ok');
  });
}

/* ---------- persistence ---------- */
function persist() {
  // Store only diffs vs BASE to keep localStorage small
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(EDIT));
    return true;
  } catch (error) {
    console.warn('Content changes could not be saved:', error);
    return false;
  }
}
function persistImages() {
  try {
    localStorage.setItem(IMAGE_LS_KEY, JSON.stringify(IMAGE_OVERRIDES));
    return true;
  } catch (error) {
    console.warn('Image overrides could not be saved:', error);
    return false;
  }
}
function msg(sel, text, kind) {
  const el = $(sel);
  el.textContent = text;
  el.className = 'a-msg ' + kind;
}

document.addEventListener('DOMContentLoaded', boot);
