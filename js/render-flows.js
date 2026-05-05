'use strict';

/* First-read 6-step flow + drill flow + free-practice hub & sub-modes. */

/* ============================================================
   FIRST-READ FLOW — 6 fixed steps per UX spec §4.
   Step 1 atmosphere listen, Step 2 grammar preview,
   Step 3 sentence walk, Step 4 vocab walk,
   Step 5 closing listen, Step 6 drill-flow unlock.
   Progress per (user, lang, story) lives on lang.storyProgress[storyId].
   ============================================================ */

function frStepLabel(step) {
  return ({
    1: 'Atmosphere',
    2: 'Grammar preview',
    3: 'Sentence walk',
    4: 'Vocab walk',
    5: 'Closing listen',
    6: 'Drill flow unlocked'
  })[step] || '';
}

function frStepPill(step) {
  // Top bar: step indicator + always-visible save-and-exit. State is
  // already persisted on every setStoryProgress, so the button just
  // navigates back; resuming the story drops the learner exactly here.
  return `
    <div class="fr-top-row">
      <div class="fr-step-pill">Step ${step} of 6 · ${escapeHtml(frStepLabel(step))}</div>
      <button class="ghost-btn fr-exit-btn" data-fr-exit="1" title="Progress is saved automatically">Save &amp; exit</button>
    </div>
  `;
}

// Vocabulary words flagged "new" for this story. Falls back to all
// vocab if normalization didn't tag a status (legacy stories).
function getNewVocab(story) {
  const all = Array.isArray(story.vocabulary) ? story.vocabulary : [];
  const flagged = all.filter(v => v && v._status === 'new');
  return flagged.length ? flagged : all;
}

// Grammar rules flagged "new" for this story. Same fallback shape.
function getNewGrammar(story) {
  const rules = Array.isArray(story.grammarRules) ? story.grammarRules : [];
  const flagged = rules.filter(r => r && r._status === 'new');
  return flagged.length ? flagged : rules.filter(r => r.tier === 1);
}

function renderFirstRead(lang, story, progress) {
  const step = Math.min(Math.max(progress.firstReadStep || 1, 1), 6);
  switch (step) {
    case 1: return renderFRStep1(lang, story, progress);
    case 2: return renderFRStep2(lang, story, progress);
    case 3: return renderFRStep3(lang, story, progress);
    case 4: return renderFRStep4(lang, story, progress);
    case 5: return renderFRStep5(lang, story, progress);
    case 6: return renderFRStep6(lang, story, progress);
    default: return renderFRStep1(lang, story, progress);
  }
}

/* Step 1 — Atmosphere listen.
   intro phase: cover + EN atmosphere intro plays.
   narration phase: cover + IT sentences, sync-highlighted, EN toggle.
   done phase: cover + soft message + Continue. */
function renderFRStep1(lang, story, progress) {
  const phase = progress.step1Phase || 'intro';
  const coverHtml = renderStoryCover(lang.id, story) ||
    `<div class="story-cover" style="background: linear-gradient(135deg, var(--grad-1), var(--grad-3));"></div>`;
  const intro = story._atmosphereIntro || story.synopsis || '';
  const narratorPrompt = lang.id === 'it' ? '' : '';

  if (phase === 'intro') {
    return `
      ${frStepPill(1)}
      <div class="fr-cover-wrap">${coverHtml}</div>
      <div class="glass fr-listen-card">
        <div class="fr-pulse"><span></span><span></span><span></span></div>
        <div class="fr-listen-title">Setting the scene…</div>
        <div class="fr-listen-sub">Listen — no need to read.</div>
        <div class="fr-listen-actions">
          <button class="ghost-btn" data-fr-replay-intro="1">🔊 Replay</button>
          <button class="ghost-btn" data-fr-skip-to="narration">Skip to story →</button>
        </div>
      </div>
    `;
  }

  if (phase === 'narration') {
    const showEng = !!progress.showEnglish;
    const rows = story.sentences.map((s, i) => `
      <div class="fr-narr-row" data-sent-idx="${i}">
        <div class="de">${escapeHtml(s.de)}</div>
        ${showEng ? `<div class="en">${escapeHtml(s.en)}</div>` : ''}
      </div>
    `).join('');
    return `
      ${frStepPill(1)}
      <div class="fr-cover-wrap fr-cover-thin">${coverHtml}</div>
      <div class="play-bar">
        <button class="gradient-btn" id="btn-play-all">${playback.active ? '⏹  Stop' : '🔊  Listen to the story'}</button>
        <button class="ghost-btn fr-eng-toggle" data-fr-toggle-english="1">${showEng ? 'EN: on' : 'EN: off'}</button>
      </div>
      <div class="glass fr-narration-list">${rows}</div>
      <button class="ghost-btn full-btn" data-fr-skip-to="done">I'm ready to continue →</button>
    `;
  }

  // done
  return `
    ${frStepPill(1)}
    <div class="fr-cover-wrap">${coverHtml}</div>
    <div class="glass fr-soft-card">
      <div class="fr-soft-title">${escapeHtml(story.title)}</div>
      <div class="fr-soft-msg">Don't worry if you didn't grasp it all — you'll go through this sentence by sentence next.</div>
      <button class="gradient-btn full-btn" data-fr-continue="1">Continue →</button>
    </div>
  `;
}

/* Step 2 — Grammar preview. Reuses the rich renderRuleCard so the
   learner sees the same explanation + examples + tips + paradigm
   tables they'll meet in the Rules tab — no formal sparse text. */
function renderFRStep2(lang, story, progress) {
  const rules = getNewGrammar(story);
  const list = rules.length
    ? rules.map(r => renderRuleCard(r, r.tier || 1)).join('')
    : `<div class="glass empty-state">No new grammar in this chapter — straight to the sentences.</div>`;

  return `
    ${frStepPill(2)}
    <div class="fr-section-intro">A quick look at what's new before you start.</div>
    ${list}
    <button class="gradient-btn full-btn" data-fr-continue="1">Continue →</button>
  `;
}

/* Step 3 — Sentence walk. One sentence at a time. New vocab
   highlighted; tap → translation popover. Progress "12 / N". */
function renderFRStep3(lang, story, progress) {
  const sentences = story.sentences || [];
  const n = sentences.length;
  const idx = Math.min(Math.max(progress.sentenceIdx || 0, 0), Math.max(0, n - 1));
  const s = sentences[idx];
  if (!s) return `<div class="glass empty-state">No sentences in this story.</div>`;

  const newVocab = getNewVocab(story);
  // Mark vocabulary tokens by simple word-boundary substitution.
  // Uses dotted underline + tap-to-translate.
  const markedDe = markVocabInSentence(s.de, newVocab);

  const isLast = idx === n - 1;
  const prevDisabled = idx === 0 ? 'disabled' : '';
  const nextLabel = isLast ? 'Continue →' : 'Next →';

  return `
    ${frStepPill(3)}
    <div class="fr-progress-line">${idx + 1} / ${n}</div>
    <div class="glass fr-sentence-card">
      <div class="fr-sentence-de">${markedDe}</div>
      <div class="fr-sentence-en">${escapeHtml(s.en)}</div>
      <div class="audio-row">
        <button class="audio-btn" data-fr-speak="${escapeHtml(s.de)}" data-sent-idx="${idx}">🔊 ${speakLabelForActive()}</button>
      </div>
      ${s.note ? `<div class="note-callout">${escapeHtml(s.note)}</div>` : ''}
    </div>
    <div id="fr-vocab-popover" class="fr-vocab-popover" style="display:none;"></div>
    <div class="fr-nav-row">
      <button class="ghost-btn" data-fr-sent-prev="1" ${prevDisabled}>← Prev</button>
      <button class="gradient-btn" data-fr-sent-next="1">${nextLabel}</button>
    </div>
  `;
}

// Wrap each new-vocab head word inside the sentence with a tappable
// span. Cheap, case-insensitive, whole-word match. Renders escaped.
// Protagonist substitution must happen up front: the tokenizer below
// would otherwise slice "{{PROTAGONIST}}" into "{{" / "PROTAGONIST" /
// "}}", and escapeHtml's substitution (keyed on the full literal)
// would no longer match.
function markVocabInSentence(sentence, newVocab) {
  const text = substituteProtagonist(String(sentence || ''));
  if (!newVocab || !newVocab.length) return escapeHtml(text);
  // Build a map from lowercased base word → translation. We match
  // tokens character-by-character to preserve original casing/diacritics.
  const dict = {};
  newVocab.forEach(v => {
    const w = String(v.de || '').toLowerCase().trim();
    if (w) dict[w] = v;
  });
  // Tokenize on Unicode word boundaries that keep accented letters.
  const out = [];
  const re = /([\p{L}\p{M}'’]+)|([^\p{L}\p{M}'’]+)/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      const lower = m[1].toLowerCase();
      if (dict[lower]) {
        const v = dict[lower];
        const trans = v.en || v.translation || '';
        out.push(`<span class="fr-vocab-mark" data-fr-vocab="${escapeHtml(m[1])}" data-fr-vocab-trans="${escapeHtml(trans)}">${escapeHtml(m[1])}</span>`);
      } else {
        out.push(escapeHtml(m[1]));
      }
    } else if (m[2]) {
      out.push(escapeHtml(m[2]));
    }
  }
  return out.join('');
}

/* Step 4 — Vocab walk. One word at a time. Word + translation +
   pos + audio + first sentence containing it. */
function renderFRStep4(lang, story, progress) {
  const vocab = getNewVocab(story);
  const n = vocab.length;
  if (!n) {
    return `
      ${frStepPill(4)}
      <div class="glass empty-state">No new vocabulary tracked for this story.</div>
      <button class="gradient-btn full-btn" data-fr-continue="1">Continue →</button>
    `;
  }
  const idx = Math.min(Math.max(progress.vocabIdx || 0, 0), n - 1);
  const v = vocab[idx];

  // First sentence containing this word (whole-word match).
  const sentences = story.sentences || [];
  const firstSent = findFirstSentenceWith(sentences, v.de);
  const sentHtml = firstSent
    ? `<div class="fr-vocab-context">${markVocabInSentence(firstSent.de, [v])}</div>
       <div class="fr-vocab-context-en">${escapeHtml(firstSent.en)}</div>`
    : '';

  const speakText = vocabSpeakText(v);
  const posLabel = v.pos ? `${v.pos}${v.gender ? ' · ' + v.gender : ''}` : (v.gender || '');

  const isLast = idx === n - 1;
  const prevDisabled = idx === 0 ? 'disabled' : '';
  const nextLabel = isLast ? 'Continue →' : 'Next →';

  return `
    ${frStepPill(4)}
    <div class="fr-progress-line">${idx + 1} / ${n}</div>
    <div class="glass fr-vocab-card">
      ${posLabel ? `<div class="fr-vocab-pos"><span class="rule-tag">${escapeHtml(posLabel)}</span></div>` : ''}
      <div class="fr-vocab-word gradient-text">${escapeHtml(v.de)}</div>
      <div class="fr-vocab-en">${escapeHtml(v.en || '')}</div>
      <div class="audio-row">
        <button class="audio-btn" data-fr-speak="${escapeHtml(speakText)}">🔊 ${speakLabelForActive()}</button>
      </div>
      ${sentHtml}
    </div>
    <div class="fr-nav-row">
      <button class="ghost-btn" data-fr-vocab-prev="1" ${prevDisabled}>← Prev</button>
      <button class="gradient-btn" data-fr-vocab-next="1">${nextLabel}</button>
    </div>
  `;
}

function findFirstSentenceWith(sentences, word) {
  const target = String(word || '').toLowerCase();
  if (!target) return null;
  const re = new RegExp(`(?:^|[^\\p{L}\\p{M}])${escapeRegExp(target)}(?:[^\\p{L}\\p{M}]|$)`, 'iu');
  for (const s of sentences) {
    if (re.test(String(s.de || '').toLowerCase())) return s;
  }
  return null;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Step 5 — Closing listen. Cover + IT-only narration, no subtitles.
   Audio auto-plays on enter; "Done" appears when playback finishes. */
function renderFRStep5(lang, story, progress) {
  const coverHtml = renderStoryCover(lang.id, story) ||
    `<div class="story-cover" style="background: linear-gradient(135deg, var(--grad-1), var(--grad-3));"></div>`;
  const finished = !!progress.step5Finished;
  return `
    ${frStepPill(5)}
    <div class="fr-cover-wrap">${coverHtml}</div>
    <div class="glass fr-listen-card">
      <div class="fr-pulse"><span></span><span></span><span></span></div>
      <div class="fr-listen-title">${finished ? "You've finished your first read." : 'Listen one more time…'}</div>
      <div class="fr-listen-sub">${finished ? 'Come back tomorrow to start practicing.' : 'No subtitles. Notice what you understand.'}</div>
      <div class="fr-listen-actions">
        <button class="ghost-btn" data-fr-replay-closing="1">🔊 ${playback.active ? 'Stop' : (finished ? 'Replay' : 'Play')}</button>
      </div>
    </div>
    ${finished ? `<button class="gradient-btn full-btn" data-fr-continue="1">Done →</button>` : ''}
  `;
}

/* Step 6 — Drill flow unlocks. Renders a brief celebration; phase
   gets bumped to 'drill-flow' so subsequent renders fall through to
   the legacy reader (Stage D will replace). */
function renderFRStep6(lang, story, progress) {
  // Auto-promote on first render of step 6.
  if (progress.phase === 'first-read') {
    setStoryProgress(lang.id, story.id, {
      phase: 'drill-flow',
      firstReadDone: true
    });
  }
  return `
    ${frStepPill(6)}
    <div class="glass fr-celebrate">
      <div class="fr-celebrate-icon">✦</div>
      <div class="fr-celebrate-title gradient-text">First read complete</div>
      <div class="fr-celebrate-msg">The drill flow is now unlocked. Come back tomorrow for the first drill.</div>
      <button class="gradient-btn full-btn" data-fr-finish="1">Back to library</button>
    </div>
  `;
}

/* ============================================================
   DRILL FLOW — Stage D. Six gated drills per UX spec §5. Each drill
   has a linear queue + completion check; finishing all six promotes
   the story to free-practice and unlocks the next story.
   Drill 1: vocab recognition (SRS)
   Drill 2: vocab production (EN→IT typed)
   Drill 3: sentence assembly (word tiles)
   Drill 4: dictation (TTS → type)
   Drill 5: rule spotting (multi-choice)
   Drill 6: transfer test (tier 1, with mastery threshold)
   ============================================================ */

const DRILL_NAMES = {
  1: 'Vocab recognition',
  2: 'Vocab production',
  3: 'Sentence assembly',
  4: 'Dictation',
  5: 'Rule spotting',
  6: 'Transfer test'
};

// Drill 1 mastery: 3 successful reviews + interval ≥ 3 days (per spec §7.1).
const DRILL1_MIN_REPS = 3;
const DRILL1_MIN_INTERVAL_DAYS = 3;
// Drill 2: each word answered correctly twice in a row.
const DRILL2_REQUIRED_STREAK = 2;

/* ----- Submission normalization (drills 2 + 4 per spec §5) -----
   Strip diacritics, apostrophes, collapse whitespace, lowercase. */
function normalizeForDrill(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')        // strip combining diacritics
    .replace(/['’‘`]/g, '')       // strip apostrophes (incl. curly)
    .replace(/[.,!?;:"()«»\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
// Loose-equality check: matches even if learner skipped accents/apostrophes.
function drillAnswerMatches(submitted, expected) {
  return normalizeForDrill(submitted) === normalizeForDrill(expected);
}
// Diacritic-only difference (for soft-correct messages).
function drillSpellingDiffers(submitted, expected) {
  return submitted.trim() !== expected.trim() &&
         drillAnswerMatches(submitted, expected);
}

/* ----- Drill 1 mastery check ----- */
function drill1Mastered(langId, storyId) {
  const story = getStory(langId, storyId);
  if (!story) return false;
  const vocab = Array.isArray(story.vocabulary) ? story.vocabulary : [];
  if (!vocab.length) return true;
  const minMs = DRILL1_MIN_INTERVAL_DAYS * 86400000;
  for (let i = 0; i < vocab.length; i++) {
    const cardId = `${langId}::${storyId}::vocab::${i}`;
    const c = state.cards[cardId];
    if (!c) return false;
    if (c.reps < DRILL1_MIN_REPS) return false;
    // SM-2 interval is in days here; convert and compare.
    if ((c.interval || 0) < DRILL1_MIN_INTERVAL_DAYS) return false;
  }
  return true;
}

/* ----- Drill flow top bar ----- */
function drillTopBar(currentDrill, drillsDone) {
  const dots = [1,2,3,4,5,6].map(n => {
    const cls = drillsDone[n] ? 'done' : (n === currentDrill ? 'current' : '');
    return `<span class="drill-dot ${cls}" title="Drill ${n}: ${escapeHtml(DRILL_NAMES[n])}">${drillsDone[n] ? '✓' : n}</span>`;
  }).join('');
  return `
    <div class="fr-top-row">
      <div class="fr-step-pill">Drill ${currentDrill} of 6 · ${escapeHtml(DRILL_NAMES[currentDrill])}</div>
      <button class="ghost-btn fr-exit-btn" data-fr-exit="1">Save &amp; exit</button>
    </div>
    <div class="drill-track">${dots}</div>
  `;
}

/* ----- Drill flow dispatcher ----- */
function renderDrillFlow(lang, story, progress) {
  // If drill 6 already passed, the phase should be free-practice;
  // safety net here re-checks and promotes if state lagged.
  if (progress.drillsDone[6]) {
    setStoryProgress(lang.id, story.id, { phase: 'free-practice' });
    return renderReadLegacy(lang, story);
  }
  // Auto-skip past completed drills. If currentDrill is marked done,
  // bump to the next pending.
  let cur = progress.currentDrill || 1;
  while (cur < 6 && progress.drillsDone[cur]) cur++;
  if (cur !== progress.currentDrill) {
    setStoryProgress(lang.id, story.id, { currentDrill: cur });
    progress.currentDrill = cur;
  }

  const top = drillTopBar(cur, progress.drillsDone);
  const body =
    cur === 1 ? renderDrill1(lang, story, progress) :
    cur === 2 ? renderDrill2(lang, story, progress) :
    cur === 3 ? renderDrill3(lang, story, progress) :
    cur === 4 ? renderDrill4(lang, story, progress) :
    cur === 5 ? renderDrill5(lang, story, progress) :
                renderDrill6(lang, story, progress);
  return top + body;
}

/* ============================================================
   DRILL 1 — Vocab recognition. Card-based SRS using existing
   sentence/vocab card infrastructure, locked to vocabulary +
   speak mode. Done when every vocab card has reps ≥ 3 and
   interval ≥ 3 days.
   ============================================================ */
function renderDrill1(lang, story, progress) {
  // Mastery met → mark drill done + advance.
  if (drill1Mastered(lang.id, story.id)) {
    if (!progress.drillsDone[1]) {
      progress.drillsDone[1] = true;
      progress.currentDrill = 2;
      saveState();
    }
    return renderDrillCompleteCard(1, 'Vocab recognized — every word has settled into your memory.');
  }

  // Reuse the existing card-session machinery for queue + grading.
  const session = ensureCardSession(lang.id, story.id, 'speak', 'vocabulary');

  // Queue empty after wrong-pile rotation → "come back" message.
  if (session.queue.length === 0 && session.wrongPile.length === 0) {
    const remaining = countDrill1Remaining(lang.id, story.id);
    return `
      <div class="glass drill-empty">
        <div class="drill-empty-icon">⏳</div>
        <div class="drill-empty-title">No cards due right now.</div>
        <div class="drill-empty-msg">Come back later — ${remaining} ${remaining === 1 ? 'word' : 'words'} still building toward mastery.</div>
        <button class="ghost-btn full-btn" data-fr-exit="1">Save &amp; exit</button>
      </div>
    `;
  }
  // End-of-batch — rotate wrongPile or finish.
  if (session.idx >= session.queue.length) {
    if (session.wrongPile.length > 0) {
      session.queue = session.queue.concat(session.wrongPile);
      session.wrongPile = [];
    } else {
      // Today's session done; mastery may still be incomplete though.
      const remaining = countDrill1Remaining(lang.id, story.id);
      return `
        <div class="glass session-end">
          <div class="se-title gradient-text">✅ Session done</div>
          <div class="se-sub">${remaining} ${remaining === 1 ? 'word' : 'words'} still building toward drill mastery — come back later.</div>
          <button class="ghost-btn full-btn" data-fr-exit="1">Save &amp; exit</button>
        </div>
      `;
    }
  }

  const card = session.queue[session.idx];
  const content = getCardContent(card.id, story);
  if (!content) {
    return `<div class="glass empty-state">Card data missing.</div>`;
  }
  const progressLine = drill1ProgressLine(lang.id, story.id);
  return `
    <div class="drill-progress-line">${progressLine}</div>
    ${renderCardsSpeak(session, card, content)}
  `;
}

function countDrill1Remaining(langId, storyId) {
  const story = getStory(langId, storyId);
  const vocab = Array.isArray(story.vocabulary) ? story.vocabulary : [];
  let pending = 0;
  for (let i = 0; i < vocab.length; i++) {
    const cardId = `${langId}::${storyId}::vocab::${i}`;
    const c = state.cards[cardId];
    if (!c || c.reps < DRILL1_MIN_REPS || (c.interval || 0) < DRILL1_MIN_INTERVAL_DAYS) pending++;
  }
  return pending;
}
function drill1ProgressLine(langId, storyId) {
  const story = getStory(langId, storyId);
  const vocab = Array.isArray(story.vocabulary) ? story.vocabulary : [];
  let mastered = 0;
  for (let i = 0; i < vocab.length; i++) {
    const cardId = `${langId}::${storyId}::vocab::${i}`;
    const c = state.cards[cardId];
    if (c && c.reps >= DRILL1_MIN_REPS && (c.interval || 0) >= DRILL1_MIN_INTERVAL_DAYS) mastered++;
  }
  return `${mastered} / ${vocab.length} words mastered`;
}

/* ============================================================
   DRILL 2 — Vocab production. EN → IT typed answer for every new
   vocab word. Each word must be answered correctly twice in a row.
   Wrong answers reset the streak and re-queue the word.
   ============================================================ */
function renderDrill2(lang, story, progress) {
  const vocab = getNewVocab(story);
  if (!vocab.length) {
    // Nothing to drill — auto-pass.
    progress.drillsDone[2] = true;
    progress.currentDrill = 3;
    saveState();
    return renderDrillCompleteCard(2, 'No new vocab to drill — moving on.');
  }
  const d2 = progress.drill2;
  if (!d2.queue || !d2.queue.length) {
    // Initialize queue: shuffled vocab indices.
    d2.queue = shuffleArray(vocab.map((_, i) => i));
    d2.streak = {};
    d2.idx = 0;
    d2.lastInput = '';
    d2.revealed = false;
    saveState();
  }
  const widx = d2.queue[d2.idx];
  const v = vocab[widx];
  if (!v) return `<div class="glass empty-state">Vocab missing.</div>`;

  const remaining = d2.queue.length;
  const total = vocab.length;
  const completed = total - countRemainingDrill2(d2, vocab);
  const progressLine = `${completed} / ${total} words mastered (need ${DRILL2_REQUIRED_STREAK} in a row each)`;

  if (!d2.revealed) {
    return `
      <div class="drill-progress-line">${progressLine}</div>
      <div class="glass card-pane">
        <div class="big-sentence gradient-text">${escapeHtml(v.en)}</div>
        <textarea class="type-area" id="d2-input"
          placeholder="Type the ${escapeHtml(targetLangNameLower())} word..."
          autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">${escapeHtml(d2.lastInput || '')}</textarea>
        <button class="gradient-btn full-btn" id="btn-d2-check">Check</button>
      </div>
    `;
  }

  // Reveal pane.
  const expected = v.de || '';
  const submitted = d2.lastInput || '';
  const exact = submitted.trim() === expected.trim();
  const loose = drillAnswerMatches(submitted, expected);
  const banner = exact
    ? `<div class="feedback ok">✅ Exact match</div>`
    : loose
      ? `<div class="feedback almost">🟡 Correct! Spelled <strong>${escapeHtml(expected)}</strong>, mind the accents.</div>`
      : `<div class="feedback bad">❌ Not quite</div>`;
  const speakText = vocabSpeakText(v);
  return `
    <div class="drill-progress-line">${progressLine}</div>
    <div class="glass card-pane">
      ${banner}
      <div class="big-sentence gradient-text">${escapeHtml(expected)}</div>
      <div class="audio-row">
        <button class="audio-btn" data-fr-speak="${escapeHtml(speakText)}">🔊 ${speakLabelForActive()}</button>
      </div>
      ${v.note ? `<div class="note-callout">${escapeHtml(v.note)}</div>` : ''}
      <button class="gradient-btn full-btn" id="btn-d2-next">Next →</button>
    </div>
  `;
}
function countRemainingDrill2(d2, vocab) {
  let pending = 0;
  for (let i = 0; i < vocab.length; i++) {
    if ((d2.streak[i] || 0) < DRILL2_REQUIRED_STREAK) pending++;
  }
  return pending;
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================================
   DRILL 3 — Sentence assembly. Scrambled tiles per sentence with
   2 distractor tiles drawn from the story's vocab. Pass requires
   correct first attempt; failed sentences re-queue.
   ============================================================ */
function renderDrill3(lang, story, progress) {
  const sentences = Array.isArray(story.sentences) ? story.sentences : [];
  if (!sentences.length) {
    progress.drillsDone[3] = true;
    progress.currentDrill = 4;
    saveState();
    return renderDrillCompleteCard(3, 'No sentences to assemble.');
  }
  const d3 = progress.drill3;
  if (!d3.queue || !d3.queue.length) {
    d3.queue = shuffleArray(sentences.map((_, i) => i));
    d3.retried = {};
    d3.idx = 0;
    d3.tiles = null;
    saveState();
  }
  const sidx = d3.queue[d3.idx];
  const s = sentences[sidx];
  if (!s) return `<div class="glass empty-state">Sentence missing.</div>`;

  const target = substituteProtagonist(String(s.de || ''));
  // Build tiles once per sentence and stash on the in-progress state.
  if (!d3.tiles || d3.tiles.sidx !== sidx) {
    const words = target.split(/\s+/).filter(Boolean);
    const distractors = pickDistractors(story, words, 2);
    const all = shuffleArray(words.concat(distractors));
    d3.tiles = {
      sidx,
      target,
      targetWords: words,
      tiles: all,                // displayed
      assembled: [],             // user picks (indices into tiles)
      available: all.map((_, i) => i),
      checked: false,
      correct: false
    };
  }
  const t = d3.tiles;

  const remainingCount = d3.queue.length - d3.idx;
  const totalCount = sentences.length;
  const progressLine = `Sentence ${d3.idx + 1} / ${d3.queue.length} this round · ${totalCount} total`;

  const assembledHtml = t.assembled.length
    ? t.assembled.map((tileIdx, i) =>
        `<button class="word-tile assembled" data-d3-unpick="${i}">${escapeHtml(t.tiles[tileIdx])}</button>`
      ).join('')
    : `<span class="word-tile-placeholder">tap tiles to build the sentence</span>`;

  const availableHtml = t.available.map(tileIdx =>
    `<button class="word-tile" data-d3-pick="${tileIdx}">${escapeHtml(t.tiles[tileIdx])}</button>`
  ).join('');

  const banner = t.checked
    ? (t.correct
        ? `<div class="feedback ok">✅ Perfect</div>`
        : `<div class="feedback bad">❌ Not quite — the right answer was:<br><strong>${escapeHtml(target)}</strong></div>`)
    : '';

  const englishHint = `<div class="d3-hint">${escapeHtml(s.en || '')}</div>`;

  const ctrlHtml = t.checked
    ? `<button class="gradient-btn full-btn" id="btn-d3-next">Next →</button>`
    : `
      <div class="btn-row">
        <button class="ghost-btn" id="btn-d3-clear">Clear</button>
        <button class="gradient-btn" id="btn-d3-check" ${t.assembled.length ? '' : 'disabled'} style="flex:2">Check</button>
      </div>
    `;

  return `
    <div class="drill-progress-line">${progressLine}</div>
    <div class="glass d3-pane">
      ${englishHint}
      <div class="d3-assembled">${assembledHtml}</div>
      ${banner}
      ${!t.checked ? `<div class="d3-tiles">${availableHtml}</div>` : ''}
      ${ctrlHtml}
    </div>
  `;
}

function pickDistractors(story, sentenceWords, n) {
  const have = new Set(sentenceWords.map(w => w.toLowerCase()));
  const pool = [];
  const vocab = Array.isArray(story.vocabulary) ? story.vocabulary : [];
  vocab.forEach(v => {
    const w = String(v.de || '').trim();
    if (w && !have.has(w.toLowerCase())) pool.push(w);
  });
  // Also pull individual words from other sentences as backup pool.
  (story.sentences || []).forEach(s => {
    substituteProtagonist(String(s.de || '')).split(/\s+/).forEach(w => {
      const clean = w.replace(/[.,!?;:"()«»]/g, '');
      if (clean && !have.has(clean.toLowerCase())) pool.push(clean);
    });
  });
  const unique = Array.from(new Set(pool));
  return shuffleArray(unique).slice(0, n);
}

/* ============================================================
   DRILL 4 — Dictation. TTS plays a sentence; learner types it.
   Replay is free. Same normalization as drill 2.
   ============================================================ */
function renderDrill4(lang, story, progress) {
  const sentences = Array.isArray(story.sentences) ? story.sentences : [];
  if (!sentences.length) {
    progress.drillsDone[4] = true;
    progress.currentDrill = 5;
    saveState();
    return renderDrillCompleteCard(4, 'No sentences to transcribe.');
  }
  const d4 = progress.drill4;
  if (!d4.queue || !d4.queue.length) {
    d4.queue = shuffleArray(sentences.map((_, i) => i));
    d4.doneSet = {};
    d4.idx = 0;
    d4.lastInput = '';
    d4.revealed = false;
    saveState();
  }
  const sidx = d4.queue[d4.idx];
  const s = sentences[sidx];
  if (!s) return `<div class="glass empty-state">Sentence missing.</div>`;
  const expected = substituteProtagonist(String(s.de || ''));

  const total = sentences.length;
  const completed = Object.keys(d4.doneSet).length;
  const progressLine = `${completed} / ${total} dictated`;

  if (!d4.revealed) {
    return `
      <div class="drill-progress-line">${progressLine}</div>
      <div class="glass card-pane d4-pane">
        <div class="d4-instructions">Listen and type what you hear.</div>
        <div class="audio-row">
          <button class="audio-btn big" data-fr-speak="${escapeHtml(expected)}" data-sent-idx="${sidx}">🔊 Play</button>
        </div>
        <textarea class="type-area" id="d4-input"
          placeholder="Type the ${escapeHtml(targetLangNameLower())} sentence..."
          autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">${escapeHtml(d4.lastInput || '')}</textarea>
        <button class="gradient-btn full-btn" id="btn-d4-check">Check</button>
      </div>
    `;
  }

  const submitted = d4.lastInput || '';
  const exact = submitted.trim() === expected.trim();
  const loose = drillAnswerMatches(submitted, expected);
  const banner = exact
    ? `<div class="feedback ok">✅ Exact match</div>`
    : loose
      ? `<div class="feedback almost">🟡 Correct! Spelling: <strong>${escapeHtml(expected)}</strong></div>`
      : `<div class="feedback bad">❌ Compare carefully</div>`;
  return `
    <div class="drill-progress-line">${progressLine}</div>
    <div class="glass card-pane d4-pane">
      ${banner}
      <div class="big-sentence gradient-text">${escapeHtml(expected)}</div>
      <div class="audio-row">
        <button class="audio-btn" data-fr-speak="${escapeHtml(expected)}" data-sent-idx="${sidx}">🔊 Replay</button>
      </div>
      <button class="gradient-btn full-btn" id="btn-d4-next">Next →</button>
    </div>
  `;
}

/* ============================================================
   DRILL 5 — Rule spotting. Spec calls for tapping rule-relevant
   tokens inside story sentences, which needs sentence-rule
   tagging the current schema doesn't carry. v1 fallback: walk the
   learner through each new rule (name + explanation + examples
   when present) and require a "Got it" tap to advance. Once we
   have rule-tagged sentences in story JSON we'll upgrade this
   drill to true token-tap spotting.
   ============================================================ */
function renderDrill5(lang, story, progress) {
  const rules = getNewGrammar(story);
  if (!rules.length) {
    progress.drillsDone[5] = true;
    progress.currentDrill = 6;
    saveState();
    return renderDrillCompleteCard(5, 'No new rules to review.');
  }
  const d5 = progress.drill5;
  if (!d5.queue || !d5.queue.length) {
    d5.queue = rules.map((_, i) => i);  // preserve story order
    d5.results = {};
    d5.idx = 0;
    d5.picked = null;
    saveState();
  }
  const ridx = d5.queue[d5.idx];
  const rule = rules[ridx];
  if (!rule) return `<div class="glass empty-state">Rule missing.</div>`;

  const total = rules.length;
  const confirmed = Object.values(d5.results).filter(v => v === true).length;

  return `
    <div class="drill-progress-line">${confirmed} / ${total} rules reviewed</div>
    ${renderRuleCard(rule, rule.tier || 1)}
    <button class="gradient-btn full-btn" id="btn-d5-next" style="margin-top: 12px;">Got it →</button>
  `;
}

/* ============================================================
   DRILL 6 — Transfer test. Tier-1 only. Mastery threshold:
   ≥80% over max(15, 7 × rules_introduced) first-attempts (§7.2).
   Reuses the existing test session machinery, filtered to tier 1.
   ============================================================ */
function renderDrill6(lang, story, progress) {
  const tier1Tests = (story.grammarTests || []).filter(t => t.tier === 1);
  if (!tier1Tests.length) {
    // No tier-1 tests defined — auto-pass.
    progress.drillsDone[6] = true;
    progress.unlocked = true;
    saveState();
    promoteStoryToFreePractice(lang.id, story.id);
    return renderDrillCompleteCard(6, 'No tier-1 tests defined — story marked complete.');
  }
  const rulesIntroduced = (story.grammarRules || []).filter(r => r.tier === 1).length;
  const required = Math.max(15, 7 * Math.max(1, rulesIntroduced));
  const stats = getDrill6Stats(lang.id, story.id, tier1Tests);
  const accuracy = stats.firstAttempts > 0 ? Math.round((stats.correctOnFirst / stats.firstAttempts) * 100) : 0;
  const thresholdMet = stats.firstAttempts >= required && accuracy >= 80;

  if (thresholdMet) {
    progress.drillsDone[6] = true;
    progress.unlocked = true;
    saveState();
    promoteStoryToFreePractice(lang.id, story.id);
    return renderDrill6Celebration(lang, story);
  }

  // Build / reuse a test session. The existing testSession machinery
  // records first-attempts in state.testAttempts via the same path
  // as the regular Test tab; we just keep the user on tier 1.
  const needNew = !testSession ||
    testSession.langId !== lang.id ||
    testSession.storyId !== story.id ||
    testSession.tier !== 1;
  if (needNew) {
    const queue = buildTestQueue(lang.id, story.id, 1);
    testSession = {
      langId: lang.id, storyId: story.id, tier: 1,
      queue, idx: 0, wrongPile: [],
      revealed: false, lastInput: '',
      correctOnFirst: 0, totalThisSession: queue.length,
      prevNextTierUnlocked: tierUnlocked(2, lang.id, story.id)
    };
  }

  const progressLine = `${stats.firstAttempts} / ${required} first-attempts · ${accuracy}% accuracy (need ≥80%)`;

  if (!testSession || !testSession.queue || !testSession.queue.length) {
    return `
      <div class="drill-progress-line">${progressLine}</div>
      <div class="glass drill-empty">
        <div class="drill-empty-icon">🎯</div>
        <div class="drill-empty-title">No tier-1 prompts queued.</div>
        <div class="drill-empty-msg">Try again later — every test has been seen recently.</div>
        <button class="ghost-btn full-btn" data-fr-exit="1">Save &amp; exit</button>
      </div>
    `;
  }

  // Reuse the existing in-tab test renderer; it already handles
  // type+choose-article modes and grading.
  return `
    <div class="drill-progress-line">${progressLine}</div>
    ${renderTestSession(story, lang)}
  `;
}

function getDrill6Stats(langId, storyId, tier1Tests) {
  // testAttempts records carry: firstAttempts (count) +
  // firstAttemptsCorrect (count of correct first answers).
  let firstAttempts = 0;
  let correctOnFirst = 0;
  tier1Tests.forEach((t, idx) => {
    const key = `${langId}::${storyId}::tier1::builtin::${idx}`;
    const a = state.testAttempts[key];
    if (!a) return;
    firstAttempts += a.firstAttempts || 0;
    correctOnFirst += a.firstAttemptsCorrect || 0;
  });
  return { firstAttempts, correctOnFirst };
}

function renderDrill6Celebration(lang, story) {
  const nextStoryId = findNextStoryId(lang, story.id);
  const ctaLabel = nextStoryId ? 'Open the next story' : 'Back to library';
  return `
    <div class="glass fr-celebrate">
      <div class="fr-celebrate-icon">🎉</div>
      <div class="fr-celebrate-title gradient-text">Story complete</div>
      <div class="fr-celebrate-msg">
        ${nextStoryId
          ? 'You hit the tier-1 mastery threshold. The next chapter just unlocked.'
          : 'You hit the tier-1 mastery threshold. Free practice for this story is now open in the library.'}
      </div>
      <button class="gradient-btn full-btn" data-d6-next="${escapeHtml(nextStoryId || '')}">${ctaLabel}</button>
    </div>
  `;
}

function findNextStoryId(lang, storyId) {
  const list = lang.stories || [];
  const idx = list.indexOf(storyId);
  if (idx < 0 || idx >= list.length - 1) return null;
  return list[idx + 1];
}

function promoteStoryToFreePractice(langId, storyId) {
  // Phase transition + clear ephemeral session so other tabs render
  // a clean slate against the post-drill state.
  const lang = state.languages[langId];
  if (lang && lang.storyProgress && lang.storyProgress[storyId]) {
    lang.storyProgress[storyId].phase = 'free-practice';
  }
  cardSession = null;
  testSession = null;
  saveState();
}

/* ----- Generic "drill complete" pane (shown briefly between drills) ----- */
function renderDrillCompleteCard(n, msg) {
  const next = n + 1;
  const isLast = n >= 6;
  return `
    <div class="glass drill-complete">
      <div class="drill-complete-icon">✓</div>
      <div class="drill-complete-title gradient-text">Drill ${n} done</div>
      <div class="drill-complete-msg">${escapeHtml(msg)}</div>
      ${isLast
        ? `<button class="gradient-btn full-btn" data-fr-exit="1">Back to library</button>`
        : `<button class="gradient-btn full-btn" data-d-advance="${next}">Start drill ${next} →</button>`}
    </div>
  `;
}

/* ============================================================
   FREE PRACTICE — Stage E. Story has finished its drill flow and
   enters open-ended mode. The hub is a tile grid; tiles either
   deep-link to existing tabs (Cards / Rules / Test) or render
   in-place (Listen / Sentence assembly / Dictation).
   ============================================================ */
function renderFreePractice(lang, story, progress) {
  const mode = progress.fpMode || 'hub';
  switch (mode) {
    case 'listen':    return renderFPListen(lang, story, progress);
    case 'assembly':  return renderFPAssembly(lang, story, progress);
    case 'dictation': return renderFPDictation(lang, story, progress);
    default:          return renderFPHub(lang, story, progress);
  }
}

function renderFPHub(lang, story, progress) {
  const stats = getStats(state, lang.id, story.id);
  const vocabCount = (story.vocabulary || []).length;
  const sentCount = (story.sentences || []).length;
  const ruleCount = (story.grammarRules || []).length;
  // Tier accuracy across all attempts.
  const acc = (tier) => {
    const prefix = `${lang.id}::${story.id}::tier${tier}::`;
    let attempts = 0, correct = 0;
    for (const k in state.testAttempts) {
      if (!k.startsWith(prefix)) continue;
      attempts += state.testAttempts[k].attempts || 0;
      correct  += state.testAttempts[k].correct  || 0;
    }
    return { attempts, accuracy: attempts ? Math.round(correct / attempts * 100) : 0 };
  };
  const tiers = [acc(1), acc(2), acc(3)];

  const tile = (key, icon, title, sub) => `
    <div class="glass fp-tile" data-fp-tile="${key}">
      <div class="fp-tile-icon">${icon}</div>
      <div class="fp-tile-title">${escapeHtml(title)}</div>
      <div class="fp-tile-sub">${escapeHtml(sub)}</div>
    </div>
  `;

  return `
    <div class="fr-top-row">
      <div class="fr-step-pill">Free practice</div>
      <button class="ghost-btn fr-exit-btn" data-fp-back-to-library="1">← Library</button>
    </div>
    <div class="glass fp-header">
      <div class="fp-title gradient-text">${escapeHtml(story.title)}</div>
      <div class="fp-sub">Pick anything — drill order is over. Cross-story Review on the library home.</div>
    </div>
    <div class="fp-grid">
      ${tile('listen',     '🎧', 'Listen',           `${sentCount} sentences · subtitle toggle`)}
      ${tile('sentences',  '📝', 'Sentence cards',   'Type or speak · SRS')}
      ${tile('vocab',      '🔤', 'Vocab cards',      `${vocabCount} words · SRS`)}
      ${tile('assembly',   '🧩', 'Sentence assembly', 'Repeatable, free order')}
      ${tile('dictation',  '✍️', 'Dictation',        'Listen and type')}
      ${tile('rules',      '📚', 'Grammar rules',    `${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'} with examples`)}
      ${tile('tests',      '🎯', 'Transfer test',    `T1 ${tiers[0].accuracy}% · T2 ${tiers[1].accuracy}% · T3 ${tiers[2].accuracy}%`)}
    </div>
  `;
}

/* ----- Listen mode: cover + sentences + audio + EN toggle ----- */
function renderFPListen(lang, story, progress) {
  const showEng = !!progress.fpListenEng;
  const subModes = ['off', 'it', 'both'];
  const cur = progress.fpSubMode || 'it';
  const next = subModes[(subModes.indexOf(cur) + 1) % subModes.length];
  const subLabel =
    cur === 'off'  ? 'Subtitles: off' :
    cur === 'it'   ? 'Subtitles: IT'  : 'Subtitles: IT + EN';

  const coverHtml = renderStoryCover(lang.id, story) ||
    `<div class="story-cover" style="background: linear-gradient(135deg, var(--grad-1), var(--grad-3));"></div>`;

  const rows = (cur === 'off')
    ? ''
    : story.sentences.map((s, i) => `
        <div class="fr-narr-row" data-sent-idx="${i}">
          <div class="de">${escapeHtml(s.de)}</div>
          ${cur === 'both' ? `<div class="en">${escapeHtml(s.en)}</div>` : ''}
        </div>
      `).join('');

  return `
    <div class="fr-top-row">
      <div class="fr-step-pill">Listen</div>
      <button class="ghost-btn fr-exit-btn" data-fp-back-to-hub="1">← Free practice</button>
    </div>
    <div class="fr-cover-wrap fr-cover-thin">${coverHtml}</div>
    <div class="play-bar">
      <button class="gradient-btn" id="btn-play-all">${playback.active ? '⏹  Stop' : '🔊  Play full story'}</button>
      <button class="ghost-btn fr-eng-toggle" data-fp-cycle-sub="${next}">${escapeHtml(subLabel)}</button>
    </div>
    ${rows ? `<div class="glass fr-narration-list">${rows}</div>` : '<div class="glass empty-state">Subtitles off — close your eyes and listen.</div>'}
  `;
}

/* ----- Assembly + Dictation reuse the drill 3/4 renderers verbatim.
   Each entry into FP mode resets the drill's queue for a fresh
   round; the existing handlers operate on progress.drill3 /
   progress.drill4 as usual. drillsDone[N] re-flipping to true at
   round end is harmless since we're already in free-practice
   phase — the dispatcher never re-enters drill flow. ----- */
function renderFPAssembly(lang, story, progress) {
  // Empty queue → reset for a fresh round.
  if (!progress.drill3.queue || !progress.drill3.queue.length) {
    const sentences = story.sentences || [];
    progress.drill3.queue = shuffleArray(sentences.map((_, i) => i));
    progress.drill3.tiles = null;
    progress.drill3.retried = {};
    progress.drill3.idx = 0;
  }
  return `
    <div class="fr-top-row">
      <div class="fr-step-pill">Sentence assembly</div>
      <button class="ghost-btn fr-exit-btn" data-fp-back-to-hub="1">← Free practice</button>
    </div>
    ${renderDrill3(lang, story, progress)}
  `;
}
function renderFPDictation(lang, story, progress) {
  if (!progress.drill4.queue || !progress.drill4.queue.length) {
    const sentences = story.sentences || [];
    progress.drill4.queue = shuffleArray(sentences.map((_, i) => i));
    progress.drill4.doneSet = {};
    progress.drill4.idx = 0;
    progress.drill4.lastInput = '';
    progress.drill4.revealed = false;
  }
  return `
    <div class="fr-top-row">
      <div class="fr-step-pill">Dictation</div>
      <button class="ghost-btn fr-exit-btn" data-fp-back-to-hub="1">← Free practice</button>
    </div>
    ${renderDrill4(lang, story, progress)}
  `;
}

function renderPlaceholder(name) {
  return `
    <div class="glass placeholder">
      <div class="ph-title gradient-text">${name}</div>
      <div class="ph-sub">Coming in next update.</div>
    </div>
  `;
}
