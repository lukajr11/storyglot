'use strict';

/* Pure helpers: SM-2, Levenshtein, queue build, toasts, validators, file IO, modals. */

/* ============================================================
   CHUNK 2 HELPERS — Levenshtein, normalize, SM-2, queue build,
   tier unlock, session activity logging.
   ============================================================ */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function normalize(s) {
  return s.trim().toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');
}

// SM-2: mutates `card` in place. quality is the user-facing 1..4.
function sm2(card, quality) {
  const q = [0, 2, 3, 4, 5][quality];
  card.totalReviews++;
  card.lastReviewed = Date.now();
  if (q >= 3) {
    card.correctReviews++;
    if (card.reps === 0) card.interval = 1;
    else if (card.reps === 1) card.interval = 6;
    else card.interval = Math.round(card.interval * card.ef);
    card.reps++;
  } else {
    card.reps = 0;
    card.interval = 1;
  }
  card.ef = Math.max(1.3, card.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  card.nextReview = Date.now() + card.interval * 86400000;
}

// Build a study queue: due cards + new cards (capped), then shuffled.
// Build the SRS queue for a story. `source` selects which card
// namespace to study: 'sentences' (sentence cards, the default
// since chunk 1) or 'vocabulary' (word cards, chunk-3a-patch).
// The two namespaces are independent — separate due/new pools.
function buildCardQueue(languageId, storyId, source) {
  source = source || 'sentences';
  const storyPrefix = `${languageId}::${storyId}::`;
  const vocabMarker = '::vocab::';
  const allCards = Object.entries(state.cards)
    .filter(([k]) => {
      if (!k.startsWith(storyPrefix)) return false;
      const isVocab = k.includes(vocabMarker);
      return source === 'vocabulary' ? isVocab : !isVocab;
    })
    .map(([id, card]) => ({ id, ...card }));
  const now = Date.now();
  const due = allCards.filter(c => c.reps > 0 && c.nextReview !== null && c.nextReview <= now);
  const newC = allCards.filter(c => c.reps === 0 && c.nextReview === null)
    .slice(0, state.settings.newPerDay);
  let queue = [...due, ...newC].slice(0, state.settings.dailyCap);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

// Resolve a card's underlying content (sentence or vocab item)
// from its id. Returns { type: 'sentence' | 'vocab', item, idx }.
function getCardContent(cardId, story) {
  const parts = cardId.split('::');
  if (parts[2] === 'vocab') {
    const idx = parseInt(parts[3], 10);
    return { type: 'vocab', item: (story.vocabulary || [])[idx], idx };
  }
  const idx = parseInt(parts[2], 10);
  return { type: 'sentence', item: (story.sentences || [])[idx], idx };
}

// Tier 1 always unlocked. Tier N (N>1) unlocks when prev tier has
// ≥20 FIRST-ATTEMPT answers at ≥80% first-attempt accuracy. Retry
// attempts inflate lifetime stats (shown in the UI) but are excluded
// here to prevent grinding the same wrong test until memorized.
function tierUnlocked(tier, languageId, storyId) {
  if (tier === 1) return true;
  const prevTier = tier - 1;
  const prefix = `${languageId}::${storyId}::tier${prevTier}::`;
  const records = Object.entries(state.testAttempts)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v);
  const totalFirst   = records.reduce((a, x) => a + (x.firstAttempts        || 0), 0);
  const correctFirst = records.reduce((a, x) => a + (x.firstAttemptsCorrect || 0), 0);
  if (totalFirst < 20) return false;
  return (correctFirst / totalFirst) >= 0.8;
}

// Append (or update) today's session record so the streak counter
// ticks and session-correctness stats accumulate.
function logActivity(langId, storyId, correct) {
  const today = todayKey();
  let s = state.sessions.find(x =>
    x.date === today && x.languageId === langId && x.storyId === storyId);
  if (!s) {
    s = { date: today, count: 0, correct: 0, languageId: langId, storyId: storyId };
    state.sessions.push(s);
  }
  s.count++;
  if (correct) s.correct++;
}

// Settings live per-user in v3. Backfill defaults for every user.
function ensureSettings(s) {
  for (const uid in (s.users || {})) {
    const user = s.users[uid];
    user.settings = user.settings || {};
    if (user.settings.newPerDay === undefined) user.settings.newPerDay = 10;
    if (user.settings.dailyCap  === undefined) user.settings.dailyCap  = 30;
    if (!user.settings.cardMode) user.settings.cardMode = 'type';
    if (!user.settings.cardSource) user.settings.cardSource = 'sentences';
    if (user.settings.ttsRate   === undefined) user.settings.ttsRate   = 0.9;
    if (user.settings.theme     === undefined) user.settings.theme     = 'dark';
    if (user.settings.bgImage   === undefined) user.settings.bgImage   = null; // data URL or null
    if (user.settings.bgOverlay === undefined) user.settings.bgOverlay = 0.5;  // 0..0.85
  }
}

// Chunk 3a runtime defaults — global fields. Idempotent.
function ensureChunk3a(s) {
  if (!s.testPacks) s.testPacks = {};
  if (s.lastBackup === undefined) s.lastBackup = null;
}

// testAttempts is per-user in v3. Walk every user and rewrite any
// remaining 4-part keys to 5-part `lang::story::tierN::builtin::idx`.
function migrateTestAttempts(s) {
  for (const uid in (s.users || {})) {
    const user = s.users[uid];
    if (!user.testAttempts) { user.testAttempts = {}; continue; }
    let migrated = 0;
    const updated = {};
    for (const [key, val] of Object.entries(user.testAttempts)) {
      const parts = key.split('::');
      if (parts.length === 4) {
        const [lang, story, tier, idx] = parts;
        updated[`${lang}::${story}::${tier}::builtin::${idx}`] = val;
        migrated++;
      } else {
        updated[key] = val;
      }
    }
    if (migrated > 0) user.testAttempts = updated;
  }
}

/* ============================================================
   CHUNK 3A — Toasts, file I/O, validators, backup, modals.
   ============================================================ */

// Toast stack — auto-dismiss after 3s, slide-down exit animation.
function showToast(message, variant = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const t = document.createElement('div');
  t.className = `toast ${variant}`;
  t.textContent = message;
  stack.appendChild(t);
  setTimeout(() => {
    t.classList.add('exiting');
    setTimeout(() => t.remove(), 250);
  }, 3000);
}

// Open a native file picker, parse JSON, hand off to callback.
function importJSONFile(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        callback(data);
      } catch {
        showToast('Invalid JSON file', 'error');
      }
    };
    reader.onerror = () => showToast('Could not read file', 'error');
    reader.readAsText(file);
  };
  input.click();
}

/* Multi-file picker — accepts a JSON file and (optionally) an image.
   The user can select both at once (Cmd/Shift-click in a file picker)
   to attach a cover image when adding a language or story. Callback
   gets (json, imageDataUrl). Either argument may be null. */
function importJSONWithImage(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json,image/*';
  input.multiple = true;
  input.onchange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let json = null;
    let imageRaw = null;
    let pending = files.length;
    const finish = async () => {
      if (--pending > 0) return;
      let imageOut = null;
      if (imageRaw) {
        try { imageOut = await downsizeImage(imageRaw, 1280, 720, 0.75); }
        catch { imageOut = imageRaw; }
      }
      callback(json, imageOut);
    };
    files.forEach(file => {
      const isJson = file.type === 'application/json' || /\.json$/i.test(file.name);
      const isImage = file.type.startsWith('image/');
      if (!isJson && !isImage) { finish(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        if (isJson) {
          try { json = JSON.parse(reader.result); }
          catch { showToast('Invalid JSON file', 'error'); }
        } else if (isImage) {
          imageRaw = reader.result;
        }
        finish();
      };
      reader.onerror = () => finish();
      if (isJson) reader.readAsText(file);
      else reader.readAsDataURL(file);
    });
  };
  input.click();
}

/* Single image picker — used when adding/changing a cover after
   the language/story is already imported. Callback gets a downsized
   JPEG data URL. */
function importImageFile(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const small = await downsizeImage(reader.result, 1280, 720, 0.75);
        callback(small);
      } catch {
        callback(reader.result);
      }
    };
    reader.onerror = () => showToast('Could not read image', 'error');
    reader.readAsDataURL(file);
  };
  input.click();
}

/* Downsize an image to fit within (maxW × maxH) and re-encode as
   JPEG at the given quality. Keeps localStorage usage manageable —
   a typical phone photo (~3 MB) shrinks to ~80 KB. */
function downsizeImage(dataUrl, maxW, maxH, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const ratio = Math.min(maxW / width, maxH / height, 1);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Trigger a browser download of a string blob.
function downloadBlob(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Validators — return { valid, errors[] } ---------- */
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const LANG_ID_RE = /^[a-z]{2,5}$/;
// Accept both legacy ids (`story-1`, `story-foo`) and the new spec
// shape (`it-a1-s01`, `de-a1-s03`, etc). Any kebab-case id starting
// with a letter is allowed.
const STORY_ID_RE = /^[a-z][a-z0-9-]+$/;
const PACK_ID_RE = /^[a-z0-9-]+$/;
const THEME_FIELDS = ['gradient1', 'gradient2', 'gradient3', 'bgFrom', 'bgVia', 'bgTo', 'accent'];

function validateLanguage(json) {
  const errors = [];
  if (!json || typeof json !== 'object') errors.push('Not a JSON object');
  else {
    if (json.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!LANG_ID_RE.test(json.id || '')) errors.push('id must match /^[a-z]{2,5}$/');
    if (state.languages[json.id]) errors.push(`Language "${json.id}" already exists`);
    if (!json.name || typeof json.name !== 'string') errors.push('name required');
    if (!json.flag || typeof json.flag !== 'string') errors.push('flag required');
    if (!json.ttsLang || typeof json.ttsLang !== 'string') errors.push('ttsLang required');
    if (!json.theme || typeof json.theme !== 'object') errors.push('theme object required');
    else {
      for (const f of THEME_FIELDS) {
        if (!HEX6.test(json.theme[f] || '')) errors.push(`theme.${f} must be a 6-digit hex color`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateStory(json) {
  const errors = [];
  if (!json || typeof json !== 'object') errors.push('Not a JSON object');
  else {
    if (json.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!json.languageId || !state.languages[json.languageId])
      errors.push(`languageId "${json.languageId}" not installed`);
    if (!STORY_ID_RE.test(json.id || '')) errors.push('id must match /^story-[a-z0-9-]+$/');
    if (!json.title || typeof json.title !== 'string') errors.push('title required');
    if (!json.level || typeof json.level !== 'string') errors.push('level required');
    if (!Array.isArray(json.sentences) || json.sentences.length === 0)
      errors.push('sentences[] non-empty required');
    else json.sentences.forEach((s, i) => {
      if (!s || typeof s.de !== 'string' || typeof s.en !== 'string')
        errors.push(`sentences[${i}] needs de + en strings`);
    });
    if (!Array.isArray(json.grammarRules)) errors.push('grammarRules[] required');
    else json.grammarRules.forEach((r, i) => {
      if (!r.name) errors.push(`grammarRules[${i}].name required`);
      if (![1, 2, 3].includes(r.tier)) errors.push(`grammarRules[${i}].tier must be 1, 2, or 3`);
      if (!r.desc) errors.push(`grammarRules[${i}].desc required`);
      // Optional Rules-tab fields (chunk-3a-patch). Validate shape if
      // present; missing is fine — old story JSONs stay valid.
      if (r.longExplanation !== undefined && typeof r.longExplanation !== 'string')
        errors.push(`grammarRules[${i}].longExplanation must be a string`);
      if (r.examples !== undefined) {
        if (!Array.isArray(r.examples)) errors.push(`grammarRules[${i}].examples must be an array`);
        else r.examples.forEach((ex, j) => {
          if (!ex || typeof ex.de !== 'string' || typeof ex.en !== 'string')
            errors.push(`grammarRules[${i}].examples[${j}] needs de + en strings`);
        });
      }
      if (r.tips !== undefined && !Array.isArray(r.tips))
        errors.push(`grammarRules[${i}].tips must be an array of strings`);
      // Optional `table` for paradigm-friendly rules. Shape:
      // { title?: str, headers: [str], rows: [[str]], note?: str }.
      if (r.table !== undefined) {
        const t = r.table;
        if (!t || typeof t !== 'object') errors.push(`grammarRules[${i}].table must be an object`);
        else {
          if (!Array.isArray(t.headers)) errors.push(`grammarRules[${i}].table.headers must be an array`);
          if (!Array.isArray(t.rows)) errors.push(`grammarRules[${i}].table.rows must be a 2D array`);
          else t.rows.forEach((row, k) => {
            if (!Array.isArray(row)) errors.push(`grammarRules[${i}].table.rows[${k}] must be an array`);
          });
        }
      }
    });
    // Optional vocabulary[] — author-curated word list. Each item
    // needs `de` + `en`; everything else is optional metadata.
    if (json.vocabulary !== undefined) {
      if (!Array.isArray(json.vocabulary)) errors.push('vocabulary must be an array');
      else json.vocabulary.forEach((v, i) => {
        if (!v || typeof v.de !== 'string' || typeof v.en !== 'string')
          errors.push(`vocabulary[${i}] needs de + en strings`);
      });
    }
    if (!Array.isArray(json.grammarTests)) errors.push('grammarTests[] required');
    else json.grammarTests.forEach((t, i) => {
      if (![1, 2, 3].includes(t.tier)) errors.push(`grammarTests[${i}].tier must be 1, 2, or 3`);
      if (!t.rule) errors.push(`grammarTests[${i}].rule required`);
      if (!t.en || !t.de) errors.push(`grammarTests[${i}] needs en + de`);
    });
  }
  return { valid: errors.length === 0, errors };
}

function validateTestPack(json) {
  const errors = [];
  const warnings = [];
  if (!json || typeof json !== 'object') errors.push('Not a JSON object');
  else {
    if (json.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (json.type !== 'test-pack') errors.push('type must be "test-pack"');
    if (!json.languageId || !state.languages[json.languageId])
      errors.push(`languageId "${json.languageId}" not installed`);
    const story = json.languageId && json.storyId
      ? state.storiesData[`${json.languageId}::${json.storyId}`] : null;
    if (!story) errors.push(`storyId "${json.storyId}" not found under that language`);
    if (!PACK_ID_RE.test(json.id || '')) errors.push('id must match /^[a-z0-9-]+$/');
    if (json.languageId && state.testPacks[`${json.languageId}::${json.id}`])
      errors.push(`Test pack "${json.id}" already exists for this language`);
    if (!Array.isArray(json.tests) || json.tests.length === 0)
      errors.push('tests[] non-empty required');
    else json.tests.forEach((t, i) => {
      if (![1, 2, 3].includes(t.tier)) errors.push(`tests[${i}].tier must be 1, 2, or 3`);
      if (!t.rule) errors.push(`tests[${i}].rule required`);
      if (!t.en || !t.de) errors.push(`tests[${i}] needs en + de`);
    });
    // Soft-warn when rule names don't match the story's grammarRules.
    if (story && Array.isArray(json.tests)) {
      const known = new Set(story.grammarRules.map(r => r.name));
      for (const t of json.tests) {
        if (t.rule && !known.has(t.rule)) {
          warnings.push(`Rule "${t.rule}" is not in this story's grammarRules`);
          break;
        }
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

/* ---------- Generic modal helpers ---------- */
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

// Yes/no confirmation modal — resolves true on confirm, false on cancel.
function confirmModal({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const btnClass = danger ? 'danger-btn' : 'gradient-btn';
    root.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="glass modal">
          <div class="modal-title">${escapeHtml(title)}</div>
          <div class="modal-body"><p>${body}</p></div>
          <div class="btn-row">
            <button class="ghost-btn" id="m-cancel" style="flex:1">Cancel</button>
            <button class="${btnClass}" id="m-confirm" style="flex:1">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>`;
    const finish = (val) => { closeModal(); resolve(val); };
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') finish(false);
    });
    document.getElementById('m-cancel').addEventListener('click', () => finish(false));
    document.getElementById('m-confirm').addEventListener('click', () => finish(true));
  });
}

// Text-confirmation modal — user must type `expected` to confirm.
function textConfirmModal({ title, body, expected, confirmLabel = 'Confirm' }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="glass modal">
          <div class="modal-title">${escapeHtml(title)}</div>
          <div class="modal-body">
            <p>${body}</p>
            <input type="text" id="m-input" autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(expected)}">
          </div>
          <div class="btn-row">
            <button class="ghost-btn" id="m-cancel" style="flex:1">Cancel</button>
            <button class="danger-btn" id="m-confirm" style="flex:1" disabled>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>`;
    const inp = document.getElementById('m-input');
    const cBtn = document.getElementById('m-confirm');
    const finish = (val) => { closeModal(); resolve(val); };
    inp.addEventListener('input', () => {
      cBtn.disabled = inp.value.trim() !== expected;
      cBtn.style.opacity = cBtn.disabled ? '0.5' : '1';
    });
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') finish(false);
    });
    document.getElementById('m-cancel').addEventListener('click', () => finish(false));
    cBtn.addEventListener('click', () => {
      if (!cBtn.disabled) finish(true);
    });
    try { inp.focus(); } catch {}
  });
}

/* ---------- Backup export / import ---------- */
function exportBackup() {
  state.lastBackup = Date.now();
  saveState();
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(`storyglot-backup-${date}.json`, JSON.stringify(state, null, 2));
  showToast('Backup exported', 'success');
  render();
}

async function importBackup(data) {
  if (!data || typeof data !== 'object') {
    showToast('Backup file is not valid JSON', 'error');
    return;
  }
  const ver = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (ver > CURRENT_SCHEMA) {
    showToast('Backup is from a newer version. Please update the app.', 'error');
    return;
  }
  const ok = await confirmModal({
    title: 'Replace all data?',
    body: 'This will overwrite ALL current progress, languages, and stories with the imported backup. This cannot be undone.',
    confirmLabel: 'Replace',
    danger: true
  });
  if (!ok) return;
  try {
    let migrated = data;
    if (ver < CURRENT_SCHEMA) migrated = migrate(migrated);
    ensureBuiltins(migrated);
    ensureSettings(migrated);
    ensureChunk3a(migrated);
    migrateTestAttempts(migrated);
    ensureCards(migrated);
    replaceRawState(migrated);     // mutate in place — proxy keeps working
    cardSession = null;
    testSession = null;
    loggedIn = false;              // imported backup may have a different user; force login
    saveState();
    render();                      // shows login picker
    showToast('Backup imported', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to import backup', 'error');
  }
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = defaultState();
  ensureBuiltins(fresh);
  ensureSettings(fresh);
  ensureChunk3a(fresh);
  ensureCards(fresh);
  replaceRawState(fresh);
  cardSession = null;
  testSession = null;
  loggedIn = false;                // back to picker after reset
  saveState();
  render();
  showToast('All data reset', 'info');
}
