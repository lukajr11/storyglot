'use strict';

/* State init + playback machinery + renderer plumbing + spec adapters + library + story tile. */

/* ============================================================
   STATE — multi-user. `rawState` is the literal localStorage
   object; `state` is a Proxy that auto-routes per-user fields
   (cards, settings, languages, ...) to the active user.
   ============================================================ */
let rawState = loadState();
ensureBuiltins(rawState);
ensureSettings(rawState);
ensureChunk3a(rawState);
migrateTestAttempts(rawState);
ensureCards(rawState);
ensureStoryProgress(rawState);
let state = makeStateProxy(rawState);
saveState();

// In-memory ephemeral session state.
let cardSession = null;
let testSession = null;
// Listen-mode flag: when set, cinema overlay is shown for the
// `{ langId, storyId }` pair regardless of first-read progress.
// Cleared on cinema exit. Not persisted.
let cinemaListen = null;
let swipeState  = { active: false, startX: 0, dx: 0, target: null, committed: false };
// Stage E — cross-story Review session (library-level Review button).
// Aliased into cardSession while active so the existing grade
// handlers (data-grade, data-speak-grade) operate on it.
let globalReview = null;
const GLOBAL_REVIEW_LIMIT = 20;

// Login gate: every fresh page load shows the user picker (Netflix-style).
// Once a profile is selected (and its password verified), `loggedIn`
// flips true for the rest of the session. Switching user resets it.
let loggedIn = false;

// Active story tracker.
function getActiveLang() {
  const lang = state.languages && state.languages[state.activeLanguageId];
  return lang || null;
}
function getActiveStoryId() { const l = getActiveLang(); return l && l.lastStoryId; }
function getStory(langId, storyId) { return state.storiesData[`${langId}::${storyId}`]; }

// Per-story progress accessor. Lazily seeds a default record so callers
// can rely on every story having one. Persistence happens via the
// surrounding state Proxy + saveState().
function getStoryProgress(langId, storyId) {
  const lang = state.languages && state.languages[langId];
  if (!lang) return null;
  lang.storyProgress = lang.storyProgress || {};
  if (!lang.storyProgress[storyId]) {
    lang.storyProgress[storyId] = defaultStoryProgress();
  }
  return lang.storyProgress[storyId];
}
function setStoryProgress(langId, storyId, patch) {
  const prog = getStoryProgress(langId, storyId);
  if (!prog) return null;
  Object.assign(prog, patch);
  saveState();
  return prog;
}

// Initial theme — read from active user's active language.
if (getActiveLang() && getActiveLang().theme) applyTheme(getActiveLang().theme);
// Wallpaper applies even if no language theme is set (theme call
// already invokes applyBackgroundImage; this covers the no-theme path).
applyBackgroundImage();

// Replace state in place (preserves the proxy reference so all
// closures keep working). Used by reset / import-backup.
function replaceRawState(newRaw) {
  Object.keys(rawState).forEach(k => delete rawState[k]);
  Object.assign(rawState, newRaw);
}

/* ============================================================
   PLAYBACK STATE — for the Read tab "Listen to whole story"
   ============================================================ */
let playback = { active: false, idx: -1, version: 0 };

function startPlayAll(sentences, langCode, opts = {}) {
  stopPlayAll();
  playback.active = true;
  playback.version++;
  const myVersion = playback.version;
  let completed = false;
  const lang = getActiveLang();
  const langId  = opts.langId  || (lang && lang.id) || null;
  const storyId = opts.storyId || (lang && lang.lastStoryId) || null;
  const startIdx = Math.max(0, Math.min((opts.startIdx | 0), sentences.length - 1));

  (async () => {
    for (let i = startIdx; i < sentences.length; i++) {
      if (!playback.active || playback.version !== myVersion) break;
      playback.idx = i;
      updatePlayHighlight();
      updatePlayButton();
      if (langId && storyId) {
        await playSentenceFile(langId, storyId, i, sentences[i].de, langCode);
      } else {
        await speak(sentences[i].de, langCode);
      }
      // Brief pause between sentences (skipped if cancelled).
      if (!playback.active || playback.version !== myVersion) break;
      await new Promise(r => setTimeout(r, 280));
    }
    if (playback.version === myVersion) {
      completed = playback.active;
      playback.active = false;
      playback.idx = -1;
      updatePlayHighlight();
      updatePlayButton();
      if (completed && typeof opts.onDone === 'function') {
        try { opts.onDone(); } catch {}
      }
    }
  })();
}

function stopPlayAll() {
  playback.active = false;
  playback.idx = -1;
  stopSpeak();
  stopActiveAudio();
  updatePlayHighlight();
  updatePlayButton();
}

function updatePlayHighlight() {
  // Refresh the .active class on sentence spans/rows without
  // re-rendering the whole tab (avoids audio glitches).
  document.querySelectorAll('[data-sent-idx]').forEach(el => {
    const idx = Number(el.getAttribute('data-sent-idx'));
    el.classList.toggle('active', idx === playback.idx);
  });
  // Cinema overlay: advance the progress bar, counter, time-left,
  // and play-button label in sync with the active sentence index.
  // Kept here so any caller that triggers a highlight refresh
  // (auto-advance, manual click, speed change) updates them all.
  const screen = document.querySelector('.cinema-screen');
  if (screen) {
    const total = screen.querySelectorAll('.cs-line').length;
    const cur = playback.idx >= 0 ? playback.idx : 0;
    const bar = screen.querySelector('.cs-progress .bar');
    if (bar && total > 0) bar.style.width = `${((cur + 1) / total) * 100}%`;
    const num = screen.querySelector('.cs-current');
    if (num) num.textContent = String(Math.min(cur + 1, total));
    const left = screen.querySelector('.cs-time-left');
    if (left) left.textContent = `${formatMSS(cinemaTimeLeftSeconds(total))} left`;
    const playBtn = screen.querySelector('[data-cinema-play]');
    if (playBtn) playBtn.textContent = playback.active ? '⏸  Pause' : '▶  Play';
  }
}

function updatePlayButton() {
  const btn = document.getElementById('btn-play-all');
  if (!btn) return;
  btn.textContent = playback.active ? '⏹  Stop' : '🔊  Listen to whole story';
}

/* ============================================================
   RENDERERS — each returns an HTML string. The top-level
   render() composes them into #app. After insertion we wire
   up event handlers for that pass.
   ============================================================ */
function escapeHtml(str) {
  // Substitute {{PROTAGONIST}} at render time per the Storyglot
  // story spec §5.1. The token is unique enough that running this
  // through every escapeHtml call is safe.
  const sub = substituteProtagonist(String(str));
  return sub
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   STORYGLOT SPEC ADAPTERS — schema + protagonist substitution.
   Lets the app accept new-shape stories (targetText / englishGloss
   / grammar.id / tests.type) alongside the legacy de/en shape.
   Internal representation stays as the legacy shape; the new shape
   is normalized on import.
   ============================================================ */

// Map full-name language IDs (per the new spec — "italian", "german")
// to the 2-letter codes the app uses internally.
const LANGUAGE_ID_ALIASES = {
  italian: 'it',
  german: 'de',
  english: 'en',
  french: 'fr',
  spanish: 'es',
  portuguese: 'pt',
  japanese: 'ja',
  chinese: 'zh',
  russian: 'ru'
};
function normalizeLangId(id) {
  if (!id) return id;
  const lower = String(id).toLowerCase();
  return LANGUAGE_ID_ALIASES[lower] || lower;
}

// Detect whether a story JSON is in the new Storyglot spec shape
// (sentences with targetText / grammar with id+status / tests with
// type+ruleId) versus the legacy {de,en} shape used by chunks 1–3.
function isNewSchemaStory(json) {
  if (!json || typeof json !== 'object') return false;
  if (json.type === 'story') return true;
  if (Array.isArray(json.sentences) && json.sentences.length > 0) {
    const s0 = json.sentences[0];
    if (s0 && s0.targetText !== undefined) return true;
  }
  if (Array.isArray(json.grammar) && json.grammar.length > 0 && json.grammar[0].id !== undefined) return true;
  return false;
}

// Convert a new-spec story to the internal legacy shape so the
// existing renderers, validators, and SRS pipeline work unchanged.
function normalizeStoryShape(json) {
  if (!isNewSchemaStory(json)) return json;
  const sentences = (json.sentences || []).map(s => ({
    de: s.targetText || '',
    en: s.englishGloss || '',
    note: s.note || null
  }));
  const vocabulary = (json.vocabulary || []).map(v => ({
    de: v.word,
    en: v.translation,
    pos: v.pos || null,
    gender: v.gender || null,
    plural: v.plural || null,
    note: v.note || null
  }));
  // The new schema doesn't carry per-rule tier; use status:'new' →
  // tier 1 (introduced in this story) and status:'supporting' →
  // tier 2 (recycled). Preserve the rule id so tests can reference
  // it without ambiguity even if rule names collide.
  const grammarRules = (json.grammar || []).map(g => ({
    name: g.name || g.id || 'Untitled rule',
    tier: g.status === 'new' ? 1 : 2,
    desc: g.explanation || '',
    longExplanation: g.longExplanation || g.explanation || '',
    // Optional richer fields — pass through if the source carries them
    // so the renderRuleCard surface (used by Rules tab + first-read +
    // drill 5 review) can show examples, tips, and paradigm tables.
    examples: Array.isArray(g.examples) ? g.examples : null,
    tips: Array.isArray(g.tips) ? g.tips : null,
    table: g.table || null,
    formula: g.formula || null,
    _id: g.id || null,
    _status: g.status || null
  }));
  const ruleNameById = {};
  (json.grammar || []).forEach(g => { if (g.id) ruleNameById[g.id] = g.name; });
  const grammarTests = (json.tests || []).map(t => ({
    tier: t.tier,
    rule: ruleNameById[t.ruleId] || t.ruleId || '',
    en: t.prompt || '',
    de: t.answer || '',
    trap: t.note || null,
    _type: t.type || 'translate-en-to-it',
    _options: Array.isArray(t.options) ? t.options : null,
    _ruleId: t.ruleId || null
  }));
  return {
    schemaVersion: 1,
    languageId: normalizeLangId(json.languageId),
    id: json.id,
    title: json.title || '',
    level: json.level || 'A1',
    order: json.order || 1,
    synopsis: json.synopsis || null,
    _atmosphereIntro: json.atmosphere_intro || null,
    _coverPrompt: json.cover_image_prompt || null,
    sentences,
    vocabulary,
    grammarRules,
    grammarTests
  };
}

// Resolve the active protagonist name. Falls back to the language's
// configured default, then to a hard fallback ('Bianca' for it,
// empty for others — German story uses no token so it doesn't matter).
function getActiveProtagonistName() {
  try {
    const lang = state && state.languages ? state.languages[state.activeLanguageId] : null;
    if (lang && lang.protagonistName) return lang.protagonistName;
    if (lang && lang.defaultProtagonist) return lang.defaultProtagonist;
    if (lang && lang.id === 'it') return 'Bianca';
  } catch {}
  return '';
}

// Active language's short code, uppercased. Used as the speak-button
// label (e.g. "🔊 IT") so the UI matches whichever language is loaded.
function speakLabelForActive() {
  const l = (state && state.languages) ? state.languages[state.activeLanguageId] : null;
  const id = l && l.id ? String(l.id) : '';
  return id ? id.toUpperCase() : 'TARGET';
}

// Active language's display name, lower-cased for sentence-fit copy
// (e.g. "Type your italian word..."). Falls back to "target".
function targetLangNameLower() {
  const l = (state && state.languages) ? state.languages[state.activeLanguageId] : null;
  return (l && l.name) ? String(l.name).toLowerCase() : 'target';
}

// Replace {{PROTAGONIST}} occurrences in a string with the chosen
// name. Cheap; called from escapeHtml so it covers all rendered text.
function substituteProtagonist(text) {
  if (!text || text.indexOf('{{PROTAGONIST}}') < 0) return text;
  const name = getActiveProtagonistName();
  if (!name) return text;          // leave the token literal so it's visible/debuggable
  return text.split('{{PROTAGONIST}}').join(name);
}

function renderHeader() {
  const lang = getActiveLang();
  return `
    <div class="app-header">
      <div class="app-logo">
        <span>STORYGLOT</span>
        <span style="color: var(--accent); margin-left: 4px;">✦</span>
      </div>
      <button class="lang-pill" id="btn-lang">
        <span class="flag">${lang.flag}</span>
        <span>${escapeHtml(lang.name).toUpperCase()}</span>
      </button>
    </div>
  `;
}

function renderStats() {
  const langId = state.activeLanguageId;
  const s = getStats(state, langId);
  const streak = getStreak(state);
  const pill = (label, val) => `
    <div class="stat-pill">
      <div class="label">${label}</div>
      <div class="value gradient-text">${val}</div>
    </div>`;
  return `
    <div class="stats">
      ${pill('Streak 🔥', streak)}
      ${pill('New', s.new)}
      ${pill('Due', s.due)}
      ${pill('Mastered', s.mastered)}
    </div>
  `;
}

function renderTabBar() {
  const lang = getActiveLang();
  const tabs = [
    { id: 'library',  label: 'Library',  icon: '📚' },
    { id: 'read',     label: 'Read',     icon: '📖' },
    { id: 'rules',    label: 'Rules',    icon: '📋' },
    { id: 'cards',    label: 'Cards',    icon: '🎴' },
    { id: 'test',     label: 'Test',     icon: '🎯' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];
  return `
    <div class="tab-cards">
      ${tabs.map(t => `
        <button class="tab-card ${lang.lastTab === t.id ? 'active' : ''}" data-tab="${t.id}">
          <span class="tab-icon">${t.icon}</span>
          <span class="tab-label">${t.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderLibrary() {
  // Stage B: Library has two modes — top-level (one card per
  // language journey) or drilled into a single language (story tiles).
  const drilledLangId = state.libraryDrilledIn;
  if (drilledLangId && state.languages[drilledLangId]) {
    return renderLibraryDrilldown(drilledLangId);
  }
  return renderLibraryTop();
}

/* Library top-level — one card per language registered for this user.
   Pure language picker: no Review button, no progress sparkline —
   those live inside the drilled-in view. Tapping a card switches
   active language and drills in. */
function renderLibraryTop() {
  const langs = Object.values(state.languages);
  if (langs.length === 0) {
    return `<div class="glass empty-state">
      <div class="em-icon">📚</div>
      No languages installed yet.
    </div>`;
  }
  const cards = langs.map(l => renderJourneyCard(l)).join('');
  return `<div class="journey-grid">${cards}</div>`;
}

function renderJourneyCard(l) {
  const uploaded = l.coverImage || null;
  const svgArt = !uploaded ? getDefaultCoverSvg(l.id) : null;
  const coverStyle = uploaded ? `background-image: url('${escapeHtml(uploaded)}');` : '';
  const coverArt = !uploaded && svgArt
    ? `<div class="jc-cover">${svgArt}</div>`
    : !uploaded
      ? `<div class="jc-cover" style="background: linear-gradient(135deg, var(--grad-1), var(--grad-2) 55%, var(--grad-3));"></div>`
      : `<div class="jc-cover" style="${coverStyle}"></div>`;

  // Aggregate progress across this language's stories.
  const stats = getStats(state, l.id);
  const masteredPct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
  const storyCount = (l.stories || []).length;
  const levelsLabel = (l.levels && l.levels.length)
    ? `${l.levels[0]} → ${l.levels[l.levels.length - 1]} journey`
    : `${storyCount} ${storyCount === 1 ? 'story' : 'stories'}`;
  const teaser = l.teaser || '';

  return `
    <div class="glass journey-card" data-enter-lang="${escapeHtml(l.id)}">
      ${coverArt}
      <div class="jc-overlay"></div>
      <div class="jc-flag">${l.flag || ''}</div>
      <div class="jc-body">
        <div class="jc-name">${escapeHtml(l.name).toUpperCase()}</div>
        ${teaser ? `<div class="jc-teaser">${escapeHtml(teaser)}</div>` : ''}
        <div class="jc-progress-bar"><div class="jc-progress-fill" style="width: ${masteredPct}%"></div></div>
        <div class="jc-meta">
          <span>${levelsLabel}</span>
          <span>${storyCount} ${storyCount === 1 ? 'story' : 'stories'} · ${masteredPct}% mastered</span>
        </div>
      </div>
    </div>
  `;
}

/* Library drilled into a single language — shows story tiles. */
function renderLibraryDrilldown(langId) {
  const lang = state.languages[langId] || getActiveLang();
  const hero = renderHeroCover(lang);
  const back = `
    <div class="back-bar">
      <button class="back-btn" data-back-to-langs="1">← Languages</button>
      <span class="back-context">${escapeHtml(lang.name)}</span>
    </div>
  `;

  if (!lang.stories.length) {
    return back + hero + `<div class="glass empty-state">
      <div class="em-icon">📚</div>
      No stories yet for ${escapeHtml(lang.name)}.
    </div>` + renderProgressSection();
  }

  const cards = lang.stories.map(storyId => renderStoryTile(lang, storyId)).join('');
  return back + hero + cards + renderProgressSection();
}

/* Listen-card — a dedicated cinema-mode entry point that sits above
   each story tile. Independent of first-read progress: lets a learner
   replay the whole story as an audio-book at any time. */
function renderListenCard(lang, storyId, opts = {}) {
  const story = getStory(lang.id, storyId);
  if (!story) return '';
  const cover = story.coverImage;
  const sentenceCount = (story.sentences || []).length;
  const rate = (state && state.settings && state.settings.ttsRate) || 1;
  const seconds = Math.round(sentenceCount * 3.3 / rate);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const dur = `${mins}:${String(secs).padStart(2, '0')}`;
  const thumbStyle = cover ? `background-image: url('${escapeHtml(cover)}');` : '';
  const trail = opts.done
    ? `<span class="lc-check">✓</span>`
    : `<button class="lc-play" aria-label="Play">▶</button>`;
  return `
    <div class="glass listen-card ${opts.done ? 'done' : ''}" data-listen-story="${escapeHtml(storyId)}">
      <div class="lc-thumb" style="${thumbStyle}">${cover ? '' : '🎧'}</div>
      <div class="lc-body">
        <div class="lc-eyebrow">Cinema · Listen</div>
        <div class="lc-title">${escapeHtml(story.title)}</div>
        <div class="lc-meta">${sentenceCount} sentences · ~${dur}</div>
      </div>
      ${trail}
    </div>
  `;
}

/* Story tile rendered inside the drilled-in library view. Adds a
   small completion badge based on per-story mastery percentage. */
function renderStoryTile(lang, storyId) {
  const story = getStory(lang.id, storyId);
  if (!story) return '';
  const stats = getStats(state, lang.id, storyId);
  const total = stats.total;
  const masteredPct = total ? Math.round((stats.mastered / total) * 100) : 0;
  const grammarCount = (story.grammarRules || []).length;
  const coverHtml = renderStoryCover(lang.id, story);
  const cardClass = coverHtml ? 'glass story-card with-cover' : 'glass story-card';

  // Phase signals — drill activity vs. mid-flight first-read. Cards
  // with reps>0 only happen once drill flow starts; first-read alone
  // doesn't grade anything, so we also peek at storyProgress.
  const prog = (lang.storyProgress && lang.storyProgress[storyId]) || null;
  const drillStarted = (stats.total - stats.new) > 0;
  const inFirstReadActive = !!prog && prog.phase === 'first-read' &&
    (prog.firstReadStep > 1 || (prog.step1Phase && prog.step1Phase !== 'intro'));
  const inDrillFlow = !!prog && prog.phase === 'drill-flow';
  const inFreePractice = !!prog && prog.phase === 'free-practice';

  // Phase pill — rendered inline inside the .tags row so it can
  // never overlap other elements. Variants pick up the .done modifier
  // for the green checkmark style.
  let pillHtml = '';
  if (inFreePractice) {
    pillHtml = `<span class="tag-pill phase-pill done">✓ Done</span>`;
  } else if (inDrillFlow) {
    const cur = (prog.currentDrill || 1);
    pillHtml = `<span class="tag-pill phase-pill">Drill ${cur}/6</span>`;
  } else if (inFirstReadActive) {
    pillHtml = `<span class="tag-pill phase-pill">Intro ${prog.firstReadStep}/6</span>`;
  } else if (masteredPct >= 80) {
    pillHtml = `<span class="tag-pill phase-pill done">✓ Done</span>`;
  }

  // Action label by phase.
  const actionLabel = inFreePractice
    ? 'Free practice →'
    : (inDrillFlow ? 'Continue drills →'
      : (inFirstReadActive ? 'Continue intro →'
        : (drillStarted ? 'Continue Learning →' : 'Start →')));

  return `
    <div class="${cardClass}">
      ${coverHtml}
      <div class="tags">
        <span class="tag-pill">${escapeHtml(story.level)}</span>
        <span class="tag-pill">Story #${story.order || 1}</span>
        ${pillHtml}
      </div>
      <div class="story-title gradient-text">${escapeHtml(story.title)}</div>
      ${story.synopsis ? `<div class="story-meta" style="margin-bottom: 10px;">${escapeHtml(story.synopsis)}</div>` : ''}
      <div class="story-meta">${story.sentences.length} sentences · ${grammarCount} grammar rules</div>
      <div class="progress"><div class="progress-fill" style="width: ${masteredPct}%"></div></div>
      <div class="story-foot">${stats.mastered} / ${total} mastered · ${stats.due} due today</div>
      <button class="gradient-btn" data-open-story="${escapeHtml(storyId)}">
        ${actionLabel}
      </button>
    </div>
  `;
}

/* Hero cover at top of Library: uploaded image overrides default
   per-language SVG art. Keeps the layout if neither is present
   (renders a gradient fallback). */
function renderHeroCover(lang) {
  if (!lang) return '';
  const uploaded = lang.coverImage || null;
  const svgArt = !uploaded ? getDefaultCoverSvg(lang.id) : null;

  const bgStyle = uploaded
    ? `background-image: url('${escapeHtml(uploaded)}');`
    : '';
  const artHtml = !uploaded && svgArt
    ? `<div class="cover-art">${svgArt}</div>`
    : !uploaded
      ? `<div class="cover-art" style="background: linear-gradient(135deg, var(--grad-1), var(--grad-2) 55%, var(--grad-3));"></div>`
      : '';

  const totalStories = (lang.stories || []).length;
  const sub = `${totalStories} ${totalStories === 1 ? 'story' : 'stories'}`;

  return `
    <div class="hero-cover" style="${bgStyle}">
      ${artHtml}
      <div class="hero-overlay"></div>
      <div class="hero-title">
        <div>
          <div class="hero-name">${escapeHtml(lang.name).toUpperCase()}</div>
          <div class="hero-sub">${sub}</div>
        </div>
        <div class="hero-flag">${lang.flag || ''}</div>
      </div>
    </div>
  `;
}

/* Per-story cover panel, shown on the right side of the story tile.
   Falls back to the language's default SVG art when no upload. */
function renderStoryCover(langId, story) {
  const uploaded = story && story.coverImage;
  if (uploaded) {
    return `<div class="story-cover" style="background-image: url('${escapeHtml(uploaded)}');"></div>`;
  }
  const svgArt = getDefaultCoverSvg(langId);
  if (svgArt) {
    return `<div class="story-cover svg-cover">${svgArt}</div>`;
  }
  return '';
}

/* ---------- Library: collapsible Progress section ---------- */
function getActivityByDay(days = 30) {
  // Last `days` days inclusive of today, oldest → newest. Each entry
  // sums session.count for the active language across all stories.
  const langId = state.activeLanguageId;
  const sessions = state.sessions || [];
  const byDate = new Map();
  for (const s of sessions) {
    if (s.languageId && s.languageId !== langId) continue;
    byDate.set(s.date, (byDate.get(s.date) || 0) + (s.count || 0));
  }
  const out = [];
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  cur.setDate(cur.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${dd}`;
    out.push({ date: key, count: byDate.get(key) || 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// Distinct lowercase German tokens across all mastered cards
// (interval >= 21) for the active language.
function getMasteredVocabCount() {
  const langId = state.activeLanguageId;
  const lang = state.languages[langId];
  const tokens = new Set();
  const wordRe = /[a-zA-ZÀ-ſß]+/g;
  for (const cardId in state.cards) {
    if (!cardId.startsWith(`${langId}::`)) continue;
    const card = state.cards[cardId];
    if (card.interval < MASTERED_INTERVAL_DAYS) continue;
    const [, storyId, idxStr] = cardId.split('::');
    const story = state.storiesData[`${langId}::${storyId}`];
    if (!story) continue;
    const sentence = story.sentences[parseInt(idxStr, 10)];
    if (!sentence || !sentence.de) continue;
    const ms = sentence.de.match(wordRe);
    if (ms) for (const w of ms) tokens.add(w.toLowerCase());
  }
  return tokens.size;
}

// Smooth bezier path through the daily counts. Y is inverted because
// SVG (0,0) is top-left.
function buildSparklinePath(values, w, h) {
  if (values.length === 0) return '';
  const max = Math.max(1, ...values);
  const stepX = w / Math.max(1, values.length - 1);
  const pad = 4;
  const usableH = h - pad * 2;
  const points = values.map((v, i) => [
    i * stepX,
    pad + (1 - v / max) * usableH
  ]);
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx.toFixed(1)} ${y0.toFixed(1)}, ${cx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

function renderProgressSection() {
  const open = !!state.settings.progressOpen;
  const streak = getStreak(state);
  const activity = getActivityByDay(30);
  const totalCards = activity.reduce((a, x) => a + x.count, 0);
  const vocab = getMasteredVocabCount();

  // Sparkline SVG.
  const w = 720, h = 80;
  const counts = activity.map(a => a.count);
  const path = buildSparklinePath(counts, w, h);
  const svg = `
    <svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="var(--grad-1)"/>
          <stop offset="60%" stop-color="var(--grad-2)"/>
          <stop offset="100%" stop-color="var(--grad-3)"/>
        </linearGradient>
        <filter id="sparkGlow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="${path}" fill="none" stroke="url(#sparkGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#sparkGlow)"/>
    </svg>
  `;

  // Per-story accuracy rows.
  const lang = getActiveLang();
  const storyRows = lang.stories.map(storyId => {
    const story = getStory(lang.id, storyId);
    if (!story) return '';
    const prefix = `${lang.id}::${storyId}::`;
    let attempts = 0, correct = 0;
    for (const k in state.testAttempts) {
      if (!k.startsWith(prefix)) continue;
      attempts += state.testAttempts[k].attempts;
      correct  += state.testAttempts[k].correct;
    }
    const acc = attempts > 0 ? Math.round(correct / attempts * 100) : 0;
    return `
      <div class="item-row">
        <div class="grow">
          <div class="title">${escapeHtml(story.title)}</div>
          <div class="meta">${attempts} test attempts · ${acc}% accuracy</div>
        </div>
      </div>
    `;
  }).join('');

  const body = open ? `
    <div class="progress-body">
      <div class="streak-display">
        <div class="num gradient-text">🔥 ${streak}</div>
        <div class="lbl">Day streak</div>
      </div>
      <div class="sparkline-wrap">${svg}</div>
      <div class="vocab-line">
        <span class="num">${vocab}</span> distinct ${escapeHtml(targetLangNameLower())} words mastered ·
        <span class="num">${totalCards}</span> cards in last 30 days
      </div>
      <div class="row-list">${storyRows || '<div style="font-size:12px;color:var(--text-soft);text-align:center">No stories yet.</div>'}</div>
    </div>
  ` : '';

  return `
    <div class="glass progress-section">
      <button id="progress-toggle" class="progress-toggle ${open ? 'open' : ''}">
        <span>📈 Progress</span>
        <span class="arrow">›</span>
      </button>
      ${body}
    </div>
  `;
}

function renderRead() {
  const lang = getActiveLang();
  const storyId = lang.lastStoryId;
  if (!storyId) {
    return `<div class="glass empty-state">
      <div class="em-icon">📖</div>
      Pick a story from Library to start reading.
    </div>`;
  }
  const story = getStory(lang.id, storyId);
  if (!story) return `<div class="glass empty-state">Story not found.</div>`;

  // Hub-driven story view: tiles for Listen / Grammar / Walkthrough.
  // The auto-cinema for the first-time intro+narration still runs
  // before the hub via shouldShowCinema(); once it finishes (or the
  // user has already listened) we land here on the hub.
  const sub = lang.readSubMode || 'hub';
  if (sub === 'grammar')     return renderStoryHubGrammar(lang, story);
  if (sub === 'walkthrough') return renderStoryHubWalkthrough(lang, story);
  return renderStoryHub(lang, story);
}

function renderStoryHub(lang, story) {
  const prog = getStoryProgress(lang.id, story.id) || {};
  const listenDone      = !!prog.listenDone;
  const grammarDone     = !!prog.grammarDone;
  const walkthroughDone = !!prog.walkthroughDone;
  return [
    renderListenCard(lang, story.id, { done: listenDone }),
    renderHubTile({
      mode: 'grammar',
      icon: '📋',
      eyebrow: 'Study · Grammar',
      title: 'Learn grammar',
      meta: `${(story.grammarRules || []).length} rules in this story`,
      locked: !listenDone,
      lockHint: 'Listen first',
      done: grammarDone,
    }),
    renderHubTile({
      mode: 'walkthrough',
      icon: '📖',
      eyebrow: 'Study · Sentences',
      title: 'Sentence walkthrough',
      meta: `${(story.sentences || []).length} sentences · one at a time`,
      locked: !grammarDone,
      lockHint: 'Finish grammar first',
      done: walkthroughDone,
    }),
  ].join('');
}

function renderHubTile({ mode, icon, eyebrow, title, meta, locked, lockHint, done }) {
  const stateClass = locked ? 'locked' : (done ? 'done' : '');
  const trail = locked
    ? `<span class="lc-lock">🔒 ${escapeHtml(lockHint || 'Locked')}</span>`
    : (done ? `<span class="lc-check">✓</span>` : `<button class="lc-play" aria-label="Open">›</button>`);
  const attrs = locked ? '' : ` data-hub-mode="${escapeHtml(mode)}"`;
  return `
    <div class="glass listen-card ${stateClass}"${attrs}>
      <div class="lc-thumb">${locked ? '🔒' : icon}</div>
      <div class="lc-body">
        <div class="lc-eyebrow">${escapeHtml(eyebrow)}</div>
        <div class="lc-title">${escapeHtml(title)}</div>
        <div class="lc-meta">${escapeHtml(meta)}</div>
      </div>
      ${trail}
    </div>
  `;
}

function renderStoryHubGrammar(lang, story) {
  const back = `<div class="back-bar">
    <button class="back-btn" data-hub-back="1">← Story</button>
    <span class="back-context">Grammar — ${escapeHtml(story.title)}</span>
  </div>`;
  if (!Array.isArray(story.grammarRules) || story.grammarRules.length === 0) {
    return back + `<div class="glass empty-state">No grammar rules defined for this story.</div>`;
  }
  const byTier = { 1: [], 2: [], 3: [] };
  story.grammarRules.forEach((r, idx) => {
    const t = [1, 2, 3].includes(r.tier) ? r.tier : 1;
    byTier[t].push({ ...r, _idx: idx });
  });
  const sections = [1, 2, 3].map(tier => {
    const rules = byTier[tier];
    if (rules.length === 0) return '';
    const cards = rules.map(r => renderRuleCard(r, tier)).join('');
    return `<div class="tier-divider">Tier ${tier}</div>${cards}`;
  }).join('');
  return back + sections;
}

function renderStoryHubWalkthrough(lang, story) {
  const back = `<div class="back-bar">
    <button class="back-btn" data-hub-back="1">← Story</button>
    <span class="back-context">Walkthrough — ${escapeHtml(story.title)}</span>
  </div>`;
  const progress = getStoryProgress(lang.id, story.id);
  // Reuses the Step 3 renderer (sentence-by-sentence with prev/next,
  // new-vocab tap-to-translate). Continue at the last sentence will
  // still advance first-read progress — that's a no-op for users who
  // are past first-read since the phase guards skip it.
  return back + renderFRStep3(lang, story, progress);
}

function renderReadLegacy(lang, story) {
  const mode = lang.readMode || 'full';
  const toggle = `
    <div class="read-toggle">
      <button class="${mode === 'full' ? 'active' : ''}" data-read-mode="full">Full Text</button>
      <button class="${mode === 'sentence' ? 'active' : ''}" data-read-mode="sentence">Sentence by Sentence</button>
    </div>
  `;

  if (mode === 'full') {
    const proseHtml = story.sentences.map((s, i) =>
      `<span class="sent" data-sent-idx="${i}">${escapeHtml(s.de)}</span>`
    ).join(' ');
    const englishHtml = story.sentences.map(s => escapeHtml(s.en)).join(' ');
    return `
      ${toggle}
      <div class="play-bar">
        <button class="gradient-btn" id="btn-play-all">${playback.active ? '⏹  Stop' : '🔊  Listen to whole story'}</button>
      </div>
      <div class="glass story-prose">${proseHtml}</div>
      <button class="ghost-btn english-toggle" id="btn-toggle-english" data-shown="0">Show English ↓</button>
      <div class="glass english-block" id="english-block" style="display: none;">${englishHtml}</div>
    `;
  }

  // Sentence-by-sentence mode
  const rows = story.sentences.map((s, i) => `
    <div class="glass sentence-row" data-sent-idx="${i}" data-speak="${escapeHtml(s.de)}">
      <div class="de">${escapeHtml(s.de)}</div>
      <div class="en">${escapeHtml(s.en)}</div>
      ${s.note ? `<div class="note">${escapeHtml(s.note)}</div>` : ''}
    </div>
  `).join('');
  return `
    ${toggle}
    <div class="play-bar">
      <button class="gradient-btn" id="btn-play-all">${playback.active ? '⏹  Stop' : '🔊  Listen to whole story'}</button>
    </div>
    ${rows}
  `;
}
