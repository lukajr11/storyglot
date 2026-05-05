'use strict';

/* Theme application + Web Speech TTS + local audio file fallback (spec §2.4). */

/* ============================================================
   THEME — write CSS variables on :root.
   ============================================================ */
function applyTheme(theme) {
  const r = document.documentElement.style;
  r.setProperty('--bg-from', theme.bgFrom);
  r.setProperty('--bg-via', theme.bgVia);
  r.setProperty('--bg-to', theme.bgTo);
  r.setProperty('--grad-1', theme.gradient1);
  r.setProperty('--grad-2', theme.gradient2);
  r.setProperty('--grad-3', theme.gradient3);
  r.setProperty('--accent', theme.accent);
  // Re-apply user wallpaper after theme change so the inline body bg
  // stays correct; theme palette is rendered via :root vars and the
  // body background is overridden when a custom image is set.
  applyBackgroundImage();
}

/* Per-user wallpaper. When a bgImage is set we override body's
   background with `linear-gradient(black-overlay), url(image)` so
   the photo stays readable; otherwise we clear the inline style and
   the theme's radial gradient takes over. Cosmic-glow blobs on
   body::before remain in either case. */
function applyBackgroundImage() {
  const body = document.body;
  if (!body) return;
  const s = (state && state.settings) || {};

  // While drilled into a language, that language's cover takes over
  // as the body background — feels like "entering" the book. Falls
  // back to the user's general wallpaper at the top-level library /
  // anywhere libraryDrilledIn isn't set. The user wallpaper overlay
  // (s.bgOverlay) still controls dimming when in use; the language
  // cover uses a fixed 0.45 dark overlay so text reads cleanly.
  let img = s.bgImage || null;
  let overlay = (s.bgOverlay == null) ? 0.5 : Number(s.bgOverlay);
  if (state && state.libraryDrilledIn) {
    const lang = state.languages && state.languages[state.libraryDrilledIn];
    if (lang && lang.coverImage) {
      img = lang.coverImage;
      overlay = 0.45;
    }
  }

  if (img) {
    body.style.backgroundImage = `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), url('${img}')`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center center';
    body.style.backgroundAttachment = 'fixed';
    body.style.backgroundRepeat = 'no-repeat';
    body.classList.add('has-bg-image');
  } else {
    body.style.backgroundImage = '';
    body.style.backgroundSize = '';
    body.style.backgroundPosition = '';
    body.style.backgroundAttachment = '';
    body.style.backgroundRepeat = '';
    body.classList.remove('has-bg-image');
  }
}

/* ============================================================
   TTS — Web Speech API. iOS Safari requires speak() to be
   triggered from a user gesture; we only call it from button
   and row click handlers, never on load.
   ============================================================ */
let voices = [];
function loadVoices() {
  try { voices = window.speechSynthesis.getVoices() || []; } catch { voices = []; }
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(langCode) {
  if (!voices.length) loadVoices();
  // Prefer the user-selected voice for the active language if it
  // matches the langCode prefix (e.g., set in Settings → Voice).
  try {
    const lang = state && state.languages
      ? state.languages[state.activeLanguageId] : null;
    if (lang && lang.ttsVoice) {
      const chosen = voices.find(v => v.name === lang.ttsVoice);
      if (chosen && chosen.lang && chosen.lang.toLowerCase()
          .startsWith(langCode.split('-')[0].toLowerCase())) {
        return chosen;
      }
    }
  } catch {}
  const prefix = langCode.split('-')[0].toLowerCase();
  const matches = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
  if (!matches.length) return null;
  // Quality sort: macOS premium/enhanced/neural voices sound far less
  // robotic than the default. Boost names containing those markers,
  // then prefer localService voices, then exact-locale matches.
  const score = (v) => {
    let s = 0;
    const n = (v.name || '').toLowerCase();
    if (/(premium|enhanced|neural|natural|siri)/.test(n)) s += 100;
    if (v.localService) s += 10;
    if (v.lang === langCode) s += 5;
    if (v.default) s -= 1; // default is often the lowest-quality fallback
    return s;
  };
  return matches.slice().sort((a, b) => score(b) - score(a))[0];
}

function speak(text, langCode, opts = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    // Substitute {{PROTAGONIST}} so TTS doesn't read the literal token
    // even if a caller passed unprocessed text.
    const spoken = substituteProtagonist(String(text || ''));
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = langCode;
    // Default rate comes from global settings; explicit opts.rate wins.
    const fallbackRate = (state && state.settings && state.settings.ttsRate) || 0.9;
    u.rate = opts.rate ?? fallbackRate;
    const v = pickVoice(langCode);
    if (v) u.voice = v;
    // iOS sometimes never fires onend — resolve on error too.
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

function stopSpeak() {
  try { window.speechSynthesis.cancel(); } catch {}
}

/* ============================================================
   LOCAL AUDIO FILES — UX spec §2.4 fallback chain.
   Drop MP3s under audio/{langId}/{storyId}/sentences/NNN.mp3
   (1-indexed, 3-digit) and the renderer prefers them over the
   robotic Web Speech voices. Atmosphere intro is similarly
   audio/{langId}/{storyId}/atmosphere.mp3. Missing files quietly
   fall back to speak() so the app keeps working with no asset
   authoring.
   ============================================================ */

// Per-key playback status: 'available' | 'missing'. Probed once per
// file URL and cached for the page session.
const audioStatus = {};
// Active <audio> element so stopPlayAll can pause it on cancel.
let activeAudio = null;

function audioPathSentence(langId, storyId, idx) {
  const num = String((idx | 0) + 1).padStart(3, '0');
  return `audio/${langId}/${storyId}/sentences/${num}.mp3`;
}
function audioPathAtmosphere(langId, storyId) {
  return `audio/${langId}/${storyId}/atmosphere.mp3`;
}

// When a sentence contains {{PROTAGONIST}} AND the chosen name differs
// from the canonical-recording name, point at the per-name variant.
// Returns null if the canonical recording is correct for the chosen name.
function audioPathSentenceVariant(langId, storyId, idx) {
  const story = state && state.storiesData && state.storiesData[`${langId}::${storyId}`];
  const original = story && story.sentences && story.sentences[idx] && story.sentences[idx].de;
  if (!original || !original.includes('{{PROTAGONIST}}')) return null;
  const lang = state && state.languages && state.languages[langId];
  const chosen = lang && lang.protagonistName;
  const canonical = lang && lang.defaultProtagonist;
  if (!chosen || !canonical || chosen === canonical) return null;
  const num = String((idx | 0) + 1).padStart(3, '0');
  return `audio/${langId}/${storyId}/sentences/_proto/${encodeURIComponent(chosen)}/${num}.mp3`;
}

// Play a recorded sentence audio file if present; otherwise speak via
// Web Speech. Returns a Promise that resolves when playback ends or
// is cancelled. Re-entrant: prior playback should have been cancelled
// by the caller (typically via stopPlayAll).
function playSentenceFile(langId, storyId, idx, fallbackText, langCode) {
  // Prefer the protagonist-specific recording when one applies; if it
  // turns out to be missing we fall back transparently to Web Speech
  // (which sees the substituted name) rather than the canonical
  // recording, since that recording has the wrong name baked in.
  const variantPath = audioPathSentenceVariant(langId, storyId, idx);
  const path = variantPath || audioPathSentence(langId, storyId, idx);
  if (audioStatus[path] === 'missing') {
    return speak(fallbackText, langCode);
  }
  return new Promise((resolve) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.playbackRate = (state && state.settings && state.settings.ttsRate) || 1;
    let resolved = false;
    let errored = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    // Both audio.onerror and the rejected play() promise can fire for
    // the same missing file — guard so we only fall back once.
    const onError = () => {
      if (errored) return;
      errored = true;
      audioStatus[path] = 'missing';
      activeAudio = null;
      speak(fallbackText, langCode).then(finish);
    };
    audio.onended  = () => { audioStatus[path] = 'available'; activeAudio = null; finish(); };
    audio.onerror  = onError;
    audio.oncanplay = () => { audioStatus[path] = 'available'; };
    activeAudio = audio;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(onError);
  });
}

// Generic local-file-or-TTS for non-sentence text (e.g. atmosphere
// intro). `path` is checked first; on miss the spoken text is used.
function playFileOrSpeak(path, fallbackText, langCode) {
  if (audioStatus[path] === 'missing') return speak(fallbackText, langCode);
  return new Promise((resolve) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    let resolved = false;
    let errored = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    const onError = () => {
      if (errored) return;
      errored = true;
      audioStatus[path] = 'missing';
      activeAudio = null;
      speak(fallbackText, langCode).then(finish);
    };
    audio.onended = () => { audioStatus[path] = 'available'; activeAudio = null; finish(); };
    audio.onerror = onError;
    audio.oncanplay = () => { audioStatus[path] = 'available'; };
    activeAudio = audio;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(onError);
  });
}

// Probe a single sentence file without playing it. HEAD-style via
// <audio>'s metadata-loaded event. Used by the Settings audio panel.
function probeAudio(path) {
  if (audioStatus[path]) return Promise.resolve(audioStatus[path]);
  return new Promise((resolve) => {
    const a = new Audio(path);
    a.preload = 'metadata';
    const done = (status) => { audioStatus[path] = status; resolve(status); };
    a.onloadedmetadata = () => done('available');
    a.onerror = () => done('missing');
    // Safety timeout — some browsers stall on file://.
    setTimeout(() => { if (!audioStatus[path]) done('missing'); }, 1500);
  });
}

function stopActiveAudio() {
  if (activeAudio) {
    try { activeAudio.pause(); activeAudio.currentTime = 0; } catch {}
    activeAudio = null;
  }
}
