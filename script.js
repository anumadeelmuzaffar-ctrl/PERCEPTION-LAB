/* ============================================================
   PERCEPTION LAB — script.js
   Data-driven interactive advertising perception experiment.
   Systems: hero collage, marquee, lab tiles, decide presets,
   branding mirror, scroll gallery, evaluation wizard,
   publish checklist, final reveal.
   ============================================================ */
'use strict';

/* ---------- tiny helpers ---------- */
const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const fmt   = n => Math.round(n).toLocaleString('en-US');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Escape user text before insertion */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ---------- central state ---------- */
let CFG = null;               // content.json
const IMAGE_OVERRIDE_KEY = 'pl_image_overrides';
let IMAGE_OVERRIDES = {};
const state = {
  decidePreset: 'luxury',
  decideEstimate: 50000,
  actualPrice: 4800,
  mirror: {},                 // mirror control values
  wizard: {
    step: 0,
    image: null,              // {src, name, demoId}
    name: '', category: '', desc: '', price: '', qualities: '',
    perceptions: [],
    rPrice: '', rMaterials: '', rQuality: '', rProduction: '', rAvailability: '', rClaims: '', rLimitations: ''
  },
  checklist: {},              // qIndex -> 'YES'|'NO'|'UNSURE'
  evaluation: null
};

// The What Changed control model is deliberately fixed. Earlier browser
// sessions stored legacy `imgScale`, `imgPos`, and `crop` controls; those keys
// do not map to the two-axis editor and left the Image tab blank.
const MIRROR_CONTROL_SCHEMA = [
  { key: 'bg', label: 'BACKGROUND', type: 'color', default: '#ffffff' },
  { key: 'textColor', label: 'TEXT COLOUR', type: 'color', default: '#050505' },
  { key: 'sat', label: 'SATURATION', type: 'range', min: 0, max: 200, default: 100 },
  { key: 'hue', label: 'HUE', type: 'range', min: 0, max: 360, default: 0 },
  { key: 'contrast', label: 'CONTRAST', type: 'range', min: 50, max: 180, default: 100 },
  { key: 'bright', label: 'BRIGHTNESS', type: 'range', min: 40, max: 180, default: 100 },
  { key: 'font', label: 'TYPOGRAPHY', type: 'segment', options: ['sans', 'serif', 'mono', 'display'], default: 'sans' },
  { key: 'weight', label: 'FONT WEIGHT', type: 'range', min: 300, max: 900, step: 100, default: 800 },
  { key: 'headlineScale', label: 'HEADLINE SCALE', type: 'range', min: 60, max: 180, default: 100 },
  { key: 'bodyScale', label: 'BODY SCALE', type: 'range', min: 25, max: 140, default: 100 },
  { key: 'imgScaleX', label: 'IMAGE SCALE', type: 'range', min: 50, max: 180, default: 125 },
  { key: 'imgPosX', label: 'IMAGE POSITION', type: 'range', min: 0, max: 100, default: 50 },
  { key: 'cropX', label: 'IMAGE CROP', type: 'range', min: 60, max: 160, default: 100 },
  { key: 'imgScaleY', label: 'IMAGE SCALE', type: 'range', min: 50, max: 180, default: 125 },
  { key: 'imgPosY', label: 'IMAGE POSITION', type: 'range', min: 0, max: 100, default: 50 },
  { key: 'cropY', label: 'IMAGE CROP', type: 'range', min: 60, max: 160, default: 100 },
  { key: 'removeBg', label: 'BACKGROUND REMOVAL', type: 'segment', options: ['off', 'on'], default: 'off' },
  { key: 'align', label: 'ALIGNMENT', type: 'segment', options: ['left', 'center'], default: 'left' },
  { key: 'messageStyle', label: 'MESSAGING STYLE', type: 'segment', options: ['minimal', 'descriptive', 'urgent'], default: 'descriptive' }
];

/* ============================================================
   CONTENT LOADING
   ============================================================ */
async function loadContent() {
  try {
    const res = await fetch('content.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    CFG = await res.json();
  } catch (e) {
    console.error('content.json failed, using embedded fallback.', e);
    CFG = FALLBACK_CONTENT;
  }
  // Admin overrides (localStorage)
  try {
    const saved = localStorage.getItem('pl_content');
    if (saved) {
      const overrides = JSON.parse(saved);
      CFG = deepMerge(CFG, overrides);
    }
  } catch (e) { /* ignore malformed saved content */ }
  // Do not let a legacy admin save replace the two-axis Image control model.
  CFG.mirror.controls = MIRROR_CONTROL_SCHEMA.map(control => ({ ...control }));
  try {
    const savedImages = localStorage.getItem(IMAGE_OVERRIDE_KEY);
    if (savedImages) IMAGE_OVERRIDES = JSON.parse(savedImages) || {};
  } catch (e) { IMAGE_OVERRIDES = {}; }
  document.documentElement.style.setProperty('--section-reveal-duration', `${Math.max(200, CFG.animation.sectionRevealMs || 900)}ms`);
  document.documentElement.style.setProperty('--gallery-shift-duration', `${Math.max(500, CFG.animation.galleryShiftMs || 1450)}ms`);
  applyContent();
  applyTestHeadingPositions();
}

function applyTestHeadingPositions() {
  const positions = CFG.test && CFG.test.headingPositions ? CFG.test.headingPositions : {};
  const targets = { section: 'testHeading', define: 'testHeadingDefine', intended: 'testHeadingIntended', reality: 'testHeadingReality', compare: 'testHeadingCompare', result: 'testHeadingResult' };
  Object.entries(targets).forEach(([key, id]) => {
    const target = document.getElementById(id);
    const value = positions[key] || {};
    if (!target) return;
    target.style.setProperty('--heading-x', `${clamp(+value.x || 0, -180, 180)}px`);
    target.style.setProperty('--heading-y', `${clamp(+value.y || 0, -180, 180)}px`);
  });
}

/* Each occurrence has its own key, including repeated source artwork. A null
   override deliberately removes only that one occurrence. */
function imageForSlot(slotId, fallback) {
  return Object.prototype.hasOwnProperty.call(IMAGE_OVERRIDES, slotId)
    ? IMAGE_OVERRIDES[slotId]
    : fallback;
}

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], over[k]);
    } else { out[k] = over[k]; }
  }
  return out;
}

/* data-content="a.b.c" text injection */
function applyContent() {
  $$('[data-content]').forEach(el => {
    const path = el.getAttribute('data-content').split('.');
    let v = CFG;
    for (const p of path) v = v && v[p];
    if (typeof v !== 'string') return;
    if (el.classList.contains('decide-headline')) {
      const words = v.trim().split(/\s+/);
      const last = words.pop() || '';
      const penultimate = words.pop() || '';
      el.innerHTML = `<span>${esc(words.join(' '))}</span><span>${esc(penultimate)} <em>${esc(last)}</em></span>`;
      return;
    }
    el.textContent = v;
  });
}

/* ============================================================
   GENERATED DEMO "PHOTOS"
   Abstract editorial SVG placeholders — no real brands.
   ============================================================ */
function demoPhoto(label, seed) {
  const palettes = [
    ['#c8a24a', '#0d0c0b', '#f3ead8'],
    ['#e4572e', '#fff4b8', '#050505'],
    ['#7b2ff7', '#c7ff46', '#050505'],
    ['#2f6fed', '#f4f6f8', '#111418'],
    ['#c7ff46', '#050505', '#ffffff'],
    ['#a7a6ff', '#050505', '#ffffff'],
    ['#9be8f7', '#050505', '#ffffff'],
    ['#050505', '#c8a24a', '#f3ead8']
  ];
  const p = palettes[seed % palettes.length];
  const r = mulberry(seed);
  const shapes = [];
  for (let i = 0; i < 4; i++) {
    const x = r() * 70, y = r() * 60, w = 15 + r() * 30, h = 15 + r() * 35;
    const c = p[i % 3];
    const kind = i % 3;
    if (kind === 0) shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" opacity="0.9"/>`);
    else if (kind === 1) shapes.push(`<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}" fill="${c}" opacity="0.85"/>`);
    else shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${c}" stroke-width="2"/>`);
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block;background:${p[1]}">
      ${shapes.join('')}
      <text x="6" y="94" font-family="Arial" font-size="5.5" font-weight="700" fill="${p[2]}" letter-spacing="1">${esc(label)}</text>
    </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ============================================================
   1. HERO — blackout, staggered collage, floating, parallax
   ============================================================ */
const HERO_CAMPAIGNS = [
  { src: 'assets/hero-campaigns/coca-cola-friends.png', alt: 'Coca-Cola campaign showing friends sharing a bottle' },
  { src: 'assets/hero-campaigns/coca-cola-santa.png', alt: 'Coca-Cola holiday campaign' },
  { src: 'assets/hero-campaigns/snickers-hungry.png', alt: 'Snickers advertising campaign' },
  { src: 'assets/hero-campaigns/snickers-campaign.png', alt: 'Snickers portrait campaign' },
  { src: 'assets/hero-campaigns/mms-campaign.png', alt: 'M and M campaign visual' },
  { src: 'assets/hero-campaigns/rosie-campaign.png', alt: 'We Can Do It campaign visual' },
  { src: 'assets/hero-campaigns/heinz-campaign.png', alt: 'Heinz campaign visual' },
  { src: 'assets/hero-campaigns/guinness-campaign.png', alt: 'Guinness campaign visual' },
  { src: 'assets/hero-campaigns/mcdonalds-campaign.png', alt: 'McDonalds campaign visual' }
];

function initHero() {
  const collage = $('#heroCollage');
  const cards = CFG.hero.placeholders.concat([{
    label: 'FOOD / BEVERAGE', x: 48, y: 69, w: 11, speed: 0.45, amp: 11, delay: 1.25
  }]);

  cards.forEach((c, i) => {
    const campaign = HERO_CAMPAIGNS[i % HERO_CAMPAIGNS.length];
    const imageSrc = imageForSlot(`hero.${i}`, campaign.src);
    if (!imageSrc) return;
    const el = document.createElement('figure');
    el.className = 'hero-card';
    el.style.left = c.x + '%';
    el.style.top = c.y + '%';
    el.style.width = c.w + '%';
    el.dataset.speed = c.speed;
    el.dataset.amp = c.amp;
    el.dataset.phase = (i * 1.7).toFixed(2);
    el.innerHTML =
      `<div class="hero-card-img"><img class="hero-card-media" src="${imageSrc}" alt="${esc(campaign.alt)}"></div>
       <figcaption class="hero-card-label"><span>${esc(c.label)}</span></figcaption>`;
    collage.appendChild(el);
  });

  const hero = $('#top');
  const sources = HERO_CAMPAIGNS
    .map((campaign, i) => imageForSlot(`hero.${i}`, campaign.src))
    .filter(Boolean);
  runAdPreloader(sources, () => {
    hero.classList.add('is-scrolled');
    $$('.hero-card').forEach((el, i) => setTimeout(() => el.classList.add('is-in'), i * (CFG.animation.staggerMs || 120)));
    $('#heroLine1').classList.add('is-in');
    setTimeout(() => $('#heroLine2').classList.add('is-in'), REDUCED ? 0 : 180);
    startHeroMotion();
  });
}

/* The first screen is the question, not a route into the test flow. The loading
   sequence uses the real campaign sources and waits for their browser fetches. */
function runAdPreloader(sources, onDone) {
  const loader = $('#blackout');
  const stage = $('#preloaderStage');
  const counter = $('#preloaderCount');
  const percent = $('#preloaderPercent');
  if (!loader || !stage) { onDone(); return; }
  document.body.classList.add('is-loading');
  const uniqueSources = [...new Set(sources)];
  const total = Math.max(1, uniqueSources.length);
  const startedAt = performance.now();
  const minDuration = REDUCED ? 120 : Math.max(900, CFG.animation.preloaderMinMs || 1850);
  let loaded = 0;
  let targetProgress = 0;
  let shownProgress = 0;
  let progressFrame = 0;
  uniqueSources.forEach((src, index) => {
    const frame = document.createElement('figure');
    frame.className = 'preloader-ad';
    frame.style.setProperty('--preload-index', index);
    frame.innerHTML = `<img src="${src}" alt="">`;
    stage.appendChild(frame);
  });
  const paintProgress = () => {
    // Ease the numeral toward the actual loaded percentage. This keeps cached
    // images from making the loader flash immediately from 00 to 100.
    shownProgress += (targetProgress - shownProgress) * 0.115;
    if (Math.abs(targetProgress - shownProgress) < 0.18) shownProgress = targetProgress;
    percent.textContent = String(Math.round(shownProgress)).padStart(2, '0');
    // The archive becomes visible in lockstep with the number: no sudden
    // appearance before the loading counter has earned it.
    stage.style.setProperty('--preload-progress', (shownProgress / 100).toFixed(3));
    if (shownProgress !== targetProgress) progressFrame = window.requestAnimationFrame(paintProgress);
    else progressFrame = 0;
  };
  const setProgress = value => {
    targetProgress = clamp(value, 0, 100);
    if (!progressFrame) progressFrame = window.requestAnimationFrame(paintProgress);
  };
  const update = () => {
    const value = Math.round((loaded / total) * 100);
    counter.textContent = `${String(loaded).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    setProgress(value);
    const frame = $('.preloader-ad', stage);
    const allFrames = $$('.preloader-ad', stage);
    if (allFrames[loaded - 1]) allFrames[loaded - 1].classList.add('is-loaded');
    if (frame && loaded === 0) frame.classList.add('is-loaded');
  };
  const complete = () => {
    if (shownProgress < 100) {
      window.requestAnimationFrame(complete);
      return;
    }
    const remaining = Math.max(0, minDuration - (performance.now() - startedAt));
    window.setTimeout(() => {
      loader.classList.add('is-complete');
      window.setTimeout(() => {
        loader.classList.add('is-hidden');
        loader.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('is-loading');
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        onDone();
      }, REDUCED ? 0 : 620);
    }, remaining);
  };
  update();
  Promise.all(uniqueSources.map(src => new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      loaded += 1;
      update();
      resolve();
    };
    image.onload = image.onerror = settle;
    image.src = src;
    if (image.complete) settle();
  }))).then(complete);
}

/* Floating + scroll parallax via rAF */
let heroCards = [];
function startHeroMotion() {
  heroCards = $$('.hero-card');
  if (REDUCED) return; // static collage under reduced motion
  let ticking = false;
  function frame(t) {
    ticking = false;
    const scrollY = window.scrollY;
    const intensity = CFG.animation.floatIntensity ?? 1;
    const pStrength = (CFG.animation.parallaxStrength ?? 1) * (window.innerWidth < 720 ? 0.4 : 1);
    for (const el of heroCards) {
      if (!el.classList.contains('is-in')) continue;
      const speed = parseFloat(el.dataset.speed);
      const amp = parseFloat(el.dataset.amp) * intensity;
      const phase = parseFloat(el.dataset.phase);
      const floatY = Math.sin(t / 1400 + phase) * amp;
      const parY = -scrollY * speed * 0.35 * pStrength;
      const driftX = Math.cos(t / 2100 + phase) * amp * 0.4;
      el.style.transform = `translate3d(${driftX.toFixed(1)}px, ${(floatY + parY).toFixed(1)}px, 0)`;
    }
    requestAnimationFrame(frame);
    ticking = true;
  }
  requestAnimationFrame(frame);
}

/* ============================================================
   2. MARQUEE — scroll-driven horizontal movement (reversible)
   ============================================================ */
function initMarquee() {
  const track = $('#marqueeTrack');
  const text = CFG.marquee.text || 'A PRODUCT. A PERCEPTION. OR BOTH.';
  // Build 2 identical groups for seamless loop
  const group = () => {
    const g = document.createElement('div');
    g.className = 'marquee-inner';
    for (let i = 0; i < 4; i++) {
      const phrase = document.createElement('span');
      phrase.className = 'marquee-phrase';
      const filled = document.createElement('span');
      filled.className = 'marquee-item marquee-item--filled';
      filled.textContent = text;
      const outlined = document.createElement('span');
      outlined.className = 'marquee-item marquee-item--outline';
      outlined.textContent = text;
      phrase.append(filled, outlined);
      g.appendChild(phrase);
    }
    return g;
  };
  const g1 = group(), g2 = group();
  track.appendChild(g1); track.appendChild(g2);

  // The lime strip is intentionally just the moving question; section links live
  // in the floating iOS-style navigator, so the section stays clean.
  const ul = $('#marqueeNavLinks');
  if (ul) CFG.marquee.links.forEach(l => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${esc(l.target)}">${esc(l.label)}</a>`;
    ul.appendChild(li);
  });
  // Hero nav
  const hn = $('#heroNavLinks');
  if (hn) CFG.hero.nav.forEach(n => {
    const li = document.createElement('li');
    const target = { '01. PERCEPTION': 'lab', '02. INVESTIGATE': 'mirror', '03. ANALYZE': 'test', '04. REFRAME': 'publish' }[n] || 'lab';
    li.innerHTML = `<a href="#${target}">${esc(n)}</a>`;
    hn.appendChild(li);
  });

  if (REDUCED) return;
  const speed = CFG.animation.marqueeSpeed ?? 1;
  let x = 0, lastScroll = window.scrollY, wasVisible = false;
  function tick() {
    const sy = window.scrollY;
    const delta = sy - lastScroll;
    lastScroll = sy;
    const bounds = track.getBoundingClientRect();
    const isVisible = bounds.bottom > 0 && bounds.top < window.innerHeight;
    // Reset while the strip is off screen. The first frame on entry therefore
    // always begins at the filled “A PRODUCT. A PERCEPTION. OR BOTH” phrase.
    if (!isVisible) {
      x = 0;
      wasVisible = false;
    } else if (wasVisible) {
      x -= delta * 0.55 * speed;
    } else {
      x = 0;
      wasVisible = true;
    }
    const w = g1.offsetWidth;
    if (w > 0) {
      if (x <= -w) x += w;
      // Keep the filled phrase anchored at the left edge when scrolling up;
      // it prevents the outlined copy from arriving before “A PRODUCT”.
      if (x > 0) x = 0;
    }
    g1.style.transform = `translate3d(${x}px,0,0)`;
    g2.style.transform = `translate3d(${x}px,0,0)`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ============================================================
   3. THE PERCEPTION LAB — tiles + indicators
   ============================================================ */
const LAB_TILE_PROFILES = {
  LUXURY: {
    src: 'assets/lab-positions/luxury.png',
    alt: 'Luxury product campaign',
    readout: { value: 96, premium: 94, quality: 90, trust: 72 }
  },
  AFFORDABLE: {
    src: 'assets/lab-positions/affordable.png',
    alt: 'Affordable product campaign',
    readout: { value: 48, premium: 33, quality: 59, trust: 82 }
  },
  YOUTHFUL: {
    src: 'assets/lab-positions/youthful.png',
    alt: 'Youthful product campaign',
    readout: { value: 62, premium: 51, quality: 57, trust: 66 }
  },
  CLINICAL: {
    src: 'assets/lab-positions/clinical.png',
    alt: 'Clinical product campaign',
    readout: { value: 68, premium: 56, quality: 88, trust: 93 }
  },
  EXCLUSIVE: {
    src: 'assets/lab-positions/exclusive.png',
    alt: 'Exclusive product campaign',
    readout: { value: 91, premium: 97, quality: 92, trust: 74 }
  }
};
const DECIDE_CAMPAIGN_IMAGES = {
  luxury: LAB_TILE_PROFILES.LUXURY.src,
  affordable: LAB_TILE_PROFILES.AFFORDABLE.src,
  youthful: LAB_TILE_PROFILES.YOUTHFUL.src,
  clinical: LAB_TILE_PROFILES.CLINICAL.src,
  exclusive: LAB_TILE_PROFILES.EXCLUSIVE.src
};

function initLab() {
  const wrap = $('#labTiles');
  // The Perception Lab is a five-position comparison. A stale browser
  // configuration must never be allowed to collapse it into fewer tiles.
  const tileNames = ['LUXURY', 'AFFORDABLE', 'YOUTHFUL', 'CLINICAL', 'EXCLUSIVE'];
  const resetReadout = () => {
    $$('.lab-indicators .indicator').forEach(row => {
      const input = $('input', row);
      const fill = $('.indicator-fill', row);
      const label = $('.indicator-val', row);
      if (input) input.value = 0;
      if (fill) fill.style.width = '0%';
      if (label) label.textContent = '0/100';
    });
  };
  const updateReadout = (name) => {
    const profile = LAB_TILE_PROFILES[name];
    if (!profile) return;
    const rows = $$('.lab-indicators .indicator');
    CFG.lab.indicators.forEach((indicator, index) => {
      const value = profile.readout[indicator.key];
      const row = rows[index];
      if (!row || value == null) return;
      const input = $('input', row);
      const fill = $('.indicator-fill', row);
      const label = $('.indicator-val', row);
      input.value = value;
      fill.style.width = value + '%';
      label.textContent = value + '/100';
    });
  };
  tileNames.forEach((t, i) => {
    const profile = LAB_TILE_PROFILES[t] || { src: demoPhoto(CFG.lab.productName + ' — ' + t, i + 20), alt: 'Hypothetical product presented as ' + t };
    const imageSrc = imageForSlot(`lab.${t}`, profile.src);
    const el = document.createElement('div');
    el.className = 'lab-tile';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', t + ' perception tile');
    el.innerHTML =
      `<div class="lab-tile-img">${imageSrc ? `<img src="${imageSrc}" alt="${esc(profile.alt)}" style="width:100%;height:100%;object-fit:contain;display:block;">` : ''}</div>
       <div class="lab-tile-readout" aria-hidden="true">
         <span>VALUE <b>${profile.readout ? profile.readout.value : 0}</b></span>
         <span>PREM <b>${profile.readout ? profile.readout.premium : 0}</b></span>
         <span>QUALITY <b>${profile.readout ? profile.readout.quality : 0}</b></span>
         <span>TRUST <b>${profile.readout ? profile.readout.trust : 0}</b></span>
       </div>
       <span class="lab-tile-label">${esc(t)}</span>`;
    const image = $('img', el);
    // An invalid saved override should fail safely to the bundled campaign,
    // rather than leaving an empty mobile tile.
    if (image && imageSrc !== profile.src) {
      image.addEventListener('error', () => {
        if (image.dataset.usedFallback) return;
        image.dataset.usedFallback = 'true';
        image.src = profile.src;
      }, { once: true });
    }
    // On a mouse, the visual is intentionally transient: it expands only while hovered.
    // Touch and keyboard users retain a selected state without changing the five-tile grid.
    el.addEventListener('mouseenter', () => {
      if (window.matchMedia('(hover: none)').matches) return;
      $$('.lab-tile', wrap).forEach(x => x.classList.remove('is-expanded'));
      el.classList.add('is-expanded');
      updateReadout(t);
    });
    el.addEventListener('mouseleave', () => {
      if (window.matchMedia('(hover: none)').matches) return;
      el.classList.remove('is-expanded');
      resetReadout();
    });
    el.addEventListener('pointermove', event => {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      el.style.setProperty('--tile-x', `${(x * 16).toFixed(1)}px`);
      el.style.setProperty('--tile-y', `${(y * 16).toFixed(1)}px`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--tile-x', '0px');
      el.style.setProperty('--tile-y', '0px');
    });
    el.addEventListener('focus', () => {
      if (window.matchMedia('(hover: hover)').matches) return;
      el.classList.add('is-expanded');
      updateReadout(t);
    });
    el.addEventListener('blur', () => {
      if (window.matchMedia('(hover: hover)').matches) return;
      el.classList.remove('is-expanded');
      resetReadout();
    });
    // Mobile has no hover. A tap opens exactly one perception visual and
    // exposes its compact readout; a second tap closes it again.
    el.addEventListener('click', () => {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const touch = window.matchMedia('(hover: none)').matches;
 if (!mobile && !touch) return;
      const wasOpenedByTap = el.dataset.tapOpen === 'true';
      $$('.lab-tile', wrap).forEach(tile => {
        tile.classList.remove('is-expanded');
        delete tile.dataset.tapOpen;
      });
      if (wasOpenedByTap) {
        resetReadout();
      } else {
        el.classList.add('is-expanded');
        el.dataset.tapOpen = 'true';
        updateReadout(t);
      }
    });
    el.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && window.matchMedia('(hover: hover)').matches) {
        e.preventDefault();
        el.classList.toggle('is-expanded');
        el.classList.contains('is-expanded') ? updateReadout(t) : resetReadout();
      }
    });
    wrap.appendChild(el);
  });

  const ind = $('#labIndicators');
  CFG.lab.indicators.forEach(ic => {
    const row = document.createElement('div');
    row.className = 'indicator';
    row.innerHTML =
      `<div class="indicator-head"><span>${esc(ic.label)}</span><span class="indicator-val">0/100</span></div>
       <div class="indicator-track"><div class="indicator-fill" style="width:0%"></div></div>
       <input type="range" min="0" max="100" value="0" aria-label="${esc(ic.label)}">`;
    const input = row.querySelector('input');
    const fill = row.querySelector('.indicator-fill');
    const val = row.querySelector('.indicator-val');
    input.addEventListener('input', () => {
      fill.style.width = input.value + '%';
      val.textContent = input.value + '/100';
    });
    ind.appendChild(row);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $$('.lab-tile', wrap).forEach(x => x.classList.remove('is-expanded'));
      resetReadout();
    }
  });
}

/* ============================================================
   4. YOU DECIDE — full preset system
   ============================================================ */
function initDecide() {
  state.decideEstimate = CFG.decide.defaultEstimate;
  state.actualPrice = CFG.decide.actualPrice;
  state.decideHasSetPerception = false;

  const slider = $('#decideSlider');
  slider.min = CFG.decide.minPrice; slider.max = CFG.decide.maxPrice;
  slider.value = state.decideEstimate;
  $('#decideMinLabel').textContent = CFG.decide.currency + ' ' + fmt(CFG.decide.minPrice);
  $('#decideMaxLabel').textContent = CFG.decide.currency + ' ' + fmt(CFG.decide.maxPrice);
  const est = $('#decideEstimate');
  const cmpP = $('#comparePerception');
  const cmpA = $('#compareActual');
  function refreshNumbers() {
    est.textContent = CFG.decide.currency + ' ' + fmt(state.decideEstimate);
    cmpP.textContent = CFG.decide.currency + ' ' + fmt(state.decideEstimate);
    const showActual = state.decideHasSetPerception;
    cmpA.textContent = showActual ? CFG.decide.currency + ' ' + fmt(state.actualPrice) : '';
    $('#actualPriceRow').hidden = !showActual;
  }
  slider.addEventListener('input', () => {
    state.decideEstimate = +slider.value;
    state.decideHasSetPerception = true;
    refreshNumbers();
  });
  // Preset buttons
  const btnWrap = $('#decidePresets');
  Object.entries(CFG.decide.presets).forEach(([key, p]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-btn';
    b.textContent = p.label;
    b.dataset.preset = key;
    b.addEventListener('click', () => applyDecidePreset(key));
    btnWrap.appendChild(b);
  });

  applyDecidePreset(state.decidePreset);
  refreshNumbers();
}

/* Coordinated preset: updates CSS custom properties on the stage */
function applyDecidePreset(key) {
  state.decidePreset = key;
  const p = CFG.decide.presets[key];
  const stage = $('#decideStage');
  const vars = {
    '--dp-bg': p.bg, '--dp-surface': p.surface, '--dp-text': p.text, '--dp-accent': p.accent,
    '--dp-font': p.font === 'serif' ? 'Georgia, "Times New Roman", serif' : "'Figtree', Arial, sans-serif",
    '--dp-weight': p.weight,
    '--dp-bodyScale': p.bodyScale,
    '--dp-sat': p.sat, '--dp-hue': p.hue + 'deg', '--dp-contrast': p.contrast, '--dp-bright': p.bright,
    '--dp-imgScale': p.imgScale, '--dp-imgPos': p.imgPos + '%',
    '--dp-spacing': p.spacing, '--dp-align': p.align
  };
  for (const k in vars) stage.style.setProperty(k, vars[k]);
  $('#decideMessage').textContent = p.message;
  const campaignImage = $('#decideProductImg');
  campaignImage.style.backgroundImage = `url("${DECIDE_CAMPAIGN_IMAGES[key]}")`;
  campaignImage.style.transform = `scale(${p.imgScale})`;
  campaignImage.style.filter = `saturate(${p.sat}) hue-rotate(${p.hue}deg) contrast(${p.contrast}) brightness(${p.bright})`;
  // A new visual deliberately removes the reveal until the visitor sets a new perception.
  state.decideHasSetPerception = false;
  $('#compareActual').textContent = '';
  $('#actualPriceRow').hidden = true;
  // sync buttons
  $$('.preset-btn').forEach(b => b.classList.toggle('is-active', b.dataset.preset === key));
}

/* ============================================================
   5. THE BRANDING MIRROR — live controls + scroll interpolation
   ============================================================ */
const MIRROR_DEFAULTS = {};
const MIRROR_CONTROL_GROUPS = {
  image: ['imgScaleX', 'imgPosX', 'cropX', 'imgScaleY', 'imgPosY', 'cropY'],
  text: ['font', 'weight', 'headlineScale', 'bodyScale', 'align', 'messageStyle'],
  style: ['bg', 'removeBg', 'textColor', 'sat', 'hue', 'contrast', 'bright']
};
const mirrorHistory = { past: [], future: [] };
const mirrorBackgroundCache = new Map();
function initMirror() {
  const controlWrap = $('#mirrorControlsLeft');
  // Keep the composition image as the primary visual on first load. Older
  // saved admin settings used a much smaller default, which left the canvas
  // looking empty; visitors can still scale it down deliberately afterwards.
  ['imgScaleX', 'imgScaleY'].forEach(key => {
    const control = CFG.mirror.controls.find(item => item.key === key);
    if (control) control.default = Math.max(125, Number(control.default) || 125);
  });
  CFG.mirror.controls.forEach(c => { MIRROR_DEFAULTS[c.key] = c.default; state.mirror[c.key] = c.default; });
  const defaultHeadline = $('#mirrorPreviewHeadline').textContent.trim();
  const defaultBody = CFG.mirror.messages.descriptive;
  const defaultImage = imageForSlot('mirror.primary', $('#mirrorImg').getAttribute('src'));
  MIRROR_DEFAULTS.headline = defaultHeadline;
  MIRROR_DEFAULTS.body = defaultBody;
  MIRROR_DEFAULTS.imageSrc = defaultImage;
  const configuredLayers = Array.isArray(CFG.mirror.layers) ? CFG.mirror.layers : [];
  const resolveLayer = layer => ({
    ...layer,
    src: imageForSlot(`mirror.layer.${layer.id}`, layer.src || ''),
    x: Number(layer.x) || 0,
    y: Number(layer.y) || 0
  });
  MIRROR_DEFAULTS.layers = configuredLayers.map(resolveLayer);
  state.mirror.headline = defaultHeadline;
  state.mirror.body = defaultBody;
  state.mirror.imageSrc = defaultImage;
  state.mirror.originalImageSrc = defaultImage;
  state.mirror.layers = MIRROR_DEFAULTS.layers.map(layer => ({ ...layer }));

  const imageAxisHeadings = { imgScaleX: 'HORIZONTAL', imgScaleY: 'VERTICAL' };
  CFG.mirror.controls
    .filter(c => !['spacing', 'negativeSpace'].includes(c.key))
    .forEach((c, i) => {
    if (imageAxisHeadings[c.key]) {
      const heading = document.createElement('p');
      heading.className = 'mirror-control-group-label';
      heading.dataset.controlGroup = 'image';
      heading.textContent = imageAxisHeadings[c.key];
      controlWrap.appendChild(heading);
    }
    const box = document.createElement('div');
    box.className = 'mcontrol';
    box.dataset.controlKey = c.key;
    if (c.type === 'range') {
      box.innerHTML =
        `<label class="mc-label"><span>${esc(c.label)}</span><span class="mc-val">${c.default}</span></label>
         <input type="range" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${c.default}" aria-label="${esc(c.label)}">`;
      const input = box.querySelector('input');
      const val = box.querySelector('.mc-val');
      input.addEventListener('input', () => {
        state.mirror[c.key] = +input.value;
        val.textContent = input.value;
        applyMirror();
      });
    } else if (c.type === 'color') {
      box.innerHTML =
        `<label class="mc-label"><span>${esc(c.label)}</span><span class="mc-val">${c.default}</span></label>
         <input type="color" value="${c.default}" aria-label="${esc(c.label)}">`;
      const input = box.querySelector('input');
      input.addEventListener('input', () => {
        state.mirror[c.key] = input.value;
        box.querySelector('.mc-val').textContent = input.value;
        applyMirror();
      });
    } else if (c.type === 'segment') {
      box.innerHTML =
        `<label class="mc-label"><span>${esc(c.label)}</span></label>
         <div class="mc-segment">${c.options.map(o =>
           `<button type="button" data-val="${esc(o)}" class="${o === c.default ? 'is-active' : ''}">${esc(o.toUpperCase())}</button>`).join('')}</div>`;
      $$('button', box).forEach(b => b.addEventListener('click', () => {
        $$('button', box).forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        state.mirror[c.key] = b.dataset.val;
        applyMirror();
      }));
    }
    box.dataset.controlGroup = Object.keys(MIRROR_CONTROL_GROUPS).find(group => MIRROR_CONTROL_GROUPS[group].includes(c.key)) || 'style';
    // The devices form one calm, scan-friendly rail at the left of the
    // central campaign composition. Actions stay independently on the right.
    controlWrap.appendChild(box);
  });

  $('#mirrorReset').addEventListener('click', resetMirror);
  $$('.mirror-mode-tabs [data-mirror-mode]').forEach(button => button.addEventListener('click', () => setMirrorMode(button.dataset.mirrorMode)));
  $('#mirrorUndo').addEventListener('click', undoMirrorComposition);
  $('#mirrorRedo').addEventListener('click', redoMirrorComposition);
  $('#mirrorDuplicateLayer').addEventListener('click', duplicateSelectedMirrorLayer);
  $('#mirrorDeleteLayer').addEventListener('click', deleteSelectedMirrorLayer);
  $('#mirrorResetLayer').addEventListener('click', resetSelectedMirrorLayer);

  // Editable type stays on the campaign visual instead of becoming detached copy below it.
  ['Headline', 'Body'].forEach(kind => {
    const el = $('#mirrorPreview' + kind);
    el.addEventListener('input', () => { state.mirror[kind.toLowerCase()] = el.textContent.trim(); });
  });
  const changeTextScale = (key, amount) => {
    state.mirror[key] = clamp((+state.mirror[key] || 100) + amount, key === 'headlineScale' ? 60 : 25, key === 'headlineScale' ? 180 : 140);
    const input = $(`.mcontrol[data-control-key="${key}"] input`);
    if (input) {
      input.value = state.mirror[key];
      $('.mc-val', input.closest('.mcontrol')).textContent = state.mirror[key];
    }
    applyMirror();
  };
  $('#mirrorHeadlineDown').addEventListener('click', () => changeTextScale('headlineScale', -5));
  $('#mirrorHeadlineUp').addEventListener('click', () => changeTextScale('headlineScale', 5));
  $('#mirrorTextDown').addEventListener('click', () => changeTextScale('bodyScale', -5));
  $('#mirrorTextUp').addEventListener('click', () => changeTextScale('bodyScale', 5));
  const loadMirrorPng = file => {
    if (!file || file.type !== 'image/png') return;
    const reader = new FileReader();
    reader.onload = () => {
      state.mirror.imageSrc = reader.result;
      $('#mirrorImg').src = reader.result;
      state.mirror.originalImageSrc = reader.result;
      applyMirror();
      setMirrorSelection('mirrorImg', 'image');
    };
    reader.readAsDataURL(file);
  };
  const mirrorUpload = $('#mirrorUpload');
  if (mirrorUpload) mirrorUpload.addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    loadMirrorPng(file);
  });
  const mirrorDropZone = mirrorUpload && mirrorUpload.closest('label');
  if (mirrorDropZone) {
    mirrorDropZone.addEventListener('dragover', event => { event.preventDefault(); mirrorDropZone.classList.add('is-dragover'); });
    mirrorDropZone.addEventListener('dragleave', () => mirrorDropZone.classList.remove('is-dragover'));
    mirrorDropZone.addEventListener('drop', event => {
      event.preventDefault();
      mirrorDropZone.classList.remove('is-dragover');
      loadMirrorPng(event.dataTransfer && event.dataTransfer.files[0]);
    });
  }
    const mirrorLayerUpload = $('#mirrorLayerUpload');

  const addMirrorLayers = files => {
    const file = [...(files || [])].find(file =>
      /^image\/(png|jpe?g|webp)$/i.test(file.type)
    );

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      clearMirrorLayers(false);

      state.mirror.imageSrc = reader.result;
      state.mirror.originalImageSrc = reader.result;

      const image = $('#mirrorImg');
      image.src = reader.result;
      image.hidden = false;
      delete image.dataset.renderKey;

      state.mirror.layout = state.mirror.layout || {};
      state.mirror.layout.mirrorImg = { x: 0, y: 0 };

      applyMirrorDragPosition('mirrorImg', { x: 0, y: 0 });
      applyMirror();
      setMirrorSelection('mirrorImg', 'image');
      recordMirrorHistory();
    };

    reader.readAsDataURL(file);
  };

  if (mirrorLayerUpload) {
    mirrorLayerUpload.addEventListener('change', event => {
      addMirrorLayers(event.target.files);
      event.target.value = '';
    });
  }

  $('#mirrorClearLayers')?.addEventListener('click', clearMirrorLayers);

  initMirrorCanvasDrag();

  state.mirror.layers.forEach(layer => {
    addMirrorLayer(layer.src, layer);
  });

  setMirrorMode('image');
  setMirrorSelection('mirrorImg', 'image');
  recordMirrorHistory();
  applyMirror();
}
function applyMirror() {
  const m = state.mirror;
  const pv = $('#mirrorPreview');
  const vars = {
    '--mp-bg': m.bg || '#ffffff', '--mp-text': m.textColor,
    '--mp-font': ({
      serif: 'Georgia, "Times New Roman", serif',
      mono: '"Courier New", monospace',
      display: 'Impact, "Arial Black", sans-serif',
      sans: "'Figtree', Arial, sans-serif"
    })[m.font] || "'Figtree', Arial, sans-serif",
    '--mp-weight': m.weight,
    '--mp-headlineScale': m.headlineScale / 100,
    '--mp-bodyScale': m.bodyScale / 100,
    '--mp-imgScaleX': Number(m.imgScaleX ?? m.imgScale ?? 125) / 100,
    '--mp-imgScaleY': Number(m.imgScaleY ?? m.imgScale ?? 125) / 100,
    '--mp-sat': m.sat / 100, '--mp-hue': m.hue + 'deg',
    '--mp-contrast': m.contrast / 100, '--mp-bright': m.bright / 100,
    '--mp-align': m.align
  };
  for (const k in vars) pv.style.setProperty(k, vars[k]);
  const img = $('#mirrorImg');
  img.hidden = !m.imageSrc;
  if (m.imageSrc) renderMirrorImage(img, m.imageSrc, m.removeBg === 'on');
  img.style.setProperty('--mp-imgShiftX', ((Number(m.imgPosX ?? m.imgPos ?? 50) - 50) * 0.1).toFixed(2) + '%');
  img.style.setProperty('--mp-imgShiftY', ((Number(m.imgPosY ?? 50) - 50) * 0.1).toFixed(2) + '%');
  img.style.setProperty('--mp-imgCropX', (Number(m.cropX ?? m.crop ?? 100) / 100).toFixed(2));
  img.style.setProperty('--mp-imgCropY', (Number(m.cropY ?? m.crop ?? 100) / 100).toFixed(2));
  const headline = $('#mirrorPreviewHeadline');
  const body = $('#mirrorPreviewBody');
  headline.textContent = m.headline || MIRROR_DEFAULTS.headline;
  body.textContent = m.body || CFG.mirror.messages[m.messageStyle] || MIRROR_DEFAULTS.body;
  const messageStyle = {
    minimal: { size: .82, tracking: '.17em', weight: 800, width: '24ch', casing: 'uppercase', bg: 'transparent', ink: vars['--mp-text'], pad: '0' },
    descriptive: { size: 1, tracking: '.015em', weight: 500, width: '42ch', casing: 'none', bg: 'transparent', ink: vars['--mp-text'], pad: '0' },
    urgent: { size: 1.08, tracking: '.08em', weight: 900, width: '31ch', casing: 'uppercase', bg: vars['--mp-text'], ink: '#ffffff', pad: '.55rem .65rem' }
  }[m.messageStyle] || {};
  Object.entries({
    '--mp-message-size': messageStyle.size || 1,
    '--mp-message-tracking': messageStyle.tracking || '0',
    '--mp-message-weight': messageStyle.weight || 500,
    '--mp-message-width': messageStyle.width || '42ch',
    '--mp-message-case': messageStyle.casing || 'none',
    '--mp-message-bg': messageStyle.bg || 'transparent',
    '--mp-message-ink': messageStyle.ink || vars['--mp-text'],
    '--mp-message-pad': messageStyle.pad || '0'
  }).forEach(([key, value]) => pv.style.setProperty(key, value));

}

/* Background removal is intentionally edge-connected: only pixels that are
   connected to the image edge and resemble the sampled backdrop become
   transparent. The product remains untouched and the chosen canvas colour
   stays behind it. Transparent PNGs pass through unchanged. */
async function removeMirrorBackground(src) {
  if (mirrorBackgroundCache.has(src)) return mirrorBackgroundCache.get(src);
  const task = new Promise((resolve, reject) => {
    const source = new Image();
    source.onload = () => {
      try {
        const maxSide = 1200;
        const ratio = Math.min(1, maxSide / Math.max(source.naturalWidth, source.naturalHeight));
        const width = Math.max(1, Math.round(source.naturalWidth * ratio));
        const height = Math.max(1, Math.round(source.naturalHeight * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(source, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);
        const data = image.data;
        const seen = new Uint8Array(width * height);
        const queue = [];
        const add = (x, y) => {
          const i = y * width + x;
          if (!seen[i]) { seen[i] = 1; queue.push(i); }
        };
        for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
        for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
        const dist = (a, b) => Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
        let head = 0;
        while (head < queue.length) {
          const pixel = queue[head++];
          const x = pixel % width, y = (pixel / width) | 0, offset = pixel * 4;
          if (data[offset + 3] === 0) continue;
          const light = Math.max(data[offset], data[offset + 1], data[offset + 2]);
          const lowColour = Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]) < 34;
          if (!(light > 188 && lowColour)) continue;
          data[offset + 3] = 0;
          [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) add(nx, ny);
          });
        }
        ctx.putImageData(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) { reject(error); }
    };
    source.onerror = () => reject(new Error('Unable to prepare image background removal.'));
    source.src = src;
  });
  mirrorBackgroundCache.set(src, task);
  return task;
}

function renderMirrorImage(img, src, removeBackground) {
  const key = `${src}|${removeBackground ? 'removed' : 'original'}`;
  if (img.dataset.renderKey === key) return;
  img.dataset.renderKey = key;
  if (!removeBackground) { img.src = src; return; }
  removeMirrorBackground(src)
    .then(result => { if (img.dataset.renderKey === key) img.src = result; })
    .catch(() => { if (img.dataset.renderKey === key) img.src = src; });
}

// On a narrow screen the preview becomes the direct manipulation surface:
// visitors can drag the product, headline, or body without fighting sidebars.
function enableMirrorCanvasDrag(target, canvas) {
  if (!target || !canvas || target.dataset.dragReady === 'true') return;
  target.dataset.dragReady = 'true';
  let start = null;
  target.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    setMirrorSelection(target.dataset.layerId || target.id);
    $('#mirrorComposerTip')?.classList.add('is-hidden');
    start = {
      x: event.clientX,
      y: event.clientY,
      left: Number(target.dataset.dragX || 0),
      top: Number(target.dataset.dragY || 0),
      moved: false
    };
    target.setPointerCapture?.(event.pointerId);
  });
  target.addEventListener('pointermove', event => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 6) return;
    start.moved = true;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = clamp(start.left + dx, -rect.width * .48, rect.width * .48);
    const y = clamp(start.top + dy, -rect.height * .48, rect.height * .48);
    target.dataset.dragX = x.toFixed(1);
    target.dataset.dragY = y.toFixed(1);
    target.style.setProperty('--drag-x', `${x}px`);
    target.style.setProperty('--drag-y', `${y}px`);
    state.mirror.layout = state.mirror.layout || {};
    state.mirror.layout[target.id] = { x, y };
    if (target.dataset.layerId) {
      const layer = (state.mirror.layers || []).find(item => item.id === target.dataset.layerId);
      if (layer) Object.assign(layer, { x, y });
    }
  });
  const finish = event => {
    if (!start) return;
    if (start.moved) {
      event.preventDefault();
      recordMirrorHistory();
    }
    start = null;
  };
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
}
function addMirrorLayer(src, existing = null) {
  const canvas = $('#mirrorPreviewInner');
  if (!canvas || !src) return;
  const layer = existing || { id: `mirror-layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, src, x: 0, y: 0, scaleX: 1, scaleY: 1, cropX: 1, cropY: 1 };
  layer.scaleX = Number(layer.scaleX) || 1;
  layer.scaleY = Number(layer.scaleY) || 1;
  layer.cropX = Number(layer.cropX) || 1;
  layer.cropY = Number(layer.cropY) || 1;
  const image = document.createElement('img');
  image.className = 'mirror-overlay-image';
  image.src = layer.src;
  image.alt = 'Added campaign image layer';
  image.dataset.layerId = layer.id;
  image.dataset.dragX = String(layer.x || 0);
  image.dataset.dragY = String(layer.y || 0);
  image.style.setProperty('--drag-x', `${layer.x || 0}px`);
  image.style.setProperty('--drag-y', `${layer.y || 0}px`);
  applyMirrorLayerTransform(image, layer);
  canvas.appendChild(image);
  if (!existing) {
    state.mirror.layers = state.mirror.layers || [];
    state.mirror.layers.push(layer);
  }
  enableMirrorCanvasDrag(image, canvas);
  renderMirrorLayerList();
  setMirrorSelection(layer.id, 'image');
  if (!existing) recordMirrorHistory();
}
function clearMirrorLayers(record = true) {
  const changed = (state.mirror.layers || []).length > 0;
  $$('.mirror-overlay-image').forEach(image => image.remove());
  state.mirror.layers = [];
  const upload = $('#mirrorLayerUpload');
  if (upload) upload.value = '';
  renderMirrorLayerList();
  setMirrorSelection('mirrorImg', 'image');
  if (record && changed) recordMirrorHistory();
}
function initMirrorCanvasDrag() {
  const canvas = $('#mirrorPreviewInner');
  const targets = [$('#mirrorImg'), $('#mirrorPreviewHeadline'), $('#mirrorPreviewBody')];
  if (!canvas || !targets.every(Boolean)) return;
  targets.forEach(target => enableMirrorCanvasDrag(target, canvas));
}

function mirrorLayerEntries() {
  return [
    { id: 'mirrorImg', label: 'MAIN IMAGE', mode: 'image', locked: true },
    ...((state.mirror.layers || []).map((layer, index) => ({ id: layer.id, label: `ADDED IMAGE ${index + 1}`, mode: 'image', layer }))),
    { id: 'mirrorPreviewHeadline', label: 'HEADLINE', mode: 'text', locked: true },
    { id: 'mirrorPreviewBody', label: 'TITLE', mode: 'text', locked: true }
  ];
}
function setMirrorMode(mode) {
  const safeMode = MIRROR_CONTROL_GROUPS[mode] ? mode : 'image';
  state.mirror.mode = safeMode;
  $('#mirror')?.setAttribute('data-mirror-mode', safeMode);
  $$('.mirror-mode-tabs [data-mirror-mode]').forEach(button => {
    const active = button.dataset.mirrorMode === safeMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.mirror-controls .mcontrol, .mirror-controls .mirror-control-group-label').forEach(control => {
    control.hidden = control.dataset.controlGroup !== safeMode;
  });
  const addImagePanel = $('#mirrorImageAddPanel');
  if (addImagePanel) addImagePanel.hidden = safeMode !== 'image';
}
function setMirrorSelection(id, mode) {
  const entry = mirrorLayerEntries().find(item => item.id === id) || mirrorLayerEntries()[0];
  state.mirror.selected = entry.id;
  $$('.mirror-preview-inner .is-selected').forEach(item => item.classList.remove('is-selected'));
  const target = entry.layer ? $(`.mirror-overlay-image[data-layer-id="${entry.id}"]`) : $('#' + entry.id);
  target?.classList.add('is-selected');
  if (mode) setMirrorMode(mode);
  else if (entry.mode) setMirrorMode(entry.mode);
  const label = $('#mirrorSelectedLabel');
  if (label) label.textContent = entry.label;
  const duplicate = $('#mirrorDuplicateLayer');
  const remove = $('#mirrorDeleteLayer');
  if (duplicate) duplicate.disabled = !entry.layer;
  if (remove) remove.disabled = !entry.layer;
  renderMirrorLayerList();
}

function applyMirrorLayerTransform(image, layer) {
  if (!image || !layer) return;
  image.style.setProperty('--layer-scale-x', Number(layer.scaleX || 1).toFixed(3));
  image.style.setProperty('--layer-scale-y', Number(layer.scaleY || 1).toFixed(3));
  image.style.setProperty('--layer-crop-x', Number(layer.cropX || 1).toFixed(3));
  image.style.setProperty('--layer-crop-y', Number(layer.cropY || 1).toFixed(3));
}

function renderMirrorLayerList() {
  const list = $('#mirrorLayerList');
  if (!list) return;
  const selected = state.mirror.selected || 'mirrorImg';
  list.innerHTML = mirrorLayerEntries().map(entry =>
    `<button type="button" class="mirror-layer-row${entry.id === selected ? ' is-active' : ''}" data-layer-target="${esc(entry.id)}" role="option" aria-selected="${entry.id === selected}">${esc(entry.label)}${entry.locked ? '<span>LOCKED</span>' : ''}</button>`
  ).join('');
  $$('[data-layer-target]', list).forEach(button => button.addEventListener('click', () => {
    const entry = mirrorLayerEntries().find(item => item.id === button.dataset.layerTarget);
    setMirrorSelection(button.dataset.layerTarget, entry?.mode);
  }));
}
function mirrorCompositionSnapshot() {
  return JSON.stringify({
    layout: state.mirror.layout || {},
    layers: state.mirror.layers || [],
    selected: state.mirror.selected || 'mirrorImg',
    mode: state.mirror.mode || 'image'
  });
}
function recordMirrorHistory() {
  const snapshot = mirrorCompositionSnapshot();
  if (mirrorHistory.past.at(-1) === snapshot) return;
  mirrorHistory.past.push(snapshot);
  if (mirrorHistory.past.length > 40) mirrorHistory.past.shift();
  mirrorHistory.future = [];
  updateMirrorHistoryButtons();
}
function applyMirrorDragPosition(id, position = {}) {
  const target = id.startsWith('mirror-layer-') ? $(`.mirror-overlay-image[data-layer-id="${id}"]`) : $('#' + id);
  if (!target) return;
  const x = Number(position.x || 0), y = Number(position.y || 0);
  target.dataset.dragX = String(x);
  target.dataset.dragY = String(y);
  target.style.setProperty('--drag-x', `${x}px`);
  target.style.setProperty('--drag-y', `${y}px`);
}
function restoreMirrorComposition(snapshot) {
  const saved = JSON.parse(snapshot);
  state.mirror.layout = saved.layout || {};
  clearMirrorLayers(false);
  state.mirror.layers = (saved.layers || []).map(layer => ({ ...layer }));
  state.mirror.layers.forEach(layer => addMirrorLayer(layer.src, layer));
  ['mirrorImg', 'mirrorPreviewHeadline', 'mirrorPreviewBody'].forEach(id => applyMirrorDragPosition(id, state.mirror.layout[id]));
  setMirrorMode(saved.mode || 'image');
  setMirrorSelection(saved.selected || 'mirrorImg');
  updateMirrorHistoryButtons();
}
function undoMirrorComposition() {
  if (mirrorHistory.past.length < 2) return;
  const current = mirrorHistory.past.pop();
  mirrorHistory.future.push(current);
  restoreMirrorComposition(mirrorHistory.past.at(-1));
}
function redoMirrorComposition() {
  const snapshot = mirrorHistory.future.pop();
  if (!snapshot) return;
  mirrorHistory.past.push(snapshot);
  restoreMirrorComposition(snapshot);
}
function updateMirrorHistoryButtons() {
  const undo = $('#mirrorUndo'), redo = $('#mirrorRedo');
  if (undo) undo.disabled = mirrorHistory.past.length < 2;
  if (redo) redo.disabled = !mirrorHistory.future.length;
}
function selectedMirrorLayer() {
  return (state.mirror.layers || []).find(layer => layer.id === state.mirror.selected);
}
function duplicateSelectedMirrorLayer() {
  const layer = selectedMirrorLayer();
  if (!layer) return;
  const copy = { ...layer, id: `mirror-layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x: Number(layer.x || 0) + 18, y: Number(layer.y || 0) + 18 };
  state.mirror.layers.push(copy);
  addMirrorLayer(copy.src, copy);
  recordMirrorHistory();
}
function deleteSelectedMirrorLayer() {
  const layer = selectedMirrorLayer();
  if (!layer) return;
  $(`.mirror-overlay-image[data-layer-id="${layer.id}"]`)?.remove();
  state.mirror.layers = state.mirror.layers.filter(item => item.id !== layer.id);
  setMirrorSelection('mirrorImg', 'image');
  recordMirrorHistory();
}
function resetSelectedMirrorLayer() {
  const id = state.mirror.selected || 'mirrorImg';
  if (id.startsWith('mirror-layer-')) {
    const layer = selectedMirrorLayer();
    if (layer) Object.assign(layer, { x: 0, y: 0 });
  } else {
    state.mirror.layout = state.mirror.layout || {};
    state.mirror.layout[id] = { x: 0, y: 0 };
  }
  applyMirrorDragPosition(id, { x: 0, y: 0 });
  setMirrorSelection(id);
  recordMirrorHistory();
}

/* Deliberate start/end states interpolated by scroll progress:
   start = user control state; end = inverted luminance + serif shift.
   We blend background lightness and typeface weight only — controlled,
   never random. */
function applyMirrorScroll(p) {
  const m = state.mirror;
  // Keep the background selected by the user; scrolling must not introduce a new colour.
  const scale = (m.headlineScale / 100) * lerp(0.94, 1.06, p);
  $('#mirrorPreview').style.setProperty('--mp-headlineScale', scale.toFixed(3));
}
function invertColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = 255 - (n >> 16 & 255), g = 255 - (n >> 8 & 255), b = 255 - (n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function blendColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16 & 255, pb >> 16 & 255, t));
  const g = Math.round(lerp(pa >> 8 & 255, pb >> 8 & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}
function resetMirror() {
  recordMirrorHistory();
  state.mirror = Object.assign({}, MIRROR_DEFAULTS, { layers: MIRROR_DEFAULTS.layers.map(layer => ({ ...layer })) });
  $$('.mirror-controls .mcontrol').forEach(box => {
    const c = CFG.mirror.controls.find(control => control.key === box.dataset.controlKey);
    if (!c) return;
    if (c.type === 'range') {
      const input = box.querySelector('input');
      input.value = c.default;
      box.querySelector('.mc-val').textContent = c.default;
    } else if (c.type === 'color') {
      box.querySelector('input').value = c.default;
      box.querySelector('.mc-val').textContent = c.default;
    } else if (c.type === 'segment') {
      $$('button', box).forEach(b => b.classList.toggle('is-active', b.dataset.val === c.default));
    }
  });
  $('#mirrorPreviewHeadline').textContent = MIRROR_DEFAULTS.headline;
  $('#mirrorPreviewBody').textContent = MIRROR_DEFAULTS.body;
  $('#mirrorImg').src = MIRROR_DEFAULTS.imageSrc;
  const mirrorUpload = $('#mirrorUpload');
  if (mirrorUpload) mirrorUpload.value = '';
  const resetLayers = state.mirror.layers.map(layer => ({ ...layer }));
  clearMirrorLayers(false);
  state.mirror.layers = resetLayers;
  state.mirror.layers.forEach(layer => addMirrorLayer(layer.src, layer));
  ['mirrorImg', 'mirrorPreviewHeadline', 'mirrorPreviewBody'].forEach(id => {
    const target = $('#' + id);
    target.dataset.dragX = '0';
    target.dataset.dragY = '0';
    target.style.removeProperty('--drag-x');
    target.style.removeProperty('--drag-y');
  });
  applyMirror();
  setMirrorMode('image');
  setMirrorSelection('mirrorImg', 'image');
  recordMirrorHistory();
}

/* ============================================================
   6. SCROLLING GALLERY — supplied campaign sequence
   ============================================================ */
const GALLERY_SEQUENCE = [
  '204047', '204050', '204055', '204058', '204100', '204111', '204120',
  '204129', '204143', '204147', '204153', '204203', '204210', '204217',
  'campaign-15', 'campaign-16', 'campaign-17', 'campaign-18', 'campaign-19', 'campaign-20',
  'campaign-21', 'campaign-22', 'campaign-23', 'campaign-24', 'campaign-25',
  'campaign-26', 'campaign-27', 'campaign-28', 'campaign-29', 'campaign-30',
  'campaign-31', 'campaign-32', 'campaign-33', 'campaign-34', 'campaign-35',
  'campaign-36'
];
const GALLERY_COLLAGE_POSITIONS = [
  { x: -2, y: 0, w: 14, speed: .12, amp: 7 }, { x: 13, y: 1, w: 14, speed: .22, amp: 8 },
  { x: 27, y: -1, w: 15, speed: .16, amp: 7 }, { x: 42, y: 1, w: 14, speed: .28, amp: 8 },
  { x: 56, y: 0, w: 15, speed: .18, amp: 8 }, { x: 71, y: 1, w: 14, speed: .25, amp: 7 },
  { x: 85, y: 0, w: 15, speed: .20, amp: 8 }, { x: -1, y: 19, w: 15, speed: .14, amp: 7 },
  { x: 13, y: 20, w: 14, speed: .24, amp: 8 }, { x: 27, y: 18, w: 15, speed: .17, amp: 7 },
  { x: 42, y: 20, w: 14, speed: .29, amp: 8 }, { x: 56, y: 19, w: 15, speed: .18, amp: 7 },
  { x: 71, y: 20, w: 14, speed: .22, amp: 8 }, { x: 85, y: 18, w: 15, speed: .15, amp: 7 },
  { x: -2, y: 38, w: 14, speed: .12, amp: 8 }, { x: 13, y: 39, w: 15, speed: .22, amp: 7 },
  { x: 27, y: 37, w: 14, speed: .16, amp: 8 }, { x: 42, y: 39, w: 15, speed: .28, amp: 7 },
  { x: 56, y: 38, w: 14, speed: .18, amp: 8 }, { x: 71, y: 39, w: 15, speed: .25, amp: 7 },
  { x: 85, y: 37, w: 14, speed: .20, amp: 8 }, { x: -1, y: 57, w: 15, speed: .14, amp: 7 },
  { x: 13, y: 58, w: 14, speed: .24, amp: 8 }, { x: 27, y: 56, w: 15, speed: .17, amp: 7 },
  { x: 42, y: 58, w: 14, speed: .29, amp: 8 }, { x: 56, y: 57, w: 15, speed: .18, amp: 7 },
  { x: 71, y: 58, w: 14, speed: .22, amp: 8 }, { x: 85, y: 56, w: 15, speed: .15, amp: 7 },
  { x: -2, y: 76, w: 14, speed: .12, amp: 8 }, { x: 13, y: 77, w: 15, speed: .22, amp: 7 },
  { x: 27, y: 75, w: 14, speed: .16, amp: 8 }, { x: 42, y: 77, w: 15, speed: .28, amp: 7 },
  { x: 56, y: 76, w: 14, speed: .18, amp: 8 }, { x: 71, y: 77, w: 15, speed: .25, amp: 7 },
  { x: 85, y: 75, w: 14, speed: .20, amp: 8 }, { x: -1, y: 84, w: 13, speed: .26, amp: 7 }
];
function initGallery() {
  const inner = $('#galleryInner');
  const section = $('#gallery');
  const cards = GALLERY_SEQUENCE.map((id, i) => {
    const position = GALLERY_COLLAGE_POSITIONS[i];
    const imageSrc = imageForSlot(`gallery.${i}`, `assets/gallery-3/${id}.png`);
    if (!imageSrc) return null;
    const el = document.createElement('figure');
    el.className = 'gallery-photo';
    el.style.left = position.x + '%';
    el.style.top = position.y + '%';
    el.style.width = position.w + '%';
    el.dataset.speed = position.speed;
    el.dataset.amp = position.amp;
    el.dataset.phase = (i * 1.45).toFixed(2);
    el.innerHTML = `<img src="${imageSrc}" alt="Advertising reference ${i + 1}">`;
    inner.appendChild(el);
    return el;
  }).filter(Boolean);

  // A hidden desktop-only duplicate lets the phone strip loop endlessly, just
  // like the moving headline, without ever exposing an empty end state.
  cards.forEach(card => {
    const clone = card.cloneNode(true);
    clone.classList.add('is-mobile-duplicate');
    clone.removeAttribute('tabindex');
    clone.setAttribute('aria-hidden', 'true');
    inner.appendChild(clone);
  });

  // Hover reveals one campaign without removing the surrounding collage. The
  // same state is available to keyboard users through focus.
  cards.forEach(card => {
    const reveal = () => {
      cards.forEach(other => other.classList.toggle('is-dimmed', other !== card));
      card.classList.add('is-hovered');
    };
    const clearReveal = () => {
      card.classList.remove('is-hovered');
      cards.forEach(other => other.classList.remove('is-dimmed'));
    };
    card.tabIndex = 0;
    card.addEventListener('mouseenter', reveal);
    card.addEventListener('mouseleave', clearReveal);
    card.addEventListener('focus', reveal);
    card.addEventListener('blur', clearReveal);
  });

  // Give every campaign a quiet, independent drift—like the hero collage—
  // while preserving its fixed composition and hover reveal.
  if (!REDUCED) {
    const move = now => {
      const time = now / 1000;
      cards.forEach(card => {
        const speed = Number(card.dataset.speed) || .2;
        const amplitude = Number(card.dataset.amp) || 7;
        const phase = Number(card.dataset.phase) || 0;
        card.style.setProperty('--gallery-drift-x', `${(Math.sin(time * speed + phase) * amplitude).toFixed(2)}px`);
        card.style.setProperty('--gallery-drift-y', `${(Math.cos(time * speed * 1.18 + phase) * amplitude * .55).toFixed(2)}px`);
        card.style.setProperty('--gallery-drift-r', `${(Math.sin(time * speed * .72 + phase) * .5).toFixed(2)}deg`);
      });
      requestAnimationFrame(move);
    };
    requestAnimationFrame(move);
  }
}

/* ============================================================
   FLOATING SECTION NAVIGATION
   ============================================================ */
function initSectionOrb() {
  const orb = $('#sectionOrb');
  const trigger = $('#sectionOrbCurrent');
  const label = $('.section-orb-label', trigger);
  const links = $$('#sectionOrbMenu a');
  if (!orb || !trigger) return;
  const setOpen = open => {
    orb.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
  };
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  const positionKey = 'pl_mobile_orb_position';
  let pointerStart = null;
  let justDragged = false;
  const savePosition = () => {
    try { localStorage.setItem(positionKey, JSON.stringify({ left: orb.style.left, top: orb.style.top })); } catch (e) { /* storage optional */ }
  };
  if (isMobile()) {
    try {
      const saved = JSON.parse(localStorage.getItem(positionKey));
      if (saved && saved.left && saved.top) {
        orb.style.left = saved.left;
        orb.style.top = saved.top;
        orb.classList.add('is-mobile-positioned');
      }
    } catch (e) { /* ignore invalid saved position */ }
  }
  trigger.addEventListener('pointerdown', event => {
    if (!isMobile() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = orb.getBoundingClientRect();
    pointerStart = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    trigger.setPointerCapture?.(event.pointerId);
  });
  trigger.addEventListener('pointermove', event => {
    if (!pointerStart || !isMobile()) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (!pointerStart.moved && Math.hypot(dx, dy) < 8) return;
    pointerStart.moved = true;
    event.preventDefault();
    const left = clamp(pointerStart.left + dx, 6, window.innerWidth - orb.offsetWidth - 6);
    const top = clamp(pointerStart.top + dy, 6, window.innerHeight - orb.offsetHeight - 6);
    orb.classList.add('is-mobile-positioned', 'is-dragging');
    orb.style.left = `${left}px`;
    orb.style.top = `${top}px`;
  });
  const finishDrag = () => {
    if (!pointerStart) return;
    justDragged = pointerStart.moved;
    if (pointerStart.moved) savePosition();
    pointerStart = null;
    orb.classList.remove('is-dragging');
    if (justDragged) setTimeout(() => { justDragged = false; }, 0);
  };
  trigger.addEventListener('pointerup', finishDrag);
  trigger.addEventListener('pointercancel', finishDrag);
  trigger.addEventListener('click', () => { if (!justDragged) setOpen(!orb.classList.contains('is-open')); });
  orb.addEventListener('mouseenter', () => setOpen(true));
  orb.addEventListener('mouseleave', () => setOpen(false));
  orb.addEventListener('focusin', () => setOpen(true));
  orb.addEventListener('focusout', event => { if (!orb.contains(event.relatedTarget)) setOpen(false); });
  links.forEach(link => link.addEventListener('click', () => setOpen(false)));

  const names = { top: 'HOME', lab: 'PERCEPTION', mirror: 'WHAT CHANGED', test: 'TEST YOUR BRAND', publish: 'BEFORE YOU PUBLISH' };
  const sections = Object.keys(names).map(id => document.getElementById(id)).filter(Boolean);
  const update = id => {
    label.textContent = names[id];
    links.forEach(link => link.toggleAttribute('aria-current', link.dataset.orbSection === id));
  };
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) update(visible.target.id);
  }, { rootMargin: '-26% 0px -62% 0px', threshold: [0, .1, .25] });
  sections.forEach(section => observer.observe(section));
}

/* ============================================================
   7. TEST YOUR BRAND — multi-step wizard + scoring
   ============================================================ */
function initWizard() {
  // Steps indicator
  const stepsUl = $('#wizardSteps');
  CFG.test.steps.concat(['05 — RESULT']).forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = s;
    li.dataset.stepIdx = i;
    li.setAttribute('role', 'button');
    li.tabIndex = 0;
    li.setAttribute('aria-label', `Go to ${s.replace(/^\\d+\\s*—\\s*/, '')}`);
    li.addEventListener('click', () => navigateWizard(i));
    li.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigateWizard(i);
      }
    });
    stepsUl.appendChild(li);
  });

  // Perception chips
  const chipWrap = $('#perceptionChips');
  CFG.test.perceptionOptions.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'perc-chip';
    b.textContent = p;
    b.addEventListener('click', () => {
      b.classList.toggle('is-active');
      const i = state.wizard.perceptions.indexOf(p);
      if (i > -1) state.wizard.perceptions.splice(i, 1); else state.wizard.perceptions.push(p);
      invalidateEvaluation();
    });
    chipWrap.appendChild(b);
  });

  // Reality selects
  fillSelect('#rPrice', CFG.test.priceOptions);
  fillSelect('#rMaterials', CFG.test.materialOptions);
  fillSelect('#rQuality', CFG.test.qualityOptions);
  fillSelect('#rProduction', CFG.test.productionOptions);
  fillSelect('#rAvailability', CFG.test.availabilityOptions);
  fillSelect('#rClaims', CFG.test.claimOptions);

  // Upload handling
  initUpload();

  // Navigation
  $$('#wizard [data-goto]').forEach(b => {
    b.addEventListener('click', () => navigateWizard(+b.dataset.goto));
  });
  $('#startOverBtn').addEventListener('click', resetWizard);
  $('#evaluateBtn').addEventListener('click', runEvaluation);
  $('#toPublishBtn').addEventListener('click', () => {
    document.getElementById('publish').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  });

  // Persist field inputs into state
  ['fName', 'fCategory', 'fDesc', 'fPrice', 'fQualities'].forEach(id => {
    const field = $('#' + id);
    const persist = e => {
      state.wizard[id.slice(1).toLowerCase()] = e.target.value; // fName -> name
      invalidateEvaluation();
    };
    field.addEventListener('input', persist);
    field.addEventListener('change', persist);
  });
  ['rPrice', 'rMaterials', 'rQuality', 'rProduction', 'rAvailability', 'rClaims', 'rLimitations'].forEach(id => {
    const field = $('#' + id);
    const persist = e => {
      state.wizard[id] = e.target.value;
      invalidateEvaluation();
    };
    field.addEventListener('input', persist);
    field.addEventListener('change', persist);
  });

  gotoStep(0, { scroll: false });
}

function fillSelect(sel, opts) {
  const s = $(sel);
  opts.forEach(o => {
    const op = document.createElement('option');
    op.value = o; op.textContent = o;
    s.appendChild(op);
  });
}

function selectDemoCampaign(d, i, btn) {
  $$('.demo-chip').forEach(x => x.classList.remove('is-active'));
  btn.classList.add('is-active');
  state.wizard.image = { src: demoPhoto(d.name, i + 60), name: d.name, demoId: d.id };
  showUploadPreview(state.wizard.image.src, d.name + ' (demonstration)');
  clearUploadError();
  invalidateEvaluation();
}

/* --- upload: drag-drop + file select, validation, preview --- */
function initUpload() {
  const area = $('#uploadArea');
  const input = $('#fileInput');
  area.addEventListener('click', () => input.click());
  area.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  $('#replaceImageBtn').addEventListener('click', e => { e.stopPropagation(); input.click(); });
  $('#removeImageBtn').addEventListener('click', e => { e.stopPropagation(); clearImage(); });

  ['dragenter', 'dragover'].forEach(ev => area.addEventListener(ev, e => { e.preventDefault(); area.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach(ev => area.addEventListener(ev, e => { e.preventDefault(); area.classList.remove('is-drag'); }));
  area.addEventListener('drop', e => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });
}
function handleFile(f) {
  clearUploadError();
  const okTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!okTypes.includes(f.type)) return showUploadError('Unsupported file type. Use PNG, JPEG or WebP.');
  if (f.size > 5 * 1024 * 1024) return showUploadError('File too large. Maximum size is 5 MB.');
  const reader = new FileReader();
  reader.onload = () => {
    state.wizard.image = { src: reader.result, name: f.name };
    $$('.demo-chip').forEach(x => x.classList.remove('is-active'));
    showUploadPreview(reader.result, f.name);
    invalidateEvaluation();
  };
  reader.onerror = () => showUploadError('Could not read that file. Please try another image.');
  reader.readAsDataURL(f);
}
function showUploadPreview(src, name) {
  $('#uploadEmpty').hidden = true;
  const prev = $('#uploadPreview');
  prev.hidden = false;
  $('#uploadPreviewImg').src = src;
  $('#uploadFilename').textContent = name;
}
function clearImage() {
  state.wizard.image = null;
  $('#fileInput').value = '';
  $('#uploadPreview').hidden = true;
  $('#uploadEmpty').hidden = false;
  $$('.demo-chip').forEach(x => x.classList.remove('is-active'));
  invalidateEvaluation();
}
function showUploadError(msg) { const e = $('#uploadError'); e.textContent = msg; e.hidden = false; }
function clearUploadError() { $('#uploadError').hidden = true; }

function invalidateEvaluation() {
  state.evaluation = null;
}

function navigateWizard(n) {
  const target = clamp(Number(n) || 0, 0, 4);
  // The Result tab is always usable. If the source data has changed or no
  // comparison exists yet, calculate a fresh, explicitly provisional result.
  if (target === 4 && !state.evaluation) {
    runEvaluation();
    return;
  }
  gotoStep(target);
}

function hydrateWizard() {
  const w = state.wizard;
  const textFields = { fName: w.name, fCategory: w.category, fDesc: w.desc, fPrice: w.price, fQualities: w.qualities };
  Object.entries(textFields).forEach(([id, value]) => { $('#' + id).value = value || ''; });
  ['rPrice', 'rMaterials', 'rQuality', 'rProduction', 'rAvailability', 'rClaims', 'rLimitations'].forEach(id => {
    $('#' + id).value = w[id] || '';
  });
  $$('.perc-chip').forEach(chip => chip.classList.toggle('is-active', w.perceptions.includes(chip.textContent)));
  if (w.image) showUploadPreview(w.image.src, w.image.demoId ? `${w.image.name} (demonstration)` : w.image.name);
  else {
    $('#uploadPreview').hidden = true;
    $('#uploadEmpty').hidden = false;
  }
}

function gotoStep(n, { scroll = true } = {}) {
  n = clamp(Number(n) || 0, 0, 4);
  hydrateWizard();
  state.wizard.step = n;
  $$('.wizard-step').forEach(fs => { fs.hidden = +fs.dataset.step !== Math.min(n, 3); });
  $('#stepE').hidden = n !== 4;
  $$('#wizardSteps li').forEach((li, i) => {
    li.classList.toggle('is-current', i === n);
    li.classList.toggle('is-done', i < n);
    li.setAttribute('aria-current', i === n ? 'step' : 'false');
  });
  if (n === 3) buildCompare();
  if (n === 4) renderEvaluation();
  if (scroll) {
    const target = n === 4 ? $('#stepE') : $('#wizard');
    requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: REDUCED ? 'auto' : 'smooth',
        block: n === 4 ? 'start' : 'nearest'
      });
    });
  }
}

function buildCompare() {
  const w = state.wizard;
  const chips = $('#cmpIntended');
  chips.innerHTML = w.perceptions.length
    ? w.perceptions.map(p => `<span class="chip">${esc(p)}</span>`).join('')
    : '<span class="fine-print">No intended perceptions selected.</span>';
  const imgWrap = $('#cmpImageWrap');
  if (w.image) { imgWrap.hidden = false; $('#cmpImage').src = w.image.src; }
  else imgWrap.hidden = true;

  const rows = [
    ['NAME', w.name || '—'], ['CATEGORY', w.category || '—'],
    ['DESCRIPTION', w.desc || '—'], ['PRICE', w.price ? (CFG.decide.currency + ' ' + fmt(w.price)) : '—'],
    ['QUALITIES', w.qualities || '—'],
    ['PRICE POSITION', w.rPrice || 'not provided'], ['MATERIALS', w.rMaterials || 'not provided'],
    ['QUALITY', w.rQuality || 'not provided'], ['PRODUCTION', w.rProduction || 'not provided'],
    ['AVAILABILITY', w.rAvailability || 'not provided'], ['CLAIMS', w.rClaims || 'not provided'],
    ['LIMITATIONS', w.rLimitations || 'none stated']
  ];
  $('#cmpReality').innerHTML = rows.map(r => `<li><span>${esc(r[0])}</span><span>${esc(r[1])}</span></li>`).join('');
}

/* ============================================================
   EVALUATION LOGIC — documented, deterministic scoring model
   ------------------------------------------------------------
   Five dimensions, each 0–100, combined with configurable
   weights from content.json. Every input maps to a defined
   score contribution. Missing evidence raises an UNCERTAINTY
   flag — never an automatic accusation. A high-end aesthetic
   alone never penalises a campaign.
   ============================================================ */
function runEvaluation() {
  const w = state.wizard;
  const hasUserData = Boolean(
    w.image || w.name.trim() || w.category.trim() || w.desc.trim() || w.price || w.qualities.trim() ||
    w.perceptions.length || w.rPrice || w.rMaterials || w.rQuality || w.rProduction || w.rAvailability || w.rClaims || w.rLimitations.trim()
  );
  if (!hasUserData) {
    state.evaluation = { empty: true };
    gotoStep(4);
    return;
  }
  const W = CFG.evaluation.weights;
  const dims = { claimSupport: 0, priceConsistency: 0, featureConsistency: 0, impliedBenefits: 0, transparency: 0 };
  const notes = [];
  let insufficient = false;

  /* --- 1. CLAIM SUPPORT (0–100) ---
     Compares declared product claims against stated limitations
     and selected quality indicators. */
  let cs = 70; // neutral baseline: making claims is normal
  if (w.rClaims && w.rClaims !== 'NONE STATED') {
    const strong = ['PERFORMANCE TESTED', 'DERMATOLOGIST APPROVED', 'SUSTAINABLY SOURCED', 'LIFETIME WARRANTY'];
    if (strong.includes(w.rClaims)) {
      if (w.rQuality === 'CERTIFIED' || w.rQuality === 'AWARD-WINNING') { cs = 92; notes.push({ t: 'ok', m: `Claim "${w.rClaims}" is backed by a stated quality indicator.` }); }
      else { cs = 55; notes.push({ t: 'warn', m: `Claim "${w.rClaims}" has no stated supporting evidence — labelled unverified, not false.` }); }
    }
  } else { cs = 80; notes.push({ t: 'ok', m: 'No strong claims stated — little claim-support risk.' }); }
  if (w.rLimitations && w.rLimitations.trim()) { cs = Math.min(100, cs + 5); notes.push({ t: 'ok', m: 'Stated limitations improve transparency.' }); }
  dims.claimSupport = cs;

  /* --- 2. PRICE & VALUE CONSISTENCY (0–100) ---
     Compares intended perception tier against reported price
     position. A gap is a flag, not proof of unfair advantage. */
  let pc = 75;
  const luxuryIntent = w.perceptions.some(p => ['LUXURY', 'EXCLUSIVE', 'PREMIUM'].includes(p));
  const affordableReality = w.rPrice === 'ACCESSIBLE / LOW';
  const luxuryReality = w.rPrice === 'LUXURY' || w.rPrice === 'PREMIUM';
  if (luxuryIntent && affordableReality) {
    pc = 30;
    notes.push({ t: 'warn', m: 'Luxury/exclusive signalling with an accessible price position — presentation may outrun the offering.' });
  } else if (!luxuryIntent && luxuryReality) {
    pc = 60;
    notes.push({ t: 'warn', m: 'Premium price with modest signalling — a missed positioning opportunity, not a deception risk.' });
  } else if (luxuryIntent && luxuryReality) { pc = 90; notes.push({ t: 'ok', m: 'Price position and intended perception are aligned.' }); }
  if (!w.rPrice) { pc = 50; insufficient = true; notes.push({ t: 'warn', m: 'Price position not provided — treated as missing evidence (uncertainty), not as a violation.' }); }
  dims.priceConsistency = pc;

  /* --- 3. FEATURE & QUALITY CONSISTENCY (0–100) --- */
  let fc = 70;
  if (w.rQuality === 'STANDARD' && (w.perceptions.includes('HIGH QUALITY') || w.perceptions.includes('PREMIUM'))) {
    fc = 40;
    notes.push({ t: 'warn', m: '"High quality / premium" signalling with standard-grade indicators — verify before publishing.' });
  } else if (['CERTIFIED', 'AWARD-WINNING', 'HANDCRAFTED'].includes(w.rQuality)) {
    fc = 90; notes.push({ t: 'ok', m: 'Quality indicators support the communicated positioning.' });
  }
  if (!w.rQuality) { fc = 50; insufficient = true; notes.push({ t: 'warn', m: 'Quality indicators not provided — uncertainty flagged.' }); }
  dims.featureConsistency = fc;

  /* --- 4. IMPLIED BENEFITS (0–100) ---
     Checks whether imagery-level implications (perceptions) are
     backed by stated qualities. */
  let ib = 75;
  const hasSupport = w.qualities && w.qualities.trim().length > 2;
  if (w.perceptions.length > 3 && !hasSupport) {
    ib = 45;
    notes.push({ t: 'warn', m: 'Many implied qualities but no stated supporting features — implied benefits may exceed evidence.' });
  } else if (hasSupport) { ib = 88; notes.push({ t: 'ok', m: 'Stated qualities provide grounding for implied benefits.' }); }
  if (!w.perceptions.length) { ib = 50; insufficient = true; }
  dims.impliedBenefits = ib;

  /* --- 5. TRANSPARENCY & MISSING INFO (0–100) ---
     Rewards completeness; penalises silence, not aesthetics. */
  let tr = 0;
  const fields = [w.rPrice, w.rMaterials, w.rQuality, w.rProduction, w.rAvailability, w.rClaims];
  const answered = fields.filter(Boolean).length;
  tr = Math.round((answered / fields.length) * 100);
  if (answered <= 2) { insufficient = true; notes.push({ t: 'warn', m: 'Very little product-reality information supplied — result is provisional.' }); }
  if (w.rLimitations && w.rLimitations.trim()) tr = Math.min(100, tr + 8);
  dims.transparency = tr;

  /* --- Weighted composite --- */
  const score = Math.round(
    dims.claimSupport * W.claimSupport +
    dims.priceConsistency * W.priceConsistency +
    dims.featureConsistency * W.featureConsistency +
    dims.impliedBenefits * W.impliedBenefits +
    dims.transparency * W.transparency
  );

  const th = CFG.evaluation.thresholds;
  let band;
  if (insufficient && answered <= 2) band = 'insufficient';
  else if (score < th.low) band = 'low';
  else if (score < th.moderate) band = 'moderate';
  else band = 'high';

  state.evaluation = { dims, score, band, notes, insufficient: insufficient && answered <= 2 };
  gotoStep(4);
}

function renderEvaluation() {
  const ev = state.evaluation;
  if (!ev) return;
  if (ev.empty) {
    const circ = 2 * Math.PI * 52;
    $('#gaugeValue').textContent = '—';
    $('#gaugeFill').style.strokeDashoffset = circ;
    $('#gaugeFill').style.stroke = 'rgba(5,5,5,.18)';
    $('#resultLabel').textContent = 'NO DATA ENTERED';
    $('#dimensionBars').innerHTML = '';
    $('#resultNotes').innerHTML = '<p class="result-note">Add your campaign details, intended perception, and product reality to generate an evaluation.</p>';
    $('#resultRecs').innerHTML = '';
    return;
  }
  // Gauge: score represents GAP RISK — invert so high score = high gap? No:
  // we present "alignment score" where higher = safer. Keep transparent:
  // gauge shows GAP RISK % = 100 - alignment contributions of risk dims.
  // Simpler & honest: display the composite as "GAP RISK INDEX".
  const gapRisk = 100 - ev.score;
  $('#gaugeValue').textContent = gapRisk;
  const circ = 2 * Math.PI * 52;
  $('#gaugeFill').style.strokeDashoffset = (circ * (1 - gapRisk / 100)).toFixed(1);
  $('#gaugeFill').style.stroke = gapRisk < 35 ? '#1a7f37' : gapRisk < 65 ? '#050505' : '#b00020';

  const labels = CFG.evaluation.labels;
  $('#resultLabel').textContent = ev.band === 'low' ? labels.low
    : ev.band === 'moderate' ? labels.moderate
    : ev.band === 'high' ? labels.high : labels.insufficient;

  // Dimension bars (alignment view: higher = better aligned)
  const names = {
    claimSupport: 'CLAIM SUPPORT', priceConsistency: 'PRICE & VALUE CONSISTENCY',
    featureConsistency: 'FEATURE & QUALITY CONSISTENCY', impliedBenefits: 'IMPLIED BENEFITS',
    transparency: 'TRANSPARENCY & MISSING INFO'
  };
  $('#dimensionBars').innerHTML = Object.entries(ev.dims).map(([k, v]) =>
    `<div class="dim-bar">
       <div class="dim-bar-head"><span>${names[k]}</span><span>${v}/100</span></div>
       <div class="dim-bar-track"><div class="dim-bar-fill" data-w="${v}"></div></div>
     </div>`).join('');
  requestAnimationFrame(() => {
    $$('#dimensionBars .dim-bar-fill').forEach(f => { f.style.width = f.dataset.w + '%'; });
  });

  $('#resultNotes').innerHTML = ev.notes.map(n => `<p class="result-note ${n.t}">${esc(n.m)}</p>`).join('');

  // Recommendations — deterministic mapping from weakest dims
  const recs = [];
  const sorted = Object.entries(ev.dims).sort((a, b) => a[1] - b[1]);
  const R = CFG.evaluation.recommendations;
  if (sorted[0][0] === 'priceConsistency') recs.push(R[3], R[0]);
  if (sorted[0][0] === 'claimSupport') recs.push(R[1], R[0]);
  if (sorted[0][0] === 'featureConsistency') recs.push(R[1], R[2]);
  if (sorted[0][0] === 'impliedBenefits') recs.push(R[2], R[4]);
  if (sorted[0][0] === 'transparency') recs.push(R[5], R[1]);
  // dedupe, keep order, cap at 4
  const seen = new Set();
  $('#resultRecs').innerHTML = recs.filter(r => !seen.has(r) && seen.add(r)).slice(0, 4)
    .map(r => `<li>${esc(r)}</li>`).join('');
}

function resetWizard() {
  state.wizard = {
    step: 0, image: null, name: '', category: '', desc: '', price: '', qualities: '',
    perceptions: [], rPrice: '', rMaterials: '', rQuality: '', rProduction: '', rAvailability: '', rClaims: '', rLimitations: ''
  };
  state.evaluation = null;
  ['fName', 'fCategory', 'fDesc', 'fPrice', 'fQualities'].forEach(id => { $('#' + id).value = ''; });
  ['rPrice', 'rMaterials', 'rQuality', 'rProduction', 'rAvailability', 'rClaims', 'rLimitations'].forEach(id => { $('#' + id).value = ''; });
  $$('.perc-chip').forEach(c => c.classList.remove('is-active'));
  clearImage();
  gotoStep(0);
}

/* ============================================================
   8. BEFORE YOU PUBLISH — checklist with live assessment
   ============================================================ */
function initPublish() {
  const wrap = $('#checklist');
  CFG.publish.questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'check-item';
    item.dataset.questionIndex = i;
    item.hidden = i !== 0;
    item.innerHTML =
      `<div class="check-q">
         <span class="check-num">Q${i + 1}</span>
         <p class="check-text">${esc(q)}</p>
         <div class="check-opts" role="group" aria-label="Answer for question ${i + 1}">
           ${CFG.publish.options.map(o =>
             `<button type="button" class="check-opt is-${o.toLowerCase()}" data-q="${i}" data-v="${o}">${o}</button>`).join('')}
         </div>
       </div>`;
    wrap.appendChild(item);
  });
  wrap.addEventListener('click', e => {
    const b = e.target.closest('.check-opt');
    if (!b) return;
    const q = +b.dataset.q;
    state.checklist[q] = b.dataset.v;
    $$(`.check-opt[data-q="${q}"]`).forEach(x => x.classList.toggle('is-active', x === b));
    const next = $(`.check-item[data-question-index="${q + 1}"]`, wrap);
    if (next && next.hidden) {
      next.hidden = false;
      requestAnimationFrame(() => next.classList.add('is-revealed'));
    }
    updatePublishPanel();
  });

  $('#reviewAnswersBtn').addEventListener('click', () => {
    document.getElementById('checklist').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  });
  $('#resetChecklistBtn').addEventListener('click', () => {
    state.checklist = {};
    $$('.check-opt').forEach(x => x.classList.remove('is-active'));
    $$('.check-item', wrap).forEach((item, index) => {
      item.hidden = index !== 0;
      item.classList.remove('is-revealed');
    });
    updatePublishPanel();
  });
  $('#backToTestBtn').addEventListener('click', () => {
    document.getElementById('test').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  });
  $('#summaryBtn').addEventListener('click', event => {
    event.preventDefault();
    generateSummary();
  });
  $('#copySummaryBtn').addEventListener('click', copySummary);
  updatePublishPanel();
}

function updatePublishPanel() {
  const answers = Object.values(state.checklist);
  const total = CFG.publish.questions.length;
  const panel = $('#publishPanel');
  const verdict = $('#publishVerdict');
  const summary = $('#publishSummary');
  const warnings = $('#publishWarnings');

  panel.classList.remove('state-low', 'state-moderate', 'state-high');

  if (!answers.length) {
    verdict.textContent = 'AWAITING ANSWERS';
    summary.textContent = 'Answer the checklist questions to receive a preliminary assessment.';
    warnings.innerHTML = '';
    return;
  }
  const yes = answers.filter(a => a === 'YES').length;
  const unsure = answers.filter(a => a === 'UNSURE').length;
  const unanswered = total - answers.length;

  let stateName, text;
  if (yes >= 2) {
    stateName = 'state-high';
    verdict.textContent = 'HIGH CONCERN — REFRAME BEFORE PUBLISHING';
    text = 'Multiple answers indicate the communication may promise more than the product delivers. Identify which variables carry the exaggeration and test a restrained alternative.';
  } else if (yes === 1 || unsure >= 2) {
    stateName = 'state-moderate';
    verdict.textContent = 'MODERATE PERCEPTION GAP';
    text = 'Some signals may outrun the evidence. Identify which variables carry the exaggeration and test a restrained alternative.';
  } else {
    stateName = 'state-low';
    verdict.textContent = 'LOW APPARENT PERCEPTION GAP';
    text = 'Presentation and product appear broadly aligned. Keep claims specific, evidenced and easy to verify.';
  }
  panel.classList.add(stateName);

  const warn = [];
  if (yes > 0) warn.push(`${yes} question(s) answered YES — review those claims against product evidence.`);
  if (unsure > 0) warn.push(`${unsure} question(s) answered UNSURE — gather evidence or simplify the claim.`);
  if (unanswered > 0) warn.push(`${unanswered} question(s) unanswered — the assessment is provisional.`);
  if (state.evaluation && state.evaluation.band === 'high') warn.push('Campaign evaluation also flagged a high potential perception gap.');
  warnings.innerHTML = warn.map(w => `<li>${esc(w)}</li>`).join('');
  summary.textContent = text + (unanswered ? ' Unanswered questions are listed below.' : '');
}

function generateSummary() {
  const w = state.wizard;
  const ev = state.evaluation;
  const lines = [];
  lines.push('PERCEPTION LAB — SESSION SUMMARY');
  lines.push('================================');
  lines.push(`Product:        ${w.name || '—'}`);
  lines.push(`Category:       ${w.category || '—'}`);
  lines.push(`Description:    ${w.desc || '—'}`);
  lines.push(`Price:          ${w.price ? CFG.decide.currency + ' ' + fmt(w.price) : '—'}`);
  lines.push(`Qualities:      ${w.qualities || '—'}`);
  lines.push('');
  lines.push(`Intended perceptions: ${w.perceptions.join(', ') || '—'}`);
  lines.push(`Reality — price position: ${w.rPrice || 'not provided'}`);
  lines.push(`Reality — materials:      ${w.rMaterials || 'not provided'}`);
  lines.push(`Reality — quality:        ${w.rQuality || 'not provided'}`);
  lines.push(`Reality — production:     ${w.rProduction || 'not provided'}`);
  lines.push(`Reality — availability:   ${w.rAvailability || 'not provided'}`);
  lines.push(`Reality — claims:         ${w.rClaims || 'not provided'}`);
  lines.push(`Reality — limitations:    ${w.rLimitations || 'none stated'}`);
  lines.push('');
  if (ev) {
    const labels = CFG.evaluation.labels;
    lines.push(`Evaluation: ${ev.band === 'low' ? labels.low : ev.band === 'moderate' ? labels.moderate : ev.band === 'high' ? labels.high : labels.insufficient} (gap-risk index ${100 - ev.score}/100)`);
  }
  const cl = Object.entries(state.checklist);
  lines.push('');
  lines.push('PUBLISH CHECKLIST:');
  cl.forEach(([q, a]) => lines.push(`  Q${+q + 1}. ${a}`));
  const yes = cl.filter(([, a]) => a === 'YES').length;
  const unsure = cl.filter(([, a]) => a === 'UNSURE').length;
  lines.push('');
  lines.push(yes >= 2 ? 'Checklist verdict: HIGH CONCERN — reframe before publishing.'
    : (yes === 1 || unsure >= 2) ? 'Checklist verdict: MODERATE PERCEPTION GAP.'
    : 'Checklist verdict: LOW APPARENT PERCEPTION GAP.');
  lines.push('');
  lines.push('Note: Results are illustrative self-assessments, not legal determinations or verified consumer studies.');
  $('#summaryText').textContent = lines.join('\n');
  $('#summaryBox').hidden = false;
  $('#summaryBox').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
}
function copySummary() {
  const txt = $('#summaryText').textContent;
  const done = () => { $('#copySummaryBtn').textContent = 'COPIED'; setTimeout(() => { $('#copySummaryBtn').textContent = 'COPY SUMMARY'; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  } else fallbackCopy(txt, done);
}
function fallbackCopy(txt, done) {
  const ta = document.createElement('textarea');
  ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { /* noop */ }
  document.body.removeChild(ta);
}

/* ============================================================
   9. FINAL STATEMENT — staged reveal (reversible)
   ============================================================ */
function initFinal() {
  const tileGrid = $('#finalTiles');
  if (tileGrid && !tileGrid.children.length) {
    const columns = 15;
    const rows = 8;
    const tiles = [];
    for (let i = 0; i < columns * rows; i += 1) {
      const tile = document.createElement('span');
      tile.className = 'final-tile';
      tileGrid.appendChild(tile);
      tiles.push(tile);
    }
    tileGrid.addEventListener('pointermove', event => {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      const target = event.target.closest('.final-tile');
      if (!target) return;
      const index = tiles.indexOf(target);
      tiles.forEach((tile, i) => {
        const distance = Math.abs((i % columns) - (index % columns)) + Math.abs(Math.floor(i / columns) - Math.floor(index / columns));
        tile.classList.toggle('is-near', distance === 1);
        tile.classList.toggle('is-hot', i === index);
      });
    });
    tileGrid.addEventListener('pointerleave', () => tiles.forEach(tile => tile.classList.remove('is-near', 'is-hot')));
  }
  const lines = $$('.final-line');
  if (REDUCED) { lines.forEach(l => l.classList.add('is-in')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        lines.forEach((l, i) => setTimeout(() => l.classList.add('is-in'), i * 260));
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.45 });
  io.observe($('#finalHeadline'));
}

/* ---------- generic section reveal ---------- */
function initReveals() {
  // Keep this reserved for the page's significant messages and content
  // blocks. Controls, labels and buttons deliberately remain immediate so
  // scrolling never makes the interface feel delayed or unstable.
  const targets = $$('.lab-headline, .lab-desc, .decide-headline, .decide-desc, .mirror-headline, .mirror-desc, .test-headline, .publish-headline, .lab-grid, .decide-stage, .mirror-grid, .wizard, .checklist, .publish-panel');
  targets.forEach(t => t.classList.add('reveal'));
  let lastScrollY = window.scrollY;
  let scrollDirection = 'down';
  window.addEventListener('scroll', () => {
    const delta = window.scrollY - lastScrollY;
    if (Math.abs(delta) > 4) {
      scrollDirection = delta > 0 ? 'down' : 'up';
      lastScrollY = window.scrollY;
    }
  }, { passive: true });

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const target = en.target;
      if (!en.isIntersecting) {
        // Reset only after a block has genuinely left the viewport. This
        // avoids flickering from small wheel or touch movements at the edge.
        target.classList.remove('is-in');
        return;
      }

      const enterFromBelow = scrollDirection === 'down';
      target.classList.toggle('reveal-from-below', enterFromBelow);
      target.classList.remove('reveal-from-down');
      // Establish the correct off-screen direction before starting the
      // transition, then reveal on the next rendered frame.
      requestAnimationFrame(() => target.classList.add('is-in'));
    });
  }, { rootMargin: '-7% 0px -7% 0px', threshold: 0.1 });
  targets.forEach(t => io.observe(t));

  // Large headings rise word by word; smaller content retains the calmer block
  // reveal so the page remains readable rather than theatrical.
  const wordTargets = $$('.lab-line, .decide-headline, .mirror-headline, .test-line, .publish-headline span');
  wordTargets.forEach(target => {
    if (target.dataset.wordReveal || !target.textContent.trim()) return;
    const words = target.textContent.trim().split(/\s+/);
    target.textContent = '';
    words.forEach((word, index) => {
      const part = document.createElement('span');
      part.className = 'word-reveal-word';
      part.style.setProperty('--word-index', index);
      part.textContent = word;
      target.appendChild(part);
      target.appendChild(document.createTextNode(' '));
    });
    target.dataset.wordReveal = 'true';
  });
}

/* ---------- animated black testing statement ---------- */
function initTestingStatement() {
  const section = $('#testingStatement');
  if (!section) return;
  const copy = $('.testing-copy', section);
  if (copy && !$('.testing-type-repeater', copy)) {
    const repeater = document.createElement('div');
    repeater.className = 'testing-type-repeater';
    repeater.setAttribute('aria-hidden', 'true');
    $$('p', copy).forEach((line, index) => {
      const repeatLine = document.createElement('span');
      repeatLine.className = `testing-repeat-line testing-repeat-line--${index + 1}`;
      const text = line.textContent.trim().toUpperCase();
      repeatLine.textContent = `${text}   ${Array(4).fill(text).join('   ')}`;
      repeater.appendChild(repeatLine);
    });
    copy.prepend(repeater);
  }
  if (REDUCED) { section.classList.add('is-in'); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      section.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.35 });
  io.observe(section);
}

/* ---------- eased custom cursor on pointer-capable screens ---------- */
function initStickyCursor() {
  if (REDUCED || !window.matchMedia('(pointer: fine)').matches) return;
  const cursor = document.createElement('div');
  cursor.className = 'sticky-cursor';
  document.body.appendChild(cursor);
  document.body.classList.add('has-sticky-cursor');
  let targetX = -100, targetY = -100, x = -100, y = -100;
  const render = () => {
    x += (targetX - x) * .19;
    y += (targetY - y) * .19;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    requestAnimationFrame(render);
  };
  window.addEventListener('pointermove', event => {
    targetX = event.clientX; targetY = event.clientY;
    cursor.classList.add('is-visible');
  }, { passive: true });
  document.addEventListener('pointerover', event => {
    cursor.classList.toggle('is-active', Boolean(event.target.closest('button, a, input, select, textarea, .lab-tile')));
  });
  const gallery = $('#gallery');
  gallery?.addEventListener('pointerenter', () => cursor.classList.add('is-gallery'));
  gallery?.addEventListener('pointerleave', () => cursor.classList.remove('is-gallery'));
  render();
}

/* ============================================================
   FALLBACK CONTENT (embedded minimal copy if content.json fails)
   ============================================================ */
const FALLBACK_CONTENT = {
  site: { name: 'PERCEPTION LAB', tagline: 'An interactive experiment in advertising perception.', footerNote: 'Results are illustrative self-assessments.', copyright: '© 2026 Perception Lab.' },
  hero: {
    headlineTop: 'WHAT ARE YOU', headlineBottom: 'SELLING?',
    nav: ['01. PERCEPTION', '02. INVESTIGATE', '03. ANALYZE', '04. REFRAME'],
    placeholders: [
      { label: 'BEAUTY', x: 4, y: 8, w: 15, speed: 0.35, amp: 14, delay: 0.1 },
      { label: 'FOOD', x: 80, y: 10, w: 15, speed: 0.5, amp: 12, delay: 0.4 },
      { label: 'TECH', x: 66, y: 55, w: 14, speed: 0.4, amp: 15, delay: 0.7 },
      { label: 'PROPERTY', x: 8, y: 55, w: 16, speed: 0.25, amp: 18, delay: 1.0 }
    ]
  },
  marquee: {
    text: 'A PRODUCT. A PERCEPTION. OR BOTH.',
    links: [
      { label: 'SAME PRODUCT', target: 'lab' },
      { label: 'DIFFERENT PERCEPTION', target: 'mirror' }, { label: 'PERCEPTION GAP', target: 'test' },
      { label: 'BEFORE YOU PUBLISH', target: 'publish' }
    ]
  },
  lab: {
    label: '1. THE PERCEPTION LAB', headlineA: 'SAME PRODUCT.', headlineB: 'DIFFERENT STORY.',
    description: 'The product never changes. Only the visual language around it does.',
    productName: 'AURUM No. 04', tiles: ['LUXURY', 'AFFORDABLE', 'YOUTHFUL', 'CLINICAL', 'EXCLUSIVE'],
    indicators: [
      { key: 'value', label: 'PERCEIVED VALUE', default: 62 },
      { key: 'premium', label: 'PREMIUM FEEL', default: 55 },
      { key: 'quality', label: 'PERCEIVED QUALITY', default: 58 },
      { key: 'trust', label: 'PERCEIVED TRUST', default: 60 }
    ],
    indicatorNote: 'Illustrative settings only.'
  },
  decide: {
    label: '2. YOU DECIDE', headline: 'WHAT WOULD YOU PAY?',
    description: 'Slide to the price you believe this product is worth.',
    currency: 'PKR', minPrice: 100, maxPrice: 60000, defaultEstimate: 50000, actualPrice: 4800,
    productName: 'AURUM No. 04', productNote: 'Hypothetical demonstration product.',
    revealLine: 'YOUR PERCEPTION CHANGED before THE PRODUCT DID',
    presets: {
      luxury: { label: 'LUXURY', bg: '#0d0c0b', surface: '#1a1816', text: '#f3ead8', accent: '#c8a24a', font: 'serif', weight: 400, bodyScale: 1, sat: 0.85, hue: 8, contrast: 1.12, bright: 0.82, imgScale: 1.25, imgPos: 50, spacing: 1.5, align: 'center', message: 'Crafted in small batches.' },
      affordable: { label: 'AFFORDABLE', bg: '#fff4b8', surface: '#ffffff', text: '#050505', accent: '#e4572e', font: 'sans', weight: 800, bodyScale: 1.05, sat: 1.15, hue: 0, contrast: 1.05, bright: 1.08, imgScale: 0.95, imgPos: 50, spacing: 0.9, align: 'left', message: 'Big impression. Small price.' },
      youthful: { label: 'YOUTHFUL', bg: '#c7ff46', surface: '#fff', text: '#050505', accent: '#7b2ff7', font: 'sans', weight: 900, bodyScale: 1, sat: 1.35, hue: -12, contrast: 1.1, bright: 1.12, imgScale: 1.1, imgPos: 62, spacing: 0.8, align: 'left', message: 'Your rules. Your scent.' },
      clinical: { label: 'CLINICAL', bg: '#f4f6f8', surface: '#fff', text: '#111418', accent: '#2f6fed', font: 'sans', weight: 600, bodyScale: 1, sat: 0.55, hue: 0, contrast: 1, bright: 1.05, imgScale: 0.9, imgPos: 50, spacing: 1.2, align: 'left', message: 'Formulated with precision.' },
      exclusive: { label: 'EXCLUSIVE', bg: '#050505', surface: '#141414', text: '#fff', accent: '#c7ff46', font: 'serif', weight: 300, bodyScale: 0.95, sat: 0.7, hue: 0, contrast: 1.15, bright: 0.9, imgScale: 0.85, imgPos: 38, spacing: 2, align: 'center', message: 'Not for everyone.' }
    }
  },
  mirror: {
    label: '2. THE BRANDING MIRROR', headline: 'WHAT CHANGED?', description: 'Interact with the meaning-making devices.',
    controls: [
      { key: 'bg', label: 'BACKGROUND', type: 'color', default: '#ffffff' },
      { key: 'removeBg', label: 'BACKGROUND REMOVAL', type: 'segment', options: ['off', 'on'], default: 'off' },
      { key: 'textColor', label: 'TEXT COLOUR', type: 'color', default: '#050505' },
      { key: 'sat', label: 'SATURATION', type: 'range', min: 0, max: 200, default: 100 },
      { key: 'imgScaleX', label: 'IMAGE SCALE', type: 'range', min: 50, max: 180, default: 125 },
      { key: 'imgPosX', label: 'IMAGE POSITION', type: 'range', min: 0, max: 100, default: 50 },
      { key: 'cropX', label: 'IMAGE CROP', type: 'range', min: 60, max: 160, default: 100 },
      { key: 'imgScaleY', label: 'IMAGE SCALE', type: 'range', min: 50, max: 180, default: 125 },
      { key: 'imgPosY', label: 'IMAGE POSITION', type: 'range', min: 0, max: 100, default: 50 },
      { key: 'cropY', label: 'IMAGE CROP', type: 'range', min: 60, max: 160, default: 100 },
      { key: 'font', label: 'TYPOGRAPHY', type: 'segment', options: ['sans', 'serif', 'mono', 'display'], default: 'sans' }
    ],
    messages: { minimal: 'AURUM No. 04', descriptive: 'AURUM No. 04 — a study in amber and cedar.', urgent: 'AURUM No. 04. The moment is now.' },
    readout: ['PERCEIVED VALUE', 'PERCEIVED QUALITY', 'PERCEIVED TRUST', 'PERCEIVED EXCLUSIVITY']
  },
  gallery: { items: [
    { label: 'FOOD', x: 4, y: 6, w: 17, speed: 0.3, drift: -30, z: 2 },
    { label: 'BEAUTY', x: 30, y: 14, w: 15, speed: 0.55, drift: 20, z: 3 },
    { label: 'PROPERTY', x: 8, y: 46, w: 24, speed: 0.2, drift: -15, z: 1 },
    { label: 'PACKAGING', x: 58, y: 4, w: 14, speed: 0.65, drift: 35, z: 4 }
  ] },
  test: {
    label: '3. TEST YOUR BRAND', headlineA: 'TEST YOUR', headlineB: 'BRAND',
    steps: ['01 — DEFINE', '02 — INTENDED PERCEPTION', '03 — PRODUCT REALITY', '04 — COMPARE'],
    demoCampaigns: [
      { id: 'perfume', name: 'PERFUME / LUXURY', desc: 'Luxury fragrance.' },
      { id: 'skincare', name: 'SKINCARE / NATURAL', desc: 'Botanical skincare.' }
    ],
    perceptionOptions: ['LUXURY', 'AFFORDABLE', 'YOUTHFUL', 'CLINICAL', 'EXCLUSIVE'],
    priceOptions: ['ACCESSIBLE / LOW', 'MID-RANGE', 'PREMIUM', 'LUXURY'],
    materialOptions: ['NATURAL', 'SYNTHETIC', 'BLENDED'], qualityOptions: ['STANDARD', 'CERTIFIED'],
    productionOptions: ['MASS-PRODUCED', 'SMALL BATCH'], availabilityOptions: ['WIDELY AVAILABLE'],
    claimOptions: ['NONE STATED', 'PERFORMANCE TESTED'],
    headingPositions: { section: { x: 0, y: 0 }, define: { x: 0, y: 30 }, intended: { x: 0, y: 30 }, reality: { x: 0, y: 30 }, compare: { x: 0, y: 30 }, result: { x: 0, y: 30 } }
  },
  evaluation: {
    weights: { claimSupport: 0.28, priceConsistency: 0.22, featureConsistency: 0.22, impliedBenefits: 0.16, transparency: 0.12 },
    thresholds: { low: 25, moderate: 55 },
    labels: { low: 'LOW APPARENT PERCEPTION GAP', moderate: 'MODERATE PERCEPTION GAP', high: 'HIGH POTENTIAL PERCEPTION GAP', insufficient: 'INSUFFICIENT INFORMATION' },
    recommendations: ['Clarify an ambiguous product claim.', 'Add verifiable evidence.', 'Reconsider exaggerating imagery.', 'Align price presentation with the offering.', 'Preserve the aesthetic, improve accuracy.', 'State limitations openly.']
  },
  publish: {
    label: '4. BEFORE YOU PUBLISH', headlineA: 'BEFORE YOU', headlineB: 'PUBLISH',
    questions: [
      'Does the visual message make a claim the product cannot support?',
      'Does the imagery exaggerate the actual product experience?',
      'Are you creating a perception significantly beyond the product\'s reality?',
      'Could the communication exploit a particularly vulnerable audience?',
      'Are price, availability, and performance claims presented accurately?',
      'Is any essential qualification missing?'
    ],
    options: ['YES', 'NO', 'UNSURE']
  },
  final: { line1: 'PERSUASION IS NOT', line2: 'THE PROBLEM.', line3: 'UNQUESTIONED', line4: 'PERSUASION IS.' },
  animation: { blackoutMs: 350, staggerMs: 120, floatIntensity: 1, parallaxStrength: 1, marqueeSpeed: 1, sectionRevealMs: 900, gallerySwitchMs: 7600, galleryShiftMs: 1450, preloaderMinMs: 1850 }
};

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  await loadContent();
  initSectionOrb();
  initHero();
  initMarquee();
  initLab();
  initMirror();
  initGallery();
  initWizard();
  initPublish();
  initFinal();
  initReveals();
  initTestingStatement();
  initStickyCursor();
});
