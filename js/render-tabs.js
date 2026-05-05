'use strict';

/* Cards / Test / Rules / Settings / Global Review renderers. */

/* ============================================================
   CARDS TAB — Type + Speak interaction modes × Sentences/Vocabulary
   sources. Each (story, source) combo gets its own SRS pool;
   switching mode keeps the current queue, switching source rebuilds.
   ============================================================ */
function buildCardSession(langId, storyId, mode, source) {
  const queue = buildCardQueue(langId, storyId, source);
  return {
    langId, storyId, mode, source,
    queue,
    idx: 0,
    wrongPile: [],
    revealed: false,
    flipped: false,
    lastInput: '',
    correctOnFirst: 0,
    originalQueueLen: queue.length
  };
}

function ensureCardSession(langId, storyId, mode, source) {
  // Different story or source → fresh queue. Mode change alone
  // just resets the visible surface so the queue continues.
  if (!cardSession ||
      cardSession.langId !== langId ||
      cardSession.storyId !== storyId ||
      cardSession.source !== source) {
    cardSession = buildCardSession(langId, storyId, mode, source);
  } else if (cardSession.mode !== mode) {
    cardSession.mode = mode;
    cardSession.revealed = false;
    cardSession.flipped = false;
    cardSession.lastInput = '';
  }
  return cardSession;
}

function renderCards() {
  const lang = getActiveLang();
  const storyId = lang.lastStoryId;

  if (!storyId) {
    return `<div class="glass empty-state">
      <div class="em-icon">🎴</div>
      Pick a story from Library to start studying.
    </div>`;
  }

  const story = getStory(lang.id, storyId);
  if (!story) return `<div class="glass empty-state">Story not found.</div>`;

  const mode = state.settings.cardMode || 'type';
  const source = state.settings.cardSource || 'sentences';
  const hasVocab = Array.isArray(story.vocabulary) && story.vocabulary.length > 0;

  // Source toggle: only render Vocabulary option if story actually has one.
  const sourceToggle = `
    <div class="read-toggle">
      <button class="${source === 'sentences'  ? 'active' : ''}" data-card-source="sentences">📖  Sentences</button>
      <button class="${source === 'vocabulary' ? 'active' : ''} ${hasVocab ? '' : 'tab-disabled'}" data-card-source="vocabulary" ${hasVocab ? '' : 'disabled'}>🔤  Vocabulary</button>
    </div>
  `;
  const modeToggle = `
    <div class="read-toggle three">
      <button class="${mode === 'type'   ? 'active' : ''}" data-card-mode="type">⌨️  Type</button>
      <button class="${mode === 'speak'  ? 'active' : ''}" data-card-mode="speak">🗣️  Speak</button>
      <button class="${mode === 'browse' ? 'active' : ''}" data-card-mode="browse">📋  Browse</button>
    </div>
  `;
  const toggles = sourceToggle + modeToggle;

  // Story has no vocab but vocab source is selected — fall back gracefully.
  const effectiveSource = (source === 'vocabulary' && !hasVocab) ? 'sentences' : source;

  // Browse mode bypasses the SRS session entirely — just renders
  // every item as a tile grid. No queue, no grading.
  if (mode === 'browse') {
    return `${toggles}${renderCardsBrowse(story, effectiveSource, lang)}`;
  }

  const session = ensureCardSession(lang.id, storyId, mode, effectiveSource);

  if (session.queue.length === 0 && session.wrongPile.length === 0) {
    const label = effectiveSource === 'vocabulary' ? 'words' : 'cards';
    return `${toggles}
      <div class="glass session-end">
        <div class="se-title gradient-text">🎉 Nothing more due!</div>
        <div class="se-sub">All ${label} for this story are scheduled for the future.</div>
        <button class="gradient-btn" data-go-tab="library">Back to Library</button>
      </div>`;
  }

  if (session.idx >= session.queue.length) {
    if (session.wrongPile.length > 0) {
      session.queue = session.queue.concat(session.wrongPile);
      session.wrongPile = [];
    } else {
      const next = buildCardQueue(lang.id, storyId, effectiveSource);
      const continueBtn = next.length > 0
        ? `<button class="gradient-btn" data-cards-next="1">Continue with next batch</button>`
        : `<div style="margin-bottom:8px;">🎉 Nothing more due!</div>
           <button class="gradient-btn" data-go-tab="library">Back to Library</button>`;
      return `${toggles}
        <div class="glass session-end">
          <div class="se-title gradient-text">✅ Session complete</div>
          <div class="se-sub">${session.correctOnFirst} / ${session.originalQueueLen} correct on first attempt</div>
          ${continueBtn}
        </div>`;
    }
  }

  const card = session.queue[session.idx];
  const content = getCardContent(card.id, story);
  if (!content.item) {
    // Defensive: card refers to an item index that's been removed.
    // Drop it from queue and re-render.
    session.queue.splice(session.idx, 1);
    return renderCards();
  }

  const cardWord = effectiveSource === 'vocabulary' ? 'Word' : 'Card';
  const retryNote = (mode === 'speak' && session.wrongPile.length > 0)
    ? ` <span style="color: var(--text-soft);">(${session.wrongPile.length} to retry)</span>`
    : '';
  const counter = `<div class="card-counter">${cardWord} ${session.idx + 1} of ${session.queue.length}${retryNote}</div>`;

  const body = mode === 'type'
    ? renderCardsType(session, card, content)
    : renderCardsSpeak(session, card, content);

  return `${toggles}${counter}${body}`;
}

/* `content` is { type: 'sentence' | 'vocab', item, idx } from
   getCardContent(). For vocab the target text is the bare word;
   audio playback prefixes a real article so the noun reads naturally.
   German vocabulary stores the article itself (der/die/das) — passed
   through as-is. Italian stores m/f markers — those are letters TTS
   would pronounce ("eme lago"), so we derive the right article and
   splice it in. */
function vocabSpeakText(item) {
  const word = String(item.de || '').trim();
  if (!item.gender) return word;
  const g = String(item.gender).trim();

  // Multi-char gender = the article itself (German style). Use as-is.
  if (g.length > 1) return `${g} ${word}`;

  // Single-letter gender (m/f) — Italian convention. Build the article.
  const lang = getActiveLang();
  if (lang && lang.id === 'it') {
    const lower = word.toLowerCase();
    const startsWithVowel = /^[aeiouàèéìòù]/.test(lower);
    const startsWithSpecialMasc = /^(s[bcdfghjklmnpqrstvwxz]|z|ps|gn|x|y)/.test(lower);
    if (g === 'm') {
      if (startsWithVowel) return `l'${word}`;
      if (startsWithSpecialMasc) return `lo ${word}`;
      return `il ${word}`;
    }
    if (g === 'f') {
      if (startsWithVowel) return `l'${word}`;
      return `la ${word}`;
    }
  }
  // Unknown short gender for unknown lang — speak the bare word
  // rather than the letter ("eme") which sounds wrong.
  return word;
}
function renderVocabPosTag(item) {
  if (!item.pos) return '';
  const label = item.pos === 'noun' && item.gender
    ? `${item.pos} · ${item.gender}`
    : item.pos;
  return `<div style="text-align:center; margin-bottom: 8px;"><span class="rule-tag">${escapeHtml(label)}</span></div>`;
}
function renderVocabAnswer(item) {
  // The big German display: gender prefix in dimmer color, then word.
  const gender = item.gender ? `<span style="color: var(--text-dim);">${escapeHtml(item.gender)}</span> ` : '';
  const plural = item.plural ? `<div style="font-size: 13px; color: var(--text-soft); text-align:center; margin-top: -8px; margin-bottom: 14px;">plural: ${escapeHtml(item.plural)}</div>` : '';
  return `
    <div class="big-sentence gradient-text">${gender}${escapeHtml(item.de)}</div>
    ${plural}
  `;
}

function renderCardsType(session, card, content) {
  const item = content.item;
  const promptEn = item.en;
  const answerDe = item.de;
  const speakText = content.type === 'vocab' ? vocabSpeakText(item) : answerDe;
  const posTag = content.type === 'vocab' ? renderVocabPosTag(item) : '';

  if (!session.revealed) {
    const targetName = targetLangNameLower();
    const placeholder = content.type === 'vocab'
      ? `Type the ${targetName} word...`
      : `Type your ${targetName} translation...`;
    return `
      <div class="glass card-pane">
        ${posTag}
        <div class="big-sentence gradient-text">${escapeHtml(promptEn)}</div>
        <textarea class="type-area" id="type-input"
          placeholder="${placeholder}"
          autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">${escapeHtml(session.lastInput || '')}</textarea>
        <button class="gradient-btn full-btn" id="btn-show-answer">Show Answer</button>
      </div>
    `;
  }

  const dist = levenshtein(normalize(session.lastInput || ''), normalize(answerDe));
  let banner;
  if (dist === 0)       banner = `<div class="feedback ok">✅ Exact match</div>`;
  else if (dist <= 2)   banner = `<div class="feedback almost">🟡 Almost — small typo</div>`;
  else                  banner = `<div class="feedback bad">❌ Compare carefully</div>`;

  const answerBlock = content.type === 'vocab'
    ? renderVocabAnswer(item)
    : `<div class="big-sentence gradient-text">${escapeHtml(answerDe)}</div>`;

  return `
    <div class="glass card-pane">
      ${banner}
      ${answerBlock}
      <div class="audio-row">
        <button class="audio-btn" data-action="speak-de" data-text="${escapeHtml(speakText)}">🔊 ${speakLabelForActive()}</button>
      </div>
      ${posTag}
      ${item.note ? `<div class="note-callout">${escapeHtml(item.note)}</div>` : ''}
      <div class="grade-row">
        <button class="grade-btn again" data-grade="1"><span class="lbl">Again</span><span class="sub">restart</span></button>
        <button class="grade-btn hard"  data-grade="2"><span class="lbl">Hard</span><span class="sub">soon</span></button>
        <button class="grade-btn good"  data-grade="3"><span class="lbl">Good</span><span class="sub">on track</span></button>
        <button class="grade-btn easy"  data-grade="4"><span class="lbl">Easy</span><span class="sub">later</span></button>
      </div>
    </div>
  `;
}

function renderCardsSpeak(session, card, content) {
  const item = content.item;
  const speakText = content.type === 'vocab' ? vocabSpeakText(item) : item.de;
  const posTag = content.type === 'vocab' ? renderVocabPosTag(item) : '';

  if (!session.flipped) {
    const targetName = targetLangNameLower();
    const hint = content.type === 'vocab'
      ? `Say the ${targetName} word aloud, then tap to flip`
      : `Say it aloud in ${targetName}, then tap to flip`;
    return `
      <div class="glass card-pane flip-card" id="flip-card">
        ${posTag}
        <div class="big-sentence gradient-text">${escapeHtml(item.en)}</div>
        <button class="audio-btn" data-action="speak-en" data-text="${escapeHtml(item.en)}">🔊 EN</button>
        <div class="hint">${hint}</div>
      </div>
    `;
  }

  const answerBlock = content.type === 'vocab'
    ? renderVocabAnswer(item)
    : `<div class="big-sentence gradient-text">${escapeHtml(item.de)}</div>`;

  return `
    <div class="glass card-pane flip-card" id="flip-card">
      ${answerBlock}
      <div class="audio-row">
        <button class="audio-btn" data-action="speak-de" data-text="${escapeHtml(speakText)}">🔊 ${speakLabelForActive()}</button>
      </div>
      <div style="font-size: 14px; color: var(--text-dim); text-align: center; margin-top: 4px;">
        ${escapeHtml(item.en)}
      </div>
      <div class="audio-row">
        <button class="audio-btn" data-action="speak-en" data-text="${escapeHtml(item.en)}">🔊 EN</button>
      </div>
      ${posTag}
      ${item.note ? `<div class="note-callout">${escapeHtml(item.note)}</div>` : ''}
      <div class="hint">Were you right?</div>
    </div>
    <div class="wr-row">
      <button class="wr-btn wrong" data-speak-grade="wrong">← Wrong</button>
      <button class="wr-btn right" data-speak-grade="right">Right →</button>
    </div>
  `;
}

/* ============================================================
   Browse mode — non-SRS reference view. Renders every sentence or
   vocab item as a tile. Audio works; no grading, no progress.
   ============================================================ */
function renderCardsBrowse(story, source, lang) {
  const items = source === 'vocabulary'
    ? (Array.isArray(story.vocabulary) ? story.vocabulary : [])
    : (Array.isArray(story.sentences)  ? story.sentences  : []);

  if (items.length === 0) {
    return `<div class="glass empty-state">
      <div class="em-icon">📋</div>
      Nothing to browse — story has no ${source === 'vocabulary' ? 'vocabulary' : 'sentences'} defined.
    </div>`;
  }

  const summary = `<div class="browse-summary">${items.length} ${source === 'vocabulary' ? 'words' : 'sentences'}</div>`;

  const tiles = items.map((item, i) => {
    if (source === 'vocabulary') {
      const speakText = vocabSpeakText(item);
      const genderHtml = item.gender ? `<span class="gen">${escapeHtml(item.gender)}</span>` : '';
      const posBits = [];
      if (item.pos) posBits.push(item.pos);
      const meta = posBits.length ? `<span class="bt-pos">${escapeHtml(posBits.join(' · '))}</span>` : '';
      const plural = item.plural ? `<span class="bt-plural">pl. ${escapeHtml(item.plural)}</span>` : '';
      return `
        <div class="glass browse-tile tile-vocab">
          <div class="bt-de">${genderHtml}${escapeHtml(item.de)}</div>
          <div class="bt-en">${escapeHtml(item.en || '')}</div>
          <div class="bt-meta">${meta}${plural}</div>
          <button class="audio-btn" data-action="speak-de" data-text="${escapeHtml(speakText)}">🔊 ${speakLabelForActive()}</button>
        </div>
      `;
    }
    // sentence tile
    return `
      <div class="glass browse-tile tile-sentence">
        <div class="bt-idx">#${i + 1}</div>
        <div class="bt-de">${escapeHtml(item.de)}</div>
        <div class="bt-en">${escapeHtml(item.en)}</div>
        <button class="audio-btn" data-action="speak-de" data-text="${escapeHtml(item.de)}">🔊 ${speakLabelForActive()}</button>
      </div>
    `;
  }).join('');

  return `${summary}<div class="browse-grid">${tiles}</div>`;
}

/* ============================================================
   TEST TAB — tier selection + session loop.
   ============================================================ */
// Test queue merges the story's built-in `grammarTests` with every
// uploaded test pack registered for that language+story. Each test
// carries `_packId` (null for built-in) and its `originalIdx` within
// its source array — together they form the testAttempts key.
function buildTestQueue(languageId, storyId, tier) {
  const story = state.storiesData[`${languageId}::${storyId}`];
  if (!story) return [];
  const items = [];
  story.grammarTests.forEach((t, originalIdx) => {
    if (t.tier === tier) items.push({ ...t, originalIdx, _packId: null, firstAttempt: true });
  });
  for (const k in state.testPacks) {
    const pack = state.testPacks[k];
    if (pack.languageId !== languageId || pack.storyId !== storyId) continue;
    pack.tests.forEach((t, originalIdx) => {
      if (t.tier === tier) items.push({ ...t, originalIdx, _packId: pack.id, firstAttempt: true });
    });
  }
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Total count of tier-N tests (built-in + every installed pack).
function countTestsForTier(languageId, storyId, tier) {
  const story = state.storiesData[`${languageId}::${storyId}`];
  if (!story) return 0;
  let n = story.grammarTests.filter(t => t.tier === tier).length;
  for (const k in state.testPacks) {
    const pack = state.testPacks[k];
    if (pack.languageId !== languageId || pack.storyId !== storyId) continue;
    n += pack.tests.filter(t => t.tier === tier).length;
  }
  return n;
}

function startTestSession(tier) {
  const lang = getActiveLang();
  const story = getStory(lang.id, lang.lastStoryId);
  if (!story) return;
  const queue = buildTestQueue(lang.id, story.id, tier);
  const nextTier = tier + 1;
  testSession = {
    langId: lang.id, storyId: story.id, tier,
    queue, idx: 0, wrongPile: [],
    revealed: false, lastInput: '',
    correctOnFirst: 0, totalThisSession: queue.length,
    prevNextTierUnlocked: nextTier <= 3 ? tierUnlocked(nextTier, lang.id, story.id) : true
  };
  render();
}

function renderTest() {
  const lang = getActiveLang();
  const storyId = lang.lastStoryId;

  if (!storyId) {
    return `<div class="glass empty-state">
      <div class="em-icon">🎯</div>
      Pick a story from Library to start grammar tests.
    </div>`;
  }
  const story = getStory(lang.id, storyId);
  if (!story) return `<div class="glass empty-state">Story not found.</div>`;

  // No active session → show tier selection.
  if (!testSession || testSession.langId !== lang.id || testSession.storyId !== storyId) {
    return renderTierSelection(story, lang);
  }
  return renderTestSession(story, lang);
}

function renderTierSelection(story, lang) {
  const tiers = [1, 2, 3];
  return tiers.map(tier => {
    const ruleNames = story.grammarRules.filter(r => r.tier === tier).map(r => r.name);
    const totalTests = countTestsForTier(lang.id, story.id, tier);
    const prefix    = `${lang.id}::${story.id}::tier${tier}::`;
    let totalAttempts = 0, totalCorrect = 0;
    for (const k in state.testAttempts) {
      if (k.startsWith(prefix)) {
        totalAttempts += state.testAttempts[k].attempts;
        totalCorrect  += state.testAttempts[k].correct;
      }
    }
    const acc = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;
    const unlocked = tierUnlocked(tier, lang.id, story.id);

    if (unlocked) {
      return `
        <div class="glass tier-card">
          <div class="tc-title gradient-text">Tier ${tier}</div>
          <div class="tc-rules">${ruleNames.map(escapeHtml).join(' · ')}</div>
          <div class="tc-stats">${totalTests} tests in pool · ${totalAttempts} attempts · ${acc}% lifetime accuracy</div>
          <button class="gradient-btn full-btn" data-start-tier="${tier}">Start Tier ${tier}</button>
        </div>
      `;
    }
    return `
      <div class="glass tier-card locked">
        <div class="tc-title"><span class="lock">🔒</span>Tier ${tier}</div>
        <div class="tc-rules">80% accuracy on 20+ Tier ${tier - 1} first attempts to unlock</div>
        <div class="tc-stats">${totalTests} tests in pool · ${totalAttempts} attempts · ${acc}% lifetime accuracy</div>
      </div>
    `;
  }).join('');
}

function renderTestSession(story, lang) {
  const ts = testSession;

  // Wrong-pile rejoin / session end.
  if (ts.idx >= ts.queue.length) {
    if (ts.wrongPile.length > 0) {
      ts.queue = ts.queue.concat(ts.wrongPile);
      ts.wrongPile = [];
    } else {
      const acc = ts.totalThisSession > 0
        ? Math.round(ts.correctOnFirst / ts.totalThisSession * 100)
        : 0;
      const nextTier = ts.tier + 1;
      let celebrateHtml = '';
      if (nextTier <= 3 &&
          !ts.prevNextTierUnlocked &&
          tierUnlocked(nextTier, lang.id, story.id)) {
        celebrateHtml = `<div class="celebrate">🎉 Tier ${nextTier} unlocked!</div>`;
      }
      return `
        <div class="glass session-end">
          <div class="se-title gradient-text">Tier ${ts.tier} complete</div>
          <div class="se-sub">${ts.correctOnFirst} / ${ts.totalThisSession} on first attempt (${acc}%)</div>
          ${celebrateHtml}
          <button class="gradient-btn" data-test-back="1">Back to Tier Selection</button>
        </div>
      `;
    }
  }

  const t = ts.queue[ts.idx];
  const isMultiple = t._type === 'choose-article' && Array.isArray(t._options);
  const targetLangLabel = (lang.name || 'target').toLowerCase();

  if (!ts.revealed) {
    if (isMultiple) {
      // Multiple-choice: render options as buttons; clicking submits.
      const optsHtml = t._options.map((opt, i) =>
        `<button class="ghost-btn full-btn" style="margin: 4px 0;" data-test-option="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
      ).join('');
      return `
        <div class="glass card-pane">
          <div style="text-align: center; margin-bottom: 12px;">
            <span class="rule-tag">${escapeHtml(t.rule)}</span>
          </div>
          <div class="big-sentence gradient-text">${escapeHtml(t.en)}</div>
          <div style="margin-top: 8px;">${optsHtml}</div>
        </div>
      `;
    }
    return `
      <div class="glass card-pane">
        <div style="text-align: center; margin-bottom: 12px;">
          <span class="rule-tag">${escapeHtml(t.rule)}</span>
        </div>
        <div class="big-sentence gradient-text">${escapeHtml(t.en)}</div>
        <textarea class="type-area" id="test-input"
          placeholder="Type your ${escapeHtml(targetLangLabel)} translation..."
          autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">${escapeHtml(ts.lastInput || '')}</textarea>
        <button class="gradient-btn full-btn" id="btn-test-check">Check</button>
      </div>
    `;
  }

  // Reveal pane — same for free-text and multiple-choice. The grader
  // (gradeTestAnswer) already used the right comparison for both.
  const dist = levenshtein(normalize(ts.lastInput || ''), normalize(t.de));
  const ok = isMultiple
    ? (ts.lastInput || '').trim() === t.de.trim()
    : dist <= 2;
  const banner = ok
    ? `<div class="feedback ok">✅ Correct</div>`
    : `<div class="feedback bad">❌ Not quite</div>`;
  return `
    <div class="glass card-pane">
      ${banner}
      <div style="text-align: center; margin-bottom: 12px;">
        <span class="rule-tag">${escapeHtml(t.rule)}</span>
      </div>
      <div class="big-sentence gradient-text">${escapeHtml(t.de)}</div>
      <div class="audio-row">
        <button class="audio-btn" data-action="speak-de" data-text="${escapeHtml(t.de)}">🔊 ${speakLabelForActive()}</button>
      </div>
      ${t.trap ? `<div class="trap-callout">⚠️ ${escapeHtml(t.trap)}</div>` : ''}
      <button class="gradient-btn full-btn" id="btn-test-next" style="margin-top: 14px;">Next</button>
    </div>
  `;
}

/* ============================================================
   SETTINGS TAB — Study prefs, Languages, Stories, Backup, Reset.
   ============================================================ */
function renderSettings() {
  const me = getActiveUser(rawState);
  const isAdmin = me && me.role === 'admin';
  const sections = [
    renderSettingsAccount(),
    renderSettingsBackground(),
    renderSettingsAudio(),
    isAdmin ? renderSettingsUsers() : '',
    renderSettingsStudy(),
    // Theme/cover edits live on each user's own language record, so
    // the section is visible to everyone; the Add/Delete buttons are
    // admin-gated inside renderSettingsLanguages.
    renderSettingsLanguages(),
    // Visible to everyone; admin-only controls inside the section
    // (add story, delete, cover edits, test packs) are gated below.
    renderSettingsStories(),
    renderSettingsBackup(),
    isAdmin ? renderSettingsReset() : ''
  ];
  return sections.join('');
}

/* Audio assets panel — list every story in the active language with
   its expected sentence-file path, current detection state, and a
   button to probe the filesystem (useful for the user to verify
   their audio drop folder). */
function renderSettingsAudio() {
  const lang = getActiveLang();
  if (!lang) return '';
  const stories = (lang.stories || []).map(sid => {
    const story = getStory(lang.id, sid);
    if (!story) return '';
    const sentCount = (story.sentences || []).length;
    const folder = `audio/${lang.id}/${sid}/sentences/`;
    // Roll up: count sentence paths with known status.
    let avail = 0, missing = 0;
    for (let i = 0; i < sentCount; i++) {
      const p = audioPathSentence(lang.id, sid, i);
      if (audioStatus[p] === 'available') avail++;
      else if (audioStatus[p] === 'missing') missing++;
    }
    const probed = avail + missing;
    const statusLine = probed === 0
      ? `<span class="meta">Not yet probed — using TTS fallback.</span>`
      : (avail === sentCount
          ? `<span class="meta" style="color: rgb(134,239,172);">✓ ${avail} / ${sentCount} sentence files found</span>`
          : `<span class="meta">${avail} found · ${missing} missing · ${sentCount - probed} unprobed</span>`);
    return `
      <div class="item-row" style="flex-direction: column; align-items: stretch;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:22px">🎙</div>
          <div class="grow">
            <div class="title">${escapeHtml(story.title)}</div>
            <div class="meta">Drop ${sentCount} files at <code>${escapeHtml(folder)}001.mp3 … ${String(sentCount).padStart(3,'0')}.mp3</code></div>
            <div style="margin-top:6px;">${statusLine}</div>
          </div>
          <div class="actions">
            <button class="small-btn" data-audio-probe="${escapeHtml(sid)}">Detect</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Audio</div>
      <div class="section-sub">Recorded narration > robotic TTS</div>
      <div class="meta" style="margin-bottom: 12px;">
        Drop MP3 files into the per-story folder shown below. The
        app prefers them whenever it plays a sentence; missing
        files fall back to the device's Web Speech voice. Names use
        <code>NNN.mp3</code> (1-indexed, 3-digit) matching each
        sentence's order in the story.
      </div>
      <div class="row-list">${stories || '<div class="empty-state">No stories in this language.</div>'}</div>
    </div>
  `;
}

/* Per-user wallpaper. Image data URL lives in state.settings.bgImage,
   overlay darkness in state.settings.bgOverlay (0..0.85). The image
   is downsized (1280×720 max) before storage to keep localStorage
   within budget. */
function renderSettingsBackground() {
  const s = state.settings;
  const hasBg = !!s.bgImage;
  const overlay = s.bgOverlay == null ? 0.5 : Number(s.bgOverlay);
  const overlayPct = Math.round(overlay * 100);
  const previewStyle = hasBg
    ? `background-image: linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), url('${escapeHtml(s.bgImage)}');`
    : '';
  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Background</div>
      <div class="section-sub">${hasBg ? 'Custom wallpaper set' : 'Using default theme background'}</div>

      <div class="bg-preview ${hasBg ? '' : 'empty'}" style="${previewStyle}">
        ${hasBg ? '' : '<span class="bg-empty-hint">No image set</span>'}
      </div>

      <div class="form-row" style="margin-top: 14px; ${hasBg ? '' : 'opacity:0.5; pointer-events:none;'}">
        <div class="lbl">
          <span>Darken overlay</span>
          <span class="val" id="bg-overlay-val">${overlayPct}%</span>
        </div>
        <input type="range" id="bg-overlay" min="0" max="85" step="5" value="${overlayPct}"
          style="width:100%; accent-color: var(--accent);">
        <div class="meta" style="margin-top:6px;">Higher values keep text readable on bright photos.</div>
      </div>

      <div class="btn-row" style="margin-top: 12px;">
        <button class="gradient-btn" id="btn-set-bg" style="flex:1">${hasBg ? 'Change Image' : 'Upload Image'}</button>
        ${hasBg ? `<button class="ghost-btn" id="btn-clear-bg" style="flex:1">Remove</button>` : ''}
      </div>
    </div>
  `;
}

function renderSettingsAccount() {
  const me = getActiveUser(rawState);
  if (!me) return '';
  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Account</div>
      <div class="section-sub">${escapeHtml(me.name)} · ${me.role === 'admin' ? 'Admin' : 'Learner'}</div>

      <div class="form-row">
        <div class="lbl"><span>Profile name</span><span class="val"></span></div>
        <input type="text" id="acc-name" value="${escapeHtml(me.name)}"
          autocapitalize="words" autocorrect="off" spellcheck="false"
          style="width:100%; background: var(--glass-bg-strong); border:1px solid var(--glass-border); color: var(--text); font-family:inherit; font-size:14px; padding:10px 12px; border-radius: var(--radius-md); -webkit-appearance:none; outline:none;">
      </div>

      <div class="form-row">
        <div class="lbl"><span>Password (leave blank for none)</span><span class="val"></span></div>
        <input type="text" id="acc-pass" value="${escapeHtml(me.password || '')}"
          autocapitalize="off" autocorrect="off" spellcheck="false"
          style="width:100%; background: var(--glass-bg-strong); border:1px solid var(--glass-border); color: var(--text); font-family:inherit; font-size:14px; padding:10px 12px; border-radius: var(--radius-md); -webkit-appearance:none; outline:none;">
      </div>

      <div class="btn-row">
        <button class="gradient-btn" id="btn-save-account" style="flex:1">Save Changes</button>
        <button class="ghost-btn" id="btn-switch-user" style="flex:1">Switch User</button>
      </div>
    </div>
  `;
}

function renderSettingsUsers() {
  const me = getActiveUser(rawState);
  const all = Object.values(rawState.users || {});
  const rows = all.map(u => {
    const isMe = u.id === rawState.activeUserId;
    const isAdmin = u.role === 'admin';
    return `
      <div class="item-row" style="flex-direction: column; align-items: stretch;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="avatar" style="width:42px; height:42px; font-size:18px; margin:0;">${escapeHtml((u.name||'?').charAt(0).toUpperCase())}</div>
          <div class="grow">
            <div class="title">${escapeHtml(u.name)} ${isMe ? '<span class="badge">You</span>' : ''} ${isAdmin ? '<span class="badge">Admin</span>' : ''}</div>
            <div class="meta">id: ${escapeHtml(u.id)} · ${u.password ? '🔒 password set' : '🔓 no password'}</div>
          </div>
        </div>
        <div class="form-row" style="margin-top:10px; margin-bottom:0;">
          <div class="lbl"><span>Name</span><span class="val"></span></div>
          <input type="text" data-edit-user-name="${escapeHtml(u.id)}" value="${escapeHtml(u.name)}"
            style="width:100%; background: var(--glass-bg-strong); border:1px solid var(--glass-border); color: var(--text); font-family:inherit; font-size:14px; padding:8px 10px; border-radius: var(--radius-md); -webkit-appearance:none; outline:none;">
        </div>
        <div class="form-row" style="margin-bottom:0;">
          <div class="lbl"><span>Password</span><span class="val"></span></div>
          <input type="text" data-edit-user-pass="${escapeHtml(u.id)}" value="${escapeHtml(u.password || '')}"
            style="width:100%; background: var(--glass-bg-strong); border:1px solid var(--glass-border); color: var(--text); font-family:inherit; font-size:14px; padding:8px 10px; border-radius: var(--radius-md); -webkit-appearance:none; outline:none;">
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="small-btn" data-save-user="${escapeHtml(u.id)}">Save</button>
          ${(!isMe && !isAdmin) ? `<button class="small-btn danger" data-delete-user="${escapeHtml(u.id)}">Delete</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Users</div>
      <div class="section-sub">Manage profiles · ${all.length} ${all.length === 1 ? 'user' : 'users'}</div>

      <div class="row-list" style="margin-bottom: 14px;">${rows}</div>

      <button class="gradient-btn full-btn" id="btn-add-user">＋ Add User</button>
    </div>
  `;
}

function renderSettingsStudy() {
  const lang = getActiveLang();
  const s = state.settings;
  // Voice options for the active language: filter by lang prefix.
  const langPrefix = (lang.ttsLang || '').split('-')[0].toLowerCase();
  const voiceOpts = (voices || [])
    .filter(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix))
    .map(v => `<option value="${escapeHtml(v.name)}" ${lang.ttsVoice === v.name ? 'selected' : ''}>${escapeHtml(v.name)} — ${escapeHtml(v.lang)}</option>`)
    .join('');
  const voiceSelect = voiceOpts
    ? `<select id="set-voice"><option value="">System default</option>${voiceOpts}</select>`
    : `<div style="font-size:12px;color:var(--text-soft)">No ${lang.name} voices found on this device.</div>`;

  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Study Preferences</div>
      <div class="section-sub">Pacing &amp; audio</div>

      <div class="form-row">
        <div class="lbl"><span>New cards per day</span><span class="val" id="val-new">${s.newPerDay}</span></div>
        <input type="range" id="set-newPerDay" min="3" max="30" step="1" value="${s.newPerDay}">
      </div>

      <div class="form-row">
        <div class="lbl"><span>Daily review cap</span><span class="val" id="val-cap">${s.dailyCap}</span></div>
        <input type="range" id="set-dailyCap" min="10" max="100" step="1" value="${s.dailyCap}">
      </div>

      <div class="form-row">
        <div class="lbl"><span>TTS voice (${escapeHtml(lang.name)})</span><span class="val"></span></div>
        ${voiceSelect}
      </div>

      <div class="form-row">
        <div class="lbl"><span>Playback speed</span><span class="val" id="val-rate">${(s.ttsRate ?? 0.9).toFixed(1)}×</span></div>
        <input type="range" id="set-rate" min="0.6" max="1.2" step="0.1" value="${s.ttsRate ?? 0.9}">
      </div>
    </div>
  `;
}

function renderSettingsLanguages() {
  const me = getActiveUser(rawState);
  const isAdmin = me && me.role === 'admin';
  const langs = Object.values(state.languages);
  const active = getActiveLang();
  const builtinIds = new Set(Object.keys(BUILTIN_LANGUAGES));
  const rows = langs.map(l => {
    const isActive = l.id === state.activeLanguageId;
    const isBuiltin = builtinIds.has(l.id);
    const currentPresetId = matchPresetId(l.theme);
    const presetOpts = Object.entries(THEME_PRESETS).map(([id, p]) =>
      `<option value="${id}" ${currentPresetId === id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');
    const customOpt = currentPresetId == null
      ? `<option value="" selected>Custom (uploaded)</option>` : '';
    const cover = l.coverImage;
    const thumbStyle = cover ? `background-image: url('${escapeHtml(cover)}');` : '';
    const thumbInner = cover
      ? ''
      : (getDefaultCoverSvg(l.id) || `<span>📷</span>`);
    return `
      <div class="item-row" style="flex-direction: column; align-items: stretch;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:22px">${l.flag}</div>
          <div class="grow">
            <div class="title">${escapeHtml(l.name)} ${isActive ? '<span class="badge">Active</span>' : ''}</div>
            <div class="meta">${l.stories.length} ${l.stories.length === 1 ? 'story' : 'stories'}${isBuiltin ? ' · Built-in' : ''}</div>
          </div>
          <div class="actions">
            ${!isActive ? `<button class="small-btn" data-set-active-lang="${escapeHtml(l.id)}">Set Active</button>` : ''}
            ${(isAdmin && !isActive && !isBuiltin) ? `<button class="small-btn danger" data-delete-lang="${escapeHtml(l.id)}">Delete</button>` : ''}
          </div>
        </div>
        <div class="form-row" style="margin-top: 10px; margin-bottom: 0;">
          <div class="lbl"><span>Theme</span><span class="val"></span></div>
          <select data-theme-lang="${escapeHtml(l.id)}">
            ${customOpt}${presetOpts}
          </select>
        </div>
        <div class="cover-row">
          <div class="cover-thumb" style="${thumbStyle}">${cover ? '' : thumbInner}</div>
          <div class="grow">
            <div class="meta" style="margin-top: 0;">${cover ? 'Custom cover image set' : 'Using default cover art'}</div>
          </div>
          <div class="actions">
            <button class="small-btn" data-set-lang-cover="${escapeHtml(l.id)}">${cover ? 'Change' : 'Set Cover'}</button>
            ${cover ? `<button class="small-btn danger" data-clear-lang-cover="${escapeHtml(l.id)}">Remove</button>` : ''}
          </div>
        </div>
        ${(l.suggestedProtagonistNames || l.defaultProtagonist) ? `
        <div class="cover-row">
          <div class="cover-thumb" style="font-size: 22px;">👤</div>
          <div class="grow">
            <div class="meta" style="margin-top: 0;">Protagonist: <strong>${escapeHtml(l.protagonistName || l.defaultProtagonist || '—')}</strong></div>
          </div>
          <div class="actions">
            <button class="small-btn" data-set-protagonist="${escapeHtml(l.id)}">Change</button>
          </div>
        </div>` : ''}
        ${l.stories.length ? `
        <div class="btn-row" style="margin-top: 10px;">
          <button class="small-btn danger" data-restart-lang="${escapeHtml(l.id)}">Restart all stories</button>
        </div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Languages</div>
      <div class="section-sub">${active.flag} ${escapeHtml(active.name)} (Active)</div>

      <div class="btn-row" style="margin-bottom: 12px;">
        <button class="gradient-btn" id="btn-switch-lang" style="flex:1">Switch Language</button>
        ${isAdmin ? `<button class="gradient-btn" id="btn-add-lang" style="flex:1">Add New Language</button>` : ''}
      </div>

      <div class="row-list">${rows}</div>
    </div>
  `;
}

function renderSettingsStories() {
  const lang = getActiveLang();
  const me = getActiveUser(rawState);
  const isAdmin = me && me.role === 'admin';
  const items = lang.stories.map(storyId => {
    const story = getStory(lang.id, storyId);
    if (!story) return '';
    const stats = getStats(state, lang.id, storyId);
    const builtinTests = story.grammarTests.length;
    const packs = Object.values(state.testPacks)
      .filter(p => p.languageId === lang.id && p.storyId === storyId);
    const packTotal = packs.reduce((a, p) => a + p.tests.length, 0);
    const isBuiltin = !!(BUILTIN_STORIES[lang.id] && BUILTIN_STORIES[lang.id].story && BUILTIN_STORIES[lang.id].story.id === storyId);
    const cover = story.coverImage;
    const compoundId = `${lang.id}::${storyId}`;
    const thumbStyle = cover ? `background-image: url('${escapeHtml(cover)}');` : '';
    const thumbInner = cover ? '' : (getDefaultCoverSvg(lang.id) || `<span>📷</span>`);

    const packRows = packs.map(p => `
      <div class="item-row" style="margin-top:6px;">
        <div class="grow">
          <div class="title" style="font-size:13px">${escapeHtml(p.name || p.id)}</div>
          <div class="meta">${p.tests.length} tests · id: ${escapeHtml(p.id)}</div>
        </div>
        ${isAdmin ? `<div class="actions">
          <button class="small-btn danger" data-delete-pack="${escapeHtml(`${lang.id}::${p.id}`)}">Delete</button>
        </div>` : ''}
      </div>
    `).join('');

    return `
      <div class="item-row" style="flex-direction: column; align-items: stretch;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="grow">
            <div class="title">${escapeHtml(story.title)} ${isBuiltin ? '<span class="badge">Built-in</span>' : ''}</div>
            <div class="meta">${escapeHtml(story.level)} · ${story.sentences.length} sentences · ${stats.mastered}/${stats.total} mastered</div>
            ${isAdmin ? `<div class="meta">Default tests: ${builtinTests} · Test packs: ${packs.length} (+${packTotal} tests)</div>` : ''}
          </div>
        </div>
        ${isAdmin ? `<div class="cover-row">
          <div class="cover-thumb" style="${thumbStyle}">${cover ? '' : thumbInner}</div>
          <div class="grow">
            <div class="meta" style="margin-top: 0;">${cover ? 'Custom cover image set' : 'Using default cover art'}</div>
          </div>
          <div class="actions">
            <button class="small-btn" data-set-story-cover="${escapeHtml(compoundId)}">${cover ? 'Change' : 'Set Cover'}</button>
            ${cover ? `<button class="small-btn danger" data-clear-story-cover="${escapeHtml(compoundId)}">Remove</button>` : ''}
          </div>
        </div>` : ''}
        ${(isAdmin && packs.length) ? `<div style="margin-top:10px;">${packRows}</div>` : ''}
        <div class="btn-row" style="margin-top: 10px;">
          <button class="small-btn danger" data-restart-story="${escapeHtml(compoundId)}">Restart progress</button>
          ${(isAdmin && !isBuiltin) ? `<button class="small-btn danger" data-delete-story="${escapeHtml(compoundId)}">Delete Story</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Stories — ${escapeHtml(lang.name)}</div>
      <div class="section-sub">${isAdmin ? 'Add &amp; manage content' : 'Your progress'}</div>

      ${isAdmin ? `<div class="btn-row" style="margin-bottom: 12px;">
        <button class="gradient-btn" id="btn-add-story" style="flex:1">Add New Story</button>
        <button class="gradient-btn" id="btn-add-testpack" style="flex:1">Add Test Pack</button>
      </div>` : ''}

      <div class="row-list">${items || '<div style="color:var(--text-soft);font-size:13px">No stories yet.</div>'}</div>
    </div>
  `;
}

function renderSettingsBackup() {
  const last = state.lastBackup;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const lastText = last ? new Date(last).toISOString().slice(0, 10) : 'Never';
  const warn = (last == null || days >= 14)
    ? `<div class="warning-banner">⚠️ Backup recommended — ${last == null ? 'never backed up' : `last backup ${days} days ago`}</div>`
    : '';
  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Backup</div>
      <div class="section-sub">Export &amp; restore</div>
      ${warn}
      <div class="form-row" style="margin-bottom: 14px;">
        <div class="lbl"><span>Last backup</span><span class="val">${lastText}</span></div>
      </div>
      <div class="btn-row">
        <button class="gradient-btn" id="btn-export-backup" style="flex:1">Export Backup</button>
        <button class="ghost-btn" id="btn-import-backup" style="flex:1">Import Backup</button>
      </div>
    </div>
  `;
}

function renderSettingsReset() {
  return `
    <div class="glass section-card">
      <div class="section-title gradient-text">Reset</div>
      <div class="section-sub">Wipe all data</div>
      <div class="warning-banner">⚠️ This erases ALL progress, uploaded stories, and uploaded languages on this device. Cannot be undone.</div>
      <button class="danger-btn" id="btn-reset">Reset all data</button>
    </div>
  `;
}

function renderTabContent() {
  // Cross-story Review (library-level) overrides the active tab —
  // keeps the Cards UI familiar but skips its toggles.
  if (globalReview && globalReview.active) return renderGlobalReview();
  const tab = getActiveLang().lastTab || 'library';
  switch (tab) {
    case 'library':  return renderLibrary();
    case 'read':     return renderRead();
    case 'rules':    return renderRules();
    case 'cards':    return renderCards();
    case 'test':     return renderTest();
    case 'settings': return renderSettings();
    default:         return renderLibrary();
  }
}

/* ============================================================
   GLOBAL REVIEW — Stage E. Cross-story SRS-due cards aggregated
   from every story whose drill flow has finished (phase ===
   'free-practice'). Capped at 20 cards per session per spec §6.1.
   ============================================================ */
function startGlobalReview() {
  const eligible = collectGlobalReviewQueue();
  if (!eligible.length) {
    showToast('Nothing due across completed stories — come back later.', 'info');
    return;
  }
  const queue = shuffleArray(eligible).slice(0, GLOBAL_REVIEW_LIMIT);
  globalReview = {
    active: true,
    queue,
    idx: 0,
    wrongPile: [],
    revealed: false,
    flipped: false,
    lastInput: '',
    correctOnFirst: 0,
    originalQueueLen: queue.length,
    mode: state.settings.cardMode || 'type',
    source: 'mixed',
    // langId/storyId get rewritten per-card during render so
    // logActivity records hit the right story.
    langId: null,
    storyId: null
  };
  cardSession = globalReview;
  stopPlayAll();
  render();
}

function collectGlobalReviewQueue() {
  const out = [];
  const now = Date.now();
  const langs = state.languages || {};
  for (const langId in langs) {
    const lang = langs[langId];
    const sp = lang.storyProgress || {};
    for (const storyId in sp) {
      if (sp[storyId].phase !== 'free-practice') continue;
      const prefix = `${langId}::${storyId}::`;
      for (const cid in state.cards) {
        if (!cid.startsWith(prefix)) continue;
        const c = state.cards[cid];
        // Due if new (reps=0) or scheduled review has come round.
        const isDue = c.reps === 0 || (c.nextReview != null && c.nextReview <= now);
        if (isDue) out.push({ id: cid });
      }
    }
  }
  return out;
}

function renderGlobalReview() {
  const session = globalReview;
  if (!session) return '';

  // Session ended.
  if (session.queue.length === 0 && session.wrongPile.length === 0) {
    return `
      <div class="glass session-end">
        <div class="se-title gradient-text">✅ Review done</div>
        <div class="se-sub">${session.correctOnFirst} / ${session.originalQueueLen} correct on first attempt.</div>
        <button class="gradient-btn" data-review-exit="1">Back to Library</button>
      </div>
    `;
  }
  // End-of-batch — rotate wrongPile.
  if (session.idx >= session.queue.length) {
    if (session.wrongPile.length > 0) {
      session.queue = session.queue.concat(session.wrongPile);
      session.wrongPile = [];
    } else {
      return `
        <div class="glass session-end">
          <div class="se-title gradient-text">✅ Review done</div>
          <div class="se-sub">${session.correctOnFirst} / ${session.originalQueueLen} correct on first attempt.</div>
          <button class="gradient-btn" data-review-exit="1">Back to Library</button>
        </div>
      `;
    }
  }

  const card = session.queue[session.idx];
  const parts = card.id.split('::');
  const langId = parts[0];
  const storyId = parts[1];
  const story = state.storiesData[`${langId}::${storyId}`];
  if (!story) {
    // Story missing (deleted?) — skip.
    session.idx++;
    return renderGlobalReview();
  }
  // Update session lang/story so grading's logActivity hits the right story.
  session.langId = langId;
  session.storyId = storyId;
  const content = getCardContent(card.id, story);
  if (!content) {
    session.idx++;
    return renderGlobalReview();
  }

  const top = `
    <div class="fr-top-row">
      <div class="fr-step-pill">Review · ${escapeHtml(story.title)}</div>
      <button class="ghost-btn fr-exit-btn" data-review-exit="1">← Library</button>
    </div>
    <div class="drill-progress-line">${session.idx + 1} / ${session.originalQueueLen} · ${session.correctOnFirst} correct on first attempt</div>
  `;
  const body = session.mode === 'type'
    ? renderCardsType(session, card, content)
    : renderCardsSpeak(session, card, content);
  return top + body;
}

/* ============================================================
   RULES TAB — long-form grammar explanations from the active
   story. Each rule renders as a glass card with examples (highlighted
   focus token) and tip bullets. Falls back gracefully when a story
   only has the legacy `desc` field without longExplanation/examples/tips.
   ============================================================ */
function renderRules() {
  const lang = getActiveLang();
  const storyId = lang.lastStoryId;
  if (!storyId) {
    return `<div class="glass empty-state">
      <div class="em-icon">📘</div>
      Pick a story from Library to view its grammar rules.
    </div>`;
  }
  const story = getStory(lang.id, storyId);
  if (!story) return `<div class="glass empty-state">Story not found.</div>`;
  if (!Array.isArray(story.grammarRules) || story.grammarRules.length === 0) {
    return `<div class="glass empty-state">No grammar rules defined for this story.</div>`;
  }

  // Group rules by tier (1 → 2 → 3) so the page reads from foundation
  // up. Within a tier, preserve the JSON's order.
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

  return sections;
}

function renderRuleCard(rule, tier) {
  const explanation = rule.longExplanation || rule.desc || '';
  const examples = Array.isArray(rule.examples) ? rule.examples : [];
  const tips = Array.isArray(rule.tips) ? rule.tips : [];

  const exampleHtml = examples.length > 0
    ? `<div class="rc-section-label">Examples</div>` + examples.map(ex => {
        const de = ex.highlight && ex.de
          ? highlightToken(ex.de, ex.highlight)
          : escapeHtml(ex.de || '');
        return `
          <div class="rule-example">
            <div class="ex-de">${de}</div>
            <div class="ex-en">${escapeHtml(ex.en || '')}</div>
            <button class="audio-btn" data-action="speak-de" data-text="${escapeHtml(ex.de || '')}">🔊 ${speakLabelForActive()}</button>
          </div>
        `;
      }).join('')
    : '';

  const tipsHtml = tips.length > 0
    ? `<div class="rc-section-label">Tips</div>
       <ul class="rule-tips">${tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';

  const tableHtml = rule.table ? renderRuleTable(rule.table) : '';

  return `
    <div class="glass rule-card">
      <div class="rc-tier">Tier ${tier}</div>
      <div class="rc-name gradient-text">${escapeHtml(rule.name || 'Untitled rule')}</div>
      <div class="rc-explain">${escapeHtml(explanation)}</div>
      ${tableHtml}
      ${exampleHtml}
      ${tipsHtml}
    </div>
  `;
}

// Render a rule's optional paradigm table. Wide tables get
// horizontal scroll on narrow screens.
function renderRuleTable(table) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) return '';
  const titleHtml = table.title ? `<div class="rc-section-label">${escapeHtml(table.title)}</div>` : '';
  const headerHtml = `<tr>${table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const rowsHtml = table.rows.map(row =>
    `<tr>${row.map((cell, ci) => {
      // First column is a row label; render slightly dimmer.
      const cls = ci === 0 ? 'rt-label' : '';
      return `<td class="${cls}">${escapeHtml(String(cell))}</td>`;
    }).join('')}</tr>`
  ).join('');
  const noteHtml = table.note ? `<div class="rt-note">${escapeHtml(table.note)}</div>` : '';
  return `
    ${titleHtml}
    <div class="rule-table-wrap">
      <table class="rule-table">
        <thead>${headerHtml}</thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${noteHtml}
  `;
}

// Wraps the first occurrence of `token` inside `text` with <mark>.
// Case-sensitive — example tokens in the JSON are written as they
// appear in the sentence (capitalized at sentence start, etc.).
function highlightToken(text, token) {
  const idx = text.indexOf(token);
  if (idx < 0) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + token.length);
  const after = text.slice(idx + token.length);
  return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`;
}

function render() {
  // Login gate: show the user picker until a profile is selected.
  if (!loggedIn) {
    renderLoginScreen();
    return;
  }
  document.body.classList.remove('locked');
  const lr = document.getElementById('login-root');
  if (lr) lr.remove();

  // Refresh body background each render so drilling into / out of a
  // language swaps to that language's cover image automatically.
  applyBackgroundImage();

  // Cinema mode for First-Read Step 1 narration phase: full-screen
  // cover with sync-highlighted sentences, no app chrome.
  if (shouldShowCinema()) {
    mountCinemaNarration();
    return;
  }
  unmountCinemaNarration();

  // Two stripped chrome modes:
  //   onTopPicker     — language chooser (no stats, no tabs)
  //   onStoryPicker   — drilled into a language, browsing stories
  //                     (stats stay for context, tabs hidden until
  //                     a story is opened)
  // Once the user opens a story (lastTab !== 'library') the full
  // chrome with the Read/Rules/Cards/Test/Settings tab bar is back.
  const lang = getActiveLang();
  const onTopPicker   = !state.libraryDrilledIn && lang && lang.lastTab === 'library';
  const onStoryPicker = !!state.libraryDrilledIn && lang && lang.lastTab === 'library';

  const root = document.getElementById('app');
  root.innerHTML =
    renderHeader() +
    (onTopPicker ? '' : renderStats()) +
    (onTopPicker || onStoryPicker ? '' : renderTabBar()) +
    `<div id="tab-content">${renderTabContent()}</div>`;
  bindHandlers();
}

function shouldShowCinema() {
  // Listen-card invocation: cinema regardless of first-read progress.
  if (cinemaListen) {
    const lang = getActiveLang();
    if (lang && lang.id === cinemaListen.langId
        && getStory(cinemaListen.langId, cinemaListen.storyId)) {
      return true;
    }
  }
  // Hub-driven sub-modes (Grammar / Walkthrough) also take over the
  // full screen as cinematic experiences.
  const lang = getActiveLang();
  const sid = lang && lang.lastStoryId;
  if (!sid || lang.lastTab !== 'read') return false;
  if (lang.readSubMode === 'grammar' || lang.readSubMode === 'walkthrough') return true;
  // First-read Step 1 — both 'intro' (English atmosphere) and
  // 'narration' (Italian sentences) play inside cinema mode.
  const story = getStory(lang.id, sid);
  const prog = getStoryProgress(lang.id, sid);
  return !!(story && prog
    && prog.phase === 'first-read'
    && prog.firstReadStep === 1
    && (prog.step1Phase === 'intro' || prog.step1Phase === 'narration'));
}
