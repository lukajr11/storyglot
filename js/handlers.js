'use strict';

/* Login + name select + language switcher + event wiring + grading + swipe + dev. */

/* ============================================================
   LOGIN SCREEN — Netflix-style profile picker. Shown on every
   page load and after "Switch User". Tapping a profile prompts
   for password if one is set; empty password = direct login.
   ============================================================ */
function renderLoginScreen() {
  document.body.classList.add('locked');
  let root = document.getElementById('login-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'login-root';
    document.body.appendChild(root);
  }
  const users = Object.values(rawState.users || {});
  const cards = users.map(u => {
    const initial = (u.name || '?').charAt(0).toUpperCase();
    const hasPass = !!(u.password && u.password.length > 0);
    return `
      <div class="glass profile-card" data-pick-user="${escapeHtml(u.id)}">
        <div class="avatar">${escapeHtml(initial)}</div>
        <div class="pname">${escapeHtml(u.name)}${hasPass ? '<span class="lock-badge">🔒</span>' : ''}</div>
        <div class="prole">${u.role === 'admin' ? 'Admin' : 'Learner'}</div>
      </div>
    `;
  }).join('');
  root.innerHTML = `
    <div class="login-screen">
      <div class="greeting">
        <div class="brand"><span class="gradient-text">STORYGLOT</span> <span style="color:var(--accent)">✦</span></div>
        <div class="ask">Who's learning?</div>
      </div>
      <div class="profile-grid">${cards}</div>
    </div>
  `;
  bindLoginHandlers();
}

function bindLoginHandlers() {
  document.querySelectorAll('[data-pick-user]').forEach(el => {
    el.addEventListener('click', async () => {
      const uid = el.getAttribute('data-pick-user');
      const user = rawState.users[uid];
      if (!user) return;
      if (user.password && user.password.length > 0) {
        const ok = await passwordPromptModal(user);
        if (!ok) return;
      }
      completeLogin(uid);
    });
  });
}

function passwordPromptModal(user) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="glass modal">
          <div class="modal-title">Enter password for ${escapeHtml(user.name)}</div>
          <div class="modal-body">
            <p>This profile is password protected.</p>
            <input type="password" id="m-pass" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false">
          </div>
          <div class="btn-row">
            <button class="ghost-btn" id="m-cancel" style="flex:1">Cancel</button>
            <button class="gradient-btn" id="m-confirm" style="flex:1">Sign In</button>
          </div>
        </div>
      </div>`;
    const inp = document.getElementById('m-pass');
    const finish = (val) => { closeModal(); resolve(val); };
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') finish(false);
    });
    document.getElementById('m-cancel').addEventListener('click', () => finish(false));
    document.getElementById('m-confirm').addEventListener('click', () => {
      if (inp.value === user.password) finish(true);
      else { showToast('Wrong password', 'error'); inp.value = ''; inp.focus(); }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('m-confirm').click();
    });
    try { inp.focus(); } catch {}
  });
}

function completeLogin(uid) {
  rawState.activeUserId = uid;
  saveStateLocal();
  // Discard any in-memory sessions from a previous user.
  cardSession = null;
  testSession = null;
  loggedIn = true;
  const lang = getActiveLang();
  if (lang && lang.theme) applyTheme(lang.theme);
  // Each user has their own wallpaper; reapply on every login.
  applyBackgroundImage();
  render();
  showToast(`Welcome, ${rawState.users[uid].name}`, 'success');
}

function logoutToPicker() {
  stopPlayAll();
  cardSession = null;
  testSession = null;
  loggedIn = false;
  render();
}

// Save just to localStorage without going through the chunk-3b
// sync path (which may not exist yet). Used by login flow.
function saveStateLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rawState)); }
  catch (e) { console.warn('saveStateLocal failed', e); }
}

/* ============================================================
   NAME SELECTION SCREEN — full-screen overlay shown the first
   time the learner taps Start on a story whose language uses
   {{PROTAGONIST}} substitution.
   ============================================================ */
function openNameSelection(lang, onConfirm) {
  let root = document.getElementById('name-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'name-root';
    document.body.appendChild(root);
  }
  document.body.classList.add('name-locked');

  const suggestions = lang.suggestedProtagonistNames || [];
  const defaultName = lang.defaultProtagonist || (suggestions[0] || '');
  const genderHint = lang.protagonistGender
    ? `Names assume ${escapeHtml(lang.protagonistGender)} grammar (the prose uses matching adjective/article agreement).`
    : '';
  const svgArt = getDefaultCoverSvg(lang.id) || '';

  const optsHtml = suggestions.map(n =>
    `<option value="${escapeHtml(n)}" ${n === defaultName ? 'selected' : ''}>${escapeHtml(n)}</option>`
  ).join('');

  root.innerHTML = `
    <div class="name-screen">
      <div class="ns-bg">${svgArt}</div>
      <div class="ns-overlay"></div>
      <div class="glass ns-card">
        <div class="ns-flag">${lang.flag || ''}</div>
        <div class="ns-title gradient-text">Choose your protagonist's name</div>
        <div class="ns-sub">${escapeHtml(lang.name)} — every story in this journey will use the name you pick. ${genderHint}</div>

        ${suggestions.length ? `
          <select id="ns-suggested">
            ${optsHtml}
          </select>
          <div class="ns-or">— or —</div>
        ` : ''}
        <input type="text" id="ns-custom" placeholder="Type a custom name" autocapitalize="words" autocorrect="off" spellcheck="false" value="">

        <div class="ns-actions">
          <button class="ghost-btn" id="ns-cancel" style="flex:1">Cancel</button>
          <button class="gradient-btn" id="ns-confirm" style="flex:1">Confirm</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    document.body.classList.remove('name-locked');
    const node = document.getElementById('name-root');
    if (node) node.remove();
  };

  document.getElementById('ns-cancel').addEventListener('click', close);
  document.getElementById('ns-confirm').addEventListener('click', () => {
    const custom = (document.getElementById('ns-custom').value || '').trim();
    const sel = document.getElementById('ns-suggested');
    const fromList = sel ? sel.value : '';
    const chosen = custom || fromList || defaultName;
    if (!chosen) {
      showToast('Pick a name or type one', 'error');
      return;
    }
    // Apply across every user (so Sofia & Luka see the same name
    // for the same language, just like a book.json default).
    for (const uid in rawState.users) {
      const userLang = rawState.users[uid].languages?.[lang.id];
      if (userLang) userLang.protagonistName = chosen;
    }
    saveState();
    close();
    showToast(`Protagonist set: ${chosen}`, 'success');
    if (typeof onConfirm === 'function') onConfirm();
  });

  // Pre-focus the custom input so iPad users can just type.
  const inp = document.getElementById('ns-custom');
  if (inp) { try { inp.focus(); } catch {} }
}

/* ============================================================
   LANGUAGE SWITCHER MODAL
   ============================================================ */
function openLangModal() {
  const root = document.getElementById('modal-root');
  const langs = Object.values(state.languages);
  const rows = langs.map(l => `
    <div class="lang-row ${l.id === state.activeLanguageId ? 'active' : ''}" data-pick-lang="${escapeHtml(l.id)}">
      <div class="flag">${l.flag}</div>
      <div>
        <div class="name">${escapeHtml(l.name)}</div>
        <div class="sub">${l.stories.length} ${l.stories.length === 1 ? 'story' : 'stories'}</div>
      </div>
    </div>
  `).join('');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="glass modal" id="modal-card">
        <div class="modal-title">Switch Language</div>
        <div class="lang-list">${rows}</div>
        <button class="ghost-btn" id="modal-close" style="width:100%">Close</button>
      </div>
    </div>
  `;
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeLangModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeLangModal);
  document.querySelectorAll('[data-pick-lang]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-pick-lang');
      switchLanguage(id);
      closeLangModal();
    });
  });
}

function closeLangModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function switchLanguage(langId) {
  if (!state.languages[langId]) return;
  stopPlayAll();
  // Discard ephemeral sessions — they belong to the previous language.
  cardSession = null;
  testSession = null;
  state.activeLanguageId = langId;
  // Reset library nav so a quick language switch doesn't leave the
  // library showing stories from a different language than the one
  // selected as active.
  state.libraryDrilledIn = langId;
  applyTheme(state.languages[langId].theme);
  saveState();
  render();
}

/* ============================================================
   EVENT WIRING — re-bound after each render().
   ============================================================ */
function bindHandlers() {
  // Header: open language modal.
  const langBtn = document.getElementById('btn-lang');
  if (langBtn) langBtn.addEventListener('click', openLangModal);

  // Tabs.
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      const tab = el.getAttribute('data-tab');
      stopPlayAll();
      getActiveLang().lastTab = tab;
      saveState();
      render();
    });
  });

  // Library top-level: tap a language journey card → drill in.
  // If the language uses {{PROTAGONIST}} substitution and the user
  // hasn't picked a name yet, show the name-selection screen first;
  // we drill in only after they've confirmed.
  document.querySelectorAll('[data-enter-lang]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-enter-lang');
      const lang = state.languages[id];
      if (!lang) return;
      if (state.activeLanguageId !== id) {
        switchLanguage(id);          // theme + active swap
      }
      const drillIn = () => {
        state.libraryDrilledIn = id;
        cardSession = null;
        testSession = null;
        saveState();
        render();
      };
      const needsName = !!(
        (lang.suggestedProtagonistNames && lang.suggestedProtagonistNames.length) ||
        lang.defaultProtagonist
      ) && !lang.protagonistName;
      if (needsName) {
        openNameSelection(lang, drillIn);
        return;
      }
      drillIn();
    });
  });

  // Listen-card → enter cinema mode for the chosen story without
  // touching first-read progress. Clicks on the inner play button
  // bubble up to the card.
  document.querySelectorAll('[data-listen-story]').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.getAttribute('data-listen-story');
      const lang = getActiveLang();
      if (!lang || !sid) return;
      lang.lastStoryId = sid;
      cinemaListen = { langId: lang.id, storyId: sid };
      saveState();
      render();
    });
  });

  // Story-hub tiles (Grammar / Walkthrough) and Back to hub.
  document.querySelectorAll('[data-hub-mode]').forEach(el => {
    el.addEventListener('click', () => {
      const lang = getActiveLang();
      if (!lang) return;
      lang.readSubMode = el.getAttribute('data-hub-mode');
      saveState();
      render();
    });
  });
  document.querySelectorAll('[data-hub-back]').forEach(el => {
    el.addEventListener('click', () => {
      const lang = getActiveLang();
      if (!lang) return;
      lang.readSubMode = null;
      saveState();
      render();
    });
  });

  // Drilled-in view: back to top-level language picker.
  document.querySelectorAll('[data-back-to-langs]').forEach(el => {
    el.addEventListener('click', () => {
      state.libraryDrilledIn = null;
      saveState();
      render();
    });
  });

  // Global Review button (top-level library). Stage E will wire
  // the real cross-story SRS aggregation; for now, surface a
  // placeholder toast so the affordance is discoverable.
  document.querySelectorAll('[data-global-review]').forEach(btn => {
    btn.addEventListener('click', () => startGlobalReview());
  });
  document.querySelectorAll('[data-review-exit]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      globalReview = null;
      cardSession = null;
      render();
    });
  });

  // Story tile "Start / Continue" → open the story. The protagonist
  // name is asked once at language-entry, so by the time we get here
  // it should already be set; if it's somehow missing (older state),
  // fall back silently to the language's default rather than
  // interrupting the flow with a modal.
  document.querySelectorAll('[data-open-story]').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.getAttribute('data-open-story');
      const lang = getActiveLang();
      if (!lang) return;
      if (!lang.protagonistName && lang.defaultProtagonist) {
        lang.protagonistName = lang.defaultProtagonist;
      }
      lang.lastStoryId = sid;
      lang.lastTab = 'read';
      saveState();
      render();
    });
  });

  // Read tab: full / sentence toggle.
  document.querySelectorAll('[data-read-mode]').forEach(el => {
    el.addEventListener('click', () => {
      const mode = el.getAttribute('data-read-mode');
      stopPlayAll();
      getActiveLang().readMode = mode;
      saveState();
      render();
    });
  });

  // Read tab: play whole story / stop.
  const playBtn = document.getElementById('btn-play-all');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (playback.active) {
        stopPlayAll();
        return;
      }
      const lang = getActiveLang();
      const story = getStory(lang.id, lang.lastStoryId);
      if (!story) return;
      startPlayAll(story.sentences, lang.ttsLang);
    });
  }

  // Read tab (full mode): show/hide English block.
  const engBtn = document.getElementById('btn-toggle-english');
  if (engBtn) {
    engBtn.addEventListener('click', () => {
      const block = document.getElementById('english-block');
      const shown = engBtn.getAttribute('data-shown') === '1';
      if (shown) {
        block.style.display = 'none';
        engBtn.textContent = 'Show English ↓';
        engBtn.setAttribute('data-shown', '0');
      } else {
        block.style.display = 'block';
        engBtn.textContent = 'Hide English ↑';
        engBtn.setAttribute('data-shown', '1');
      }
    });
  }

  // Read tab (sentence mode): tap row to speak that sentence.
  document.querySelectorAll('.sentence-row[data-speak]').forEach(el => {
    el.addEventListener('click', () => {
      const text = el.getAttribute('data-speak');
      const idxAttr = el.getAttribute('data-sent-idx');
      const lang = getActiveLang();
      stopPlayAll();  // cancel speech + active audio element
      // Brief flash highlight on the tapped row.
      document.querySelectorAll('.sentence-row.active').forEach(r => r.classList.remove('active'));
      el.classList.add('active');
      const useFile = idxAttr !== null && lang && lang.lastStoryId;
      const promise = useFile
        ? playSentenceFile(lang.id, lang.lastStoryId, parseInt(idxAttr, 10), text, lang.ttsLang)
        : speak(text, lang.ttsLang);
      promise.then(() => el.classList.remove('active'));
    });
  });

  /* ---------- Audio buttons (Type / Speak / Test) ---------- */
  document.querySelectorAll('[data-action="speak-de"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-text');
      stopSpeak();
      btn.classList.add('speaking');
      speak(text, getActiveLang().ttsLang).finally(() => btn.classList.remove('speaking'));
    });
  });
  document.querySelectorAll('[data-action="speak-en"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-text');
      stopSpeak();
      btn.classList.add('speaking');
      speak(text, 'en-US').finally(() => btn.classList.remove('speaking'));
    });
  });

  /* ---------- Cards: mode toggle ---------- */
  document.querySelectorAll('[data-card-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.getAttribute('data-card-mode');
      if (state.settings.cardMode === m) return;
      state.settings.cardMode = m;
      saveState();
      render();
    });
  });

  /* ---------- Cards: source toggle (Sentences / Vocabulary) ---------- */
  document.querySelectorAll('[data-card-source]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const s = btn.getAttribute('data-card-source');
      if (state.settings.cardSource === s) return;
      state.settings.cardSource = s;
      // Switching source = different SRS pool, so end the current session.
      cardSession = null;
      saveState();
      render();
    });
  });

  /* ---------- Cards: navigation buttons (next batch / back) ---------- */
  document.querySelectorAll('[data-cards-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      cardSession = null;  // force rebuild of fresh batch
      render();
    });
  });
  document.querySelectorAll('[data-go-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-go-tab');
      getActiveLang().lastTab = t;
      saveState();
      render();
    });
  });

  /* ---------- Cards: Type mode flow ---------- */
  const showAnswerBtn = document.getElementById('btn-show-answer');
  if (showAnswerBtn && cardSession) {
    showAnswerBtn.addEventListener('click', () => {
      const input = document.getElementById('type-input');
      cardSession.lastInput = input ? input.value : '';
      cardSession.revealed = true;
      render();
    });
    // Auto-focus is generally allowed if we're inside a user-gesture
    // chain (tab tap or grade tap got us here). On iPad first paint
    // it may not focus; that's acceptable.
    const ti = document.getElementById('type-input');
    if (ti && !cardSession.lastInput) {
      try { ti.focus({ preventScroll: true }); } catch {}
    }
  }
  document.querySelectorAll('[data-grade]').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = parseInt(btn.getAttribute('data-grade'), 10);
      gradeTypeCard(q);
    });
  });

  /* ---------- Cards: Speak mode flow ---------- */
  const flipCard = document.getElementById('flip-card');
  if (flipCard && cardSession && state.settings.cardMode === 'speak') {
    if (!cardSession.flipped) {
      // Front of card: tap-to-flip is the only interaction. Swipe is
      // intentionally NOT attached — Speak mode forces recall before
      // reveal, so users can't grade a card they haven't flipped.
      flipCard.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        cardSession.flipped = true;
        render();
      });
    } else {
      // Back of card: swipe left = Wrong, swipe right = Right.
      attachSwipe(flipCard, {
        onLeft:  () => speakGrade('wrong'),
        onRight: () => speakGrade('right')
      });
    }
  }
  document.querySelectorAll('[data-speak-grade]').forEach(btn => {
    btn.addEventListener('click', () => {
      speakGrade(btn.getAttribute('data-speak-grade'));
    });
  });

  /* ---------- Test: tier selection / session flow ---------- */
  document.querySelectorAll('[data-start-tier]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = parseInt(btn.getAttribute('data-start-tier'), 10);
      startTestSession(tier);
    });
  });
  const testCheckBtn = document.getElementById('btn-test-check');
  if (testCheckBtn && testSession) {
    testCheckBtn.addEventListener('click', () => {
      const input = document.getElementById('test-input');
      testSession.lastInput = input ? input.value : '';
      gradeTestAnswer();
    });
    const ti = document.getElementById('test-input');
    if (ti && !testSession.lastInput) {
      try { ti.focus({ preventScroll: true }); } catch {}
    }
  }
  // Multi-choice test ("choose-article"): tapping an option records
  // it as the input and grades immediately.
  document.querySelectorAll('[data-test-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!testSession) return;
      testSession.lastInput = btn.getAttribute('data-test-option') || '';
      gradeTestAnswer();
    });
  });
  const testNextBtn = document.getElementById('btn-test-next');
  if (testNextBtn && testSession) {
    testNextBtn.addEventListener('click', advanceTestCard);
  }
  document.querySelectorAll('[data-test-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      testSession = null;
      render();
    });
  });

  /* ---------- Settings: Study Preferences ---------- */
  const newRange = document.getElementById('set-newPerDay');
  if (newRange) {
    newRange.addEventListener('input', () => {
      const v = parseInt(newRange.value, 10);
      state.settings.newPerDay = v;
      const label = document.getElementById('val-new');
      if (label) label.textContent = v;
    });
    newRange.addEventListener('change', () => { saveState(); });
  }
  const capRange = document.getElementById('set-dailyCap');
  if (capRange) {
    capRange.addEventListener('input', () => {
      const v = parseInt(capRange.value, 10);
      state.settings.dailyCap = v;
      const label = document.getElementById('val-cap');
      if (label) label.textContent = v;
    });
    capRange.addEventListener('change', () => { saveState(); });
  }
  const rateRange = document.getElementById('set-rate');
  if (rateRange) {
    rateRange.addEventListener('input', () => {
      const v = parseFloat(rateRange.value);
      state.settings.ttsRate = v;
      const label = document.getElementById('val-rate');
      if (label) label.textContent = v.toFixed(1) + '×';
    });
    rateRange.addEventListener('change', () => { saveState(); });
  }
  const voiceSel = document.getElementById('set-voice');
  if (voiceSel) {
    voiceSel.addEventListener('change', () => {
      const lang = getActiveLang();
      lang.ttsVoice = voiceSel.value || null;
      saveState();
    });
  }

  /* ---------- Settings: Languages ---------- */
  const switchLangBtn = document.getElementById('btn-switch-lang');
  if (switchLangBtn) switchLangBtn.addEventListener('click', openLangModal);

  const addLangBtn = document.getElementById('btn-add-lang');
  if (addLangBtn) addLangBtn.addEventListener('click', () => importJSONWithImage(handleLanguageImport));

  document.querySelectorAll('[data-set-active-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchLanguage(btn.getAttribute('data-set-active-lang'));
    });
  });

  document.querySelectorAll('[data-delete-lang]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-lang');
      const lang = state.languages[id];
      if (!lang) return;
      const ok = await confirmModal({
        title: `Delete ${lang.name}?`,
        body: `Removes <strong>${escapeHtml(lang.name)}</strong> and all its stories, cards, test attempts, and test packs. Cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      deleteLanguage(id);
    });
  });

  document.querySelectorAll('[data-restart-lang]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-restart-lang');
      const lang = state.languages[id];
      if (!lang || !lang.stories.length) return;
      const userName = getActiveUser(rawState)?.name || 'this user';
      const count = lang.stories.length;
      const ok = await confirmModal({
        title: `Restart ${escapeHtml(lang.name)}?`,
        body: `Erases ${escapeHtml(userName)}'s progress across all ${count} ${count === 1 ? 'story' : 'stories'} in <strong>${escapeHtml(lang.name)}</strong> — flashcards, test attempts, and first-read/drill flow position. Other users keep their progress. Cannot be undone.`,
        confirmLabel: 'Restart',
        danger: true
      });
      if (!ok) return;
      restartLanguageProgress(id);
    });
  });

  // Theme preset picker (per language).
  document.querySelectorAll('[data-theme-lang]').forEach(sel => {
    sel.addEventListener('change', () => {
      const langId = sel.getAttribute('data-theme-lang');
      const presetId = sel.value;
      const preset = THEME_PRESETS[presetId];
      if (!preset) return;  // "Custom" option is unselectable on save
      const lang = state.languages[langId];
      if (!lang) return;
      lang.theme = { ...preset.theme };
      lang.themeVersion = 1;  // mark as user-chosen so we don't auto-refresh
      if (langId === state.activeLanguageId) applyTheme(lang.theme);
      saveState();
      render();
      showToast(`Theme: ${preset.name}`, 'info');
    });
  });

  /* ---------- Cover image controls (per language) ---------- */
  document.querySelectorAll('[data-set-lang-cover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const langId = btn.getAttribute('data-set-lang-cover');
      importImageFile((dataUrl) => {
        // Cover sync to every user's copy of this language so all
        // profiles see the same image.
        for (const uid in rawState.users) {
          const lang = rawState.users[uid].languages?.[langId];
          if (lang) lang.coverImage = dataUrl;
        }
        saveState();
        render();
        showToast('Cover image set', 'success');
      });
    });
  });
  document.querySelectorAll('[data-clear-lang-cover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const langId = btn.getAttribute('data-clear-lang-cover');
      for (const uid in rawState.users) {
        const lang = rawState.users[uid].languages?.[langId];
        if (lang) lang.coverImage = null;
      }
      saveState();
      render();
      showToast('Cover image removed', 'info');
    });
  });

  // Protagonist name change (per language). Reuses the
  // name-selection screen used on first Start.
  document.querySelectorAll('[data-set-protagonist]').forEach(btn => {
    btn.addEventListener('click', () => {
      const langId = btn.getAttribute('data-set-protagonist');
      const lang = state.languages[langId];
      if (!lang) return;
      openNameSelection(lang, () => {
        render();
      });
    });
  });

  /* ---------- Cover image controls (per story) ---------- */
  document.querySelectorAll('[data-set-story-cover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const compoundId = btn.getAttribute('data-set-story-cover');
      importImageFile((dataUrl) => {
        const story = rawState.storiesData[compoundId];
        if (!story) return;
        story.coverImage = dataUrl;
        saveState();
        render();
        showToast('Story cover set', 'success');
      });
    });
  });
  document.querySelectorAll('[data-clear-story-cover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const compoundId = btn.getAttribute('data-clear-story-cover');
      const story = rawState.storiesData[compoundId];
      if (!story) return;
      story.coverImage = null;
      saveState();
      render();
      showToast('Story cover removed', 'info');
    });
  });

  /* ---------- Settings: Stories ---------- */
  const addStoryBtn = document.getElementById('btn-add-story');
  if (addStoryBtn) addStoryBtn.addEventListener('click', () => importJSONWithImage(handleStoryImport));

  const addPackBtn = document.getElementById('btn-add-testpack');
  if (addPackBtn) addPackBtn.addEventListener('click', () => importJSONFile(handleTestPackImport));

  document.querySelectorAll('[data-delete-story]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const compoundId = btn.getAttribute('data-delete-story');
      const [langId, storyId] = compoundId.split('::');
      const story = getStory(langId, storyId);
      if (!story) return;
      const ok = await confirmModal({
        title: `Delete "${story.title}"?`,
        body: `Removes the story plus all its cards and test attempts. Cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      deleteStory(langId, storyId);
    });
  });

  document.querySelectorAll('[data-restart-story]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const compoundId = btn.getAttribute('data-restart-story');
      const [langId, storyId] = compoundId.split('::');
      const story = getStory(langId, storyId);
      if (!story) return;
      const userName = getActiveUser(rawState)?.name || 'this user';
      const ok = await confirmModal({
        title: `Restart "${story.title}"?`,
        body: `Erases ${escapeHtml(userName)}'s progress for this story — flashcards, test attempts, and first-read/drill flow position. Other users keep their progress. Cannot be undone.`,
        confirmLabel: 'Restart',
        danger: true
      });
      if (!ok) return;
      restartStoryProgress(langId, storyId);
    });
  });

  document.querySelectorAll('[data-delete-pack]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const compoundId = btn.getAttribute('data-delete-pack');
      const pack = state.testPacks[compoundId];
      if (!pack) return;
      const ok = await confirmModal({
        title: `Delete test pack?`,
        body: `Removes the pack <strong>${escapeHtml(pack.name || pack.id)}</strong> and its test attempts. Cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      deleteTestPack(compoundId);
    });
  });

  /* ---------- Settings: Account ---------- */
  const saveAccountBtn = document.getElementById('btn-save-account');
  if (saveAccountBtn) saveAccountBtn.addEventListener('click', () => {
    const me = getActiveUser(rawState);
    if (!me) return;
    const nameInput = document.getElementById('acc-name');
    const passInput = document.getElementById('acc-pass');
    const newName = (nameInput?.value || '').trim();
    const newPass = passInput?.value || '';
    if (!newName) { showToast('Name cannot be empty', 'error'); return; }
    me.name = newName;
    me.password = newPass;
    saveState();
    render();
    showToast('Account updated', 'success');
  });

  const switchUserBtn = document.getElementById('btn-switch-user');
  if (switchUserBtn) switchUserBtn.addEventListener('click', logoutToPicker);

  /* ---------- Settings: Users (admin only) ---------- */
  document.querySelectorAll('[data-save-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.getAttribute('data-save-user');
      const user = rawState.users[uid];
      if (!user) return;
      const nameInput = document.querySelector(`[data-edit-user-name="${uid}"]`);
      const passInput = document.querySelector(`[data-edit-user-pass="${uid}"]`);
      const newName = (nameInput?.value || '').trim();
      const newPass = passInput?.value || '';
      if (!newName) { showToast('Name cannot be empty', 'error'); return; }
      user.name = newName;
      user.password = newPass;
      saveState();
      render();
      showToast(`Saved ${user.name}`, 'success');
    });
  });

  document.querySelectorAll('[data-delete-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-delete-user');
      const user = rawState.users[uid];
      if (!user) return;
      const ok = await confirmModal({
        title: `Delete ${user.name}?`,
        body: `Removes this profile and all its progress (cards, sessions, test attempts). Cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      delete rawState.users[uid];
      saveState();
      render();
      showToast(`${user.name} deleted`, 'info');
    });
  });

  const addUserBtn = document.getElementById('btn-add-user');
  if (addUserBtn) addUserBtn.addEventListener('click', () => addUserModal());

  /* ---------- Settings: Background wallpaper ---------- */
  const setBgBtn = document.getElementById('btn-set-bg');
  if (setBgBtn) {
    setBgBtn.addEventListener('click', () => {
      importImageFile((dataUrl) => {
        state.settings.bgImage = dataUrl;
        saveState();
        applyBackgroundImage();
        render();
        showToast('Background updated', 'success');
      });
    });
  }
  const clearBgBtn = document.getElementById('btn-clear-bg');
  if (clearBgBtn) {
    clearBgBtn.addEventListener('click', () => {
      state.settings.bgImage = null;
      saveState();
      applyBackgroundImage();
      render();
      showToast('Background cleared', 'info');
    });
  }
  const overlayInput = document.getElementById('bg-overlay');
  if (overlayInput) {
    const valEl = document.getElementById('bg-overlay-val');
    // Live preview: update body bg + label as the user drags. Persist
    // on `change` (drag end) so we don't write to localStorage every
    // frame.
    overlayInput.addEventListener('input', () => {
      const o = Number(overlayInput.value) / 100;
      state.settings.bgOverlay = o;
      if (valEl) valEl.textContent = overlayInput.value + '%';
      applyBackgroundImage();
    });
    overlayInput.addEventListener('change', () => saveState());
  }

  /* ---------- Settings: Audio probe ---------- */
  document.querySelectorAll('[data-audio-probe]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid = btn.getAttribute('data-audio-probe');
      const lang = getActiveLang();
      if (!lang || !sid) return;
      const story = getStory(lang.id, sid);
      if (!story) return;
      const sentences = story.sentences || [];
      btn.disabled = true;
      btn.textContent = 'Probing…';
      // Sequential probes with a small concurrency window keep file://
      // browsers from stalling on too many parallel <audio> loads.
      const conc = 6;
      let i = 0;
      async function worker() {
        while (i < sentences.length) {
          const idx = i++;
          await probeAudio(audioPathSentence(lang.id, sid, idx));
        }
      }
      await Promise.all(Array.from({length: conc}, worker));
      // Atmosphere is optional but worth probing too.
      await probeAudio(audioPathAtmosphere(lang.id, sid));
      render();
    });
  });

  /* ---------- Settings: Backup + Reset ---------- */
  const exportBtn = document.getElementById('btn-export-backup');
  if (exportBtn) exportBtn.addEventListener('click', exportBackup);
  const importBtn = document.getElementById('btn-import-backup');
  if (importBtn) importBtn.addEventListener('click', () => importJSONFile(importBackup));
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) resetBtn.addEventListener('click', async () => {
    const ok = await textConfirmModal({
      title: 'Reset all data?',
      body: 'This will erase ALL progress, all uploaded stories, all uploaded languages. Cannot be undone. Type <strong>RESET</strong> to confirm.',
      expected: 'RESET',
      confirmLabel: 'Reset Everything'
    });
    if (ok) resetAllData();
  });

  /* ---------- Library Progress section toggle ---------- */
  const progToggle = document.getElementById('progress-toggle');
  if (progToggle) {
    progToggle.addEventListener('click', () => {
      state.settings.progressOpen = !state.settings.progressOpen;
      saveState();
      render();
    });
  }

  bindFirstReadHandlers();
  bindDrillFlowHandlers();
  bindFreePracticeHandlers();
  frAutoPlayHook();
}

/* ============================================================
   FREE PRACTICE event wiring (Stage E).
   ============================================================ */
function bindFreePracticeHandlers() {
  // Tile in the hub → switch into a sub-mode or jump to existing tab.
  document.querySelectorAll('[data-fp-tile]').forEach(tile => {
    tile.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!lang || !sid) return;
      const which = tile.getAttribute('data-fp-tile');
      if (which === 'listen' || which === 'assembly' || which === 'dictation') {
        // Reset drill state on entry so user gets a fresh round.
        const prog = getStoryProgress(lang.id, sid);
        if (which === 'assembly') {
          prog.drill3 = { idx: 0, queue: null, retried: {} };
        } else if (which === 'dictation') {
          prog.drill4 = { idx: 0, queue: null, doneSet: {} };
        }
        setStoryProgress(lang.id, sid, { fpMode: which });
        render();
        return;
      }
      // Deep-links to existing tabs.
      if (which === 'sentences') {
        state.settings.cardSource = 'sentences';
        lang.lastTab = 'cards';
      } else if (which === 'vocab') {
        state.settings.cardSource = 'vocabulary';
        lang.lastTab = 'cards';
      } else if (which === 'rules') {
        lang.lastTab = 'rules';
      } else if (which === 'tests') {
        // Drop any in-flight session so the user lands on tier
        // selection (full T1/T2/T3 access in free practice).
        testSession = null;
        lang.lastTab = 'test';
      }
      saveState();
      render();
    });
  });

  // Listen mode subtitle cycle.
  document.querySelectorAll('[data-fp-cycle-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const next = btn.getAttribute('data-fp-cycle-sub');
      setStoryProgress(lang.id, sid, { fpSubMode: next });
      render();
    });
  });

  // Back to FP hub from a sub-mode.
  document.querySelectorAll('[data-fp-back-to-hub]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      setStoryProgress(lang.id, sid, { fpMode: 'hub' });
      render();
    });
  });

  // Hub "← Library" button.
  document.querySelectorAll('[data-fp-back-to-library]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      if (!lang) return;
      lang.lastTab = 'library';
      state.libraryDrilledIn = lang.id;
      saveState();
      render();
    });
  });
}

/* ============================================================
   DRILL-FLOW event wiring (Stage D). Drills 1 and 6 reuse the
   existing Cards/Test handlers; drills 2–5 own their own input.
   ============================================================ */
function bindDrillFlowHandlers() {
  // Generic "go to drill N" advance button (rendered after each
  // drill-complete card).
  document.querySelectorAll('[data-d-advance]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const next = parseInt(btn.getAttribute('data-d-advance'), 10);
      setStoryProgress(lang.id, sid, { currentDrill: next });
      // Drop ephemeral sessions so the new drill renders cleanly.
      cardSession = null;
      testSession = null;
      render();
    });
  });

  // Drill 6 celebration → next story or back to library.
  document.querySelectorAll('[data-d6-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      if (!lang) return;
      const next = btn.getAttribute('data-d6-next');
      if (next) {
        // Open the next story (which starts in first-read).
        lang.lastStoryId = next;
        lang.lastTab = 'read';
        cardSession = null;
        testSession = null;
        saveState();
      } else {
        lang.lastTab = 'library';
        state.libraryDrilledIn = lang.id;
        saveState();
      }
      render();
    });
  });

  /* ---------- Drill 2 — Vocab production ---------- */
  const d2Check = document.getElementById('btn-d2-check');
  if (d2Check) {
    d2Check.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const story = getStory(lang.id, sid);
      const vocab = getNewVocab(story);
      const widx = prog.drill2.queue[prog.drill2.idx];
      const v = vocab[widx];
      const input = document.getElementById('d2-input');
      const submitted = (input && input.value) || '';
      prog.drill2.lastInput = submitted;
      prog.drill2.revealed = true;
      // Record streak.
      if (drillAnswerMatches(submitted, v.de)) {
        prog.drill2.streak[widx] = (prog.drill2.streak[widx] || 0) + 1;
      } else {
        prog.drill2.streak[widx] = 0;
      }
      saveState();
      render();
    });
  }
  const d2Next = document.getElementById('btn-d2-next');
  if (d2Next) {
    d2Next.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const story = getStory(lang.id, sid);
      const vocab = getNewVocab(story);
      const widx = prog.drill2.queue[prog.drill2.idx];

      // Advance: if word satisfied streak, drop from queue; else re-queue.
      const satisfied = (prog.drill2.streak[widx] || 0) >= DRILL2_REQUIRED_STREAK;
      const queue = prog.drill2.queue.slice();
      queue.splice(prog.drill2.idx, 1);
      if (!satisfied) queue.push(widx);

      prog.drill2.queue = queue;
      prog.drill2.idx = 0;
      prog.drill2.lastInput = '';
      prog.drill2.revealed = false;

      // Drill complete?
      const remaining = countRemainingDrill2(prog.drill2, vocab);
      if (remaining === 0 || !queue.length) {
        prog.drillsDone[2] = true;
        prog.currentDrill = 3;
      }
      saveState();
      render();
    });
  }

  /* ---------- Drill 3 — Sentence assembly ---------- */
  document.querySelectorAll('[data-d3-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const t = prog.drill3.tiles;
      if (!t || t.checked) return;
      const tileIdx = parseInt(btn.getAttribute('data-d3-pick'), 10);
      // Move from available to assembled.
      const av = t.available.filter(i => i !== tileIdx);
      t.available = av;
      t.assembled.push(tileIdx);
      saveState();
      render();
    });
  });
  document.querySelectorAll('[data-d3-unpick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const t = prog.drill3.tiles;
      if (!t || t.checked) return;
      const i = parseInt(btn.getAttribute('data-d3-unpick'), 10);
      const tileIdx = t.assembled[i];
      t.assembled.splice(i, 1);
      t.available.push(tileIdx);
      saveState();
      render();
    });
  });
  const d3Clear = document.getElementById('btn-d3-clear');
  if (d3Clear) {
    d3Clear.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const t = prog.drill3.tiles;
      if (!t || t.checked) return;
      t.available = t.available.concat(t.assembled);
      t.assembled = [];
      saveState();
      render();
    });
  }
  const d3Check = document.getElementById('btn-d3-check');
  if (d3Check) {
    d3Check.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const t = prog.drill3.tiles;
      if (!t) return;
      const built = t.assembled.map(i => t.tiles[i]).join(' ');
      // Compare against target words (ignore distractors).
      const targetStr = t.targetWords.join(' ');
      // Use diacritic-insensitive compare to keep accents permissive.
      t.correct = drillAnswerMatches(built, targetStr);
      t.checked = true;
      saveState();
      render();
    });
  }
  const d3Next = document.getElementById('btn-d3-next');
  if (d3Next) {
    d3Next.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const story = getStory(lang.id, sid);
      const sentences = story.sentences || [];
      const t = prog.drill3.tiles;
      const sidx = t.sidx;
      // Remove current from queue; if wrong on first attempt, requeue.
      const queue = prog.drill3.queue.slice();
      queue.splice(prog.drill3.idx, 1);
      const wasFirstAttempt = !prog.drill3.retried[sidx];
      if (!t.correct) {
        prog.drill3.retried[sidx] = true;
        queue.push(sidx);
      }
      prog.drill3.queue = queue;
      prog.drill3.idx = 0;
      prog.drill3.tiles = null;

      if (!queue.length) {
        prog.drillsDone[3] = true;
        prog.currentDrill = 4;
      }
      saveState();
      render();
    });
  }

  /* ---------- Drill 4 — Dictation ---------- */
  const d4Check = document.getElementById('btn-d4-check');
  if (d4Check) {
    d4Check.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const story = getStory(lang.id, sid);
      const sentences = story.sentences || [];
      const sidx = prog.drill4.queue[prog.drill4.idx];
      const expected = substituteProtagonist(String((sentences[sidx] || {}).de || ''));
      const input = document.getElementById('d4-input');
      const submitted = (input && input.value) || '';
      prog.drill4.lastInput = submitted;
      prog.drill4.revealed = true;
      if (drillAnswerMatches(submitted, expected)) {
        prog.drill4.doneSet[sidx] = true;
      }
      saveState();
      render();
    });
  }
  const d4Next = document.getElementById('btn-d4-next');
  if (d4Next) {
    d4Next.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const story = getStory(lang.id, sid);
      const sidx = prog.drill4.queue[prog.drill4.idx];
      const queue = prog.drill4.queue.slice();
      queue.splice(prog.drill4.idx, 1);
      // If not in doneSet, requeue.
      if (!prog.drill4.doneSet[sidx]) queue.push(sidx);
      prog.drill4.queue = queue;
      prog.drill4.idx = 0;
      prog.drill4.lastInput = '';
      prog.drill4.revealed = false;

      if (!queue.length) {
        prog.drillsDone[4] = true;
        prog.currentDrill = 5;
      }
      saveState();
      render();
    });
  }

  /* ---------- Drill 5 — Rule review ("Got it" advance) ---------- */
  const d5Next = document.getElementById('btn-d5-next');
  if (d5Next) {
    d5Next.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const ridx = prog.drill5.queue[prog.drill5.idx];
      prog.drill5.results[ridx] = true;
      const queue = prog.drill5.queue.slice();
      queue.splice(prog.drill5.idx, 1);
      prog.drill5.queue = queue;
      prog.drill5.idx = 0;

      if (!queue.length) {
        prog.drillsDone[5] = true;
        prog.currentDrill = 6;
      }
      saveState();
      render();
    });
  }
}

/* ============================================================
   FIRST-READ event wiring + auto-play hook. Triggered from
   bindHandlers each render pass.
   ============================================================ */
function bindFirstReadHandlers() {
  // Continue / advance step button — used by steps 1(done), 2, 4(empty), 6.
  document.querySelectorAll('[data-fr-continue]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const next = Math.min((prog.firstReadStep || 1) + 1, 6);
      const patch = { firstReadStep: next };
      if (next === 1) patch.step1Phase = 'intro';
      if (next === 5) patch.step5Finished = false;
      setStoryProgress(lang.id, sid, patch);
      render();
    });
  });

  // Step 1 phase nav (intro → narration → done).
  document.querySelectorAll('[data-fr-skip-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const target = btn.getAttribute('data-fr-skip-to');
      setStoryProgress(lang.id, sid, { step1Phase: target });
      render();
    });
  });

  // Step 1 intro replay button.
  document.querySelectorAll('[data-fr-replay-intro]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      frPlayIntro();
    });
  });

  // Step 1 EN/IT subtitle toggle.
  document.querySelectorAll('[data-fr-toggle-english]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      setStoryProgress(lang.id, sid, { showEnglish: !prog.showEnglish });
      render();
    });
  });

  // Step 3 — sentence walk navigation.
  document.querySelectorAll('[data-fr-sent-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const idx = Math.max(0, (prog.sentenceIdx || 0) - 1);
      setStoryProgress(lang.id, sid, { sentenceIdx: idx });
      render();
    });
  });
  document.querySelectorAll('[data-fr-sent-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const story = getStory(lang.id, sid);
      const n = (story.sentences || []).length;
      const cur = prog.sentenceIdx || 0;
      if (cur >= n - 1) {
        // Last sentence reached. In hub-walkthrough mode, return to
        // the hub instead of advancing the first-read pipeline so
        // users replaying for review don't get bumped to vocab walk.
        if (lang.readSubMode === 'walkthrough') {
          lang.readSubMode = null;
          setStoryProgress(lang.id, sid, { sentenceIdx: 0 });
        } else {
          setStoryProgress(lang.id, sid, { firstReadStep: 4, sentenceIdx: 0 });
        }
      } else {
        setStoryProgress(lang.id, sid, { sentenceIdx: cur + 1 });
      }
      render();
    });
  });

  // Step 4 — vocab walk navigation.
  document.querySelectorAll('[data-fr-vocab-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const idx = Math.max(0, (prog.vocabIdx || 0) - 1);
      setStoryProgress(lang.id, sid, { vocabIdx: idx });
      render();
    });
  });
  document.querySelectorAll('[data-fr-vocab-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const story = getStory(lang.id, sid);
      const n = getNewVocab(story).length;
      const cur = prog.vocabIdx || 0;
      if (cur >= n - 1) {
        setStoryProgress(lang.id, sid, { firstReadStep: 5, vocabIdx: 0, step5Finished: false });
      } else {
        setStoryProgress(lang.id, sid, { vocabIdx: cur + 1 });
      }
      render();
    });
  });

  // Generic FR speak button (sentence-walk audio + vocab-walk audio).
  // If a sentence index is attached we route through playSentenceFile
  // so a recorded MP3 wins over robotic TTS.
  document.querySelectorAll('[data-fr-speak]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-fr-speak');
      if (!text) return;
      btn.classList.add('speaking');
      stopPlayAll();
      const lang = getActiveLang();
      const sIdxAttr = btn.getAttribute('data-sent-idx');
      const useFile = sIdxAttr !== null && lang && lang.lastStoryId;
      const promise = useFile
        ? playSentenceFile(lang.id, lang.lastStoryId, parseInt(sIdxAttr, 10), text, lang.ttsLang)
        : speak(text, lang.ttsLang);
      promise.finally(() => btn.classList.remove('speaking'));
    });
  });

  // Step 3 — vocab tap-to-translate popover.
  document.querySelectorAll('[data-fr-vocab]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const word = el.getAttribute('data-fr-vocab');
      const trans = el.getAttribute('data-fr-vocab-trans');
      showFRVocabPopover(el, word, trans);
    });
  });
  // Tap anywhere else dismisses the popover.
  const tabContent = document.getElementById('tab-content');
  if (tabContent) {
    tabContent.addEventListener('click', (e) => {
      if (!e.target.closest('[data-fr-vocab]')) hideFRVocabPopover();
    });
  }

  // Step 5 — closing replay (or stop, if currently playing).
  document.querySelectorAll('[data-fr-replay-closing]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (playback.active) {
        stopPlayAll();
      } else {
        frPlayClosing();
      }
      // Re-render the button label (Stop ↔ Replay) on next paint.
      setTimeout(render, 0);
    });
  });

  // Step 6 — finish first-read, jump back to library drilled view.
  document.querySelectorAll('[data-fr-finish]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      if (!lang) return;
      lang.lastTab = 'library';
      state.libraryDrilledIn = lang.id;
      saveState();
      render();
    });
  });

  // Save & exit — always available from any first-read step. Progress
  // is already on disk via setStoryProgress; this just navigates out.
  document.querySelectorAll('[data-fr-exit]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      if (!lang) return;
      lang.lastTab = 'library';
      state.libraryDrilledIn = lang.id;
      saveState();
      showToast('Progress saved — pick up where you left off anytime.', 'info');
      render();
    });
  });
}

function showFRVocabPopover(anchor, word, translation) {
  const pop = document.getElementById('fr-vocab-popover');
  if (!pop) return;
  pop.innerHTML = `<div class="fr-vp-word">${escapeHtml(word || '')}</div>
                   <div class="fr-vp-trans">${escapeHtml(translation || '')}</div>`;
  pop.style.display = 'block';
  // Anchor under the tapped word.
  const r = anchor.getBoundingClientRect();
  const parentR = pop.parentElement.getBoundingClientRect();
  pop.style.left = Math.max(8, (r.left - parentR.left)) + 'px';
  pop.style.top = (r.bottom - parentR.top + 4) + 'px';
}
function hideFRVocabPopover() {
  const pop = document.getElementById('fr-vocab-popover');
  if (pop) pop.style.display = 'none';
}

// Auto-play hook — triggers TTS when entering a step that needs it.
// Checks DOM state to avoid double-play within a render pass.
let _frLastAutoplayKey = null;
function frAutoPlayHook() {
  const lang = getActiveLang();
  if (!lang) return;
  const tab = lang.lastTab || 'library';
  if (tab !== 'read') { _frLastAutoplayKey = null; return; }
  const sid = lang.lastStoryId;
  if (!sid) return;
  const story = getStory(lang.id, sid);
  const prog = getStoryProgress(lang.id, sid);
  if (!story || !prog || prog.phase !== 'first-read') {
    _frLastAutoplayKey = null;
    return;
  }
  const step = prog.firstReadStep || 1;
  const sub = step === 1 ? (prog.step1Phase || 'intro') : '';
  const key = `${lang.id}|${sid}|${step}|${sub}`;
  if (key === _frLastAutoplayKey) return;
  _frLastAutoplayKey = key;

  if (step === 1 && sub === 'intro')      frPlayIntro();
  else if (step === 1 && sub === 'narration') frPlayNarration();
  else if (step === 5 && !prog.step5Finished) frPlayClosing();
}

function frPlayIntro() {
  const lang = getActiveLang();
  const sid = lang && lang.lastStoryId;
  if (!sid) return;
  const story = getStory(lang.id, sid);
  const intro = (story && (story._atmosphereIntro || story.synopsis)) || '';
  if (!intro) {
    setStoryProgress(lang.id, sid, { step1Phase: 'narration' });
    render();
    return;
  }
  stopPlayAll();
  // Use playback machinery as a simple cancel/version guard.
  playback.active = true;
  playback.version++;
  const myV = playback.version;
  // Prefer audio/{lang}/{story}/atmosphere.mp3 when present.
  const path = audioPathAtmosphere(lang.id, sid);
  playFileOrSpeak(path, intro, 'en-US').then(() => {
    if (playback.version !== myV) return;
    playback.active = false;
    // Auto-advance to narration phase.
    const lang2 = getActiveLang();
    if (!lang2 || lang2.lastStoryId !== sid) return;
    setStoryProgress(lang2.id, sid, { step1Phase: 'narration' });
    render();
  });
}
function frPlayNarration() {
  const lang = getActiveLang();
  const sid = lang && lang.lastStoryId;
  if (!sid) return;
  const story = getStory(lang.id, sid);
  if (!story || !Array.isArray(story.sentences)) return;
  startPlayAll(story.sentences, lang.ttsLang, {
    onDone: () => {
      // Listen-card path: mark listenDone, clear the flag, return to hub.
      if (cinemaListen) {
        const lang2 = getActiveLang();
        if (lang2 && lang2.lastStoryId === sid) {
          setStoryProgress(lang2.id, sid, { listenDone: true });
        }
        cinemaListen = null;
        render();
        return;
      }
      // First-read narration path: mark listenDone, advance step1Phase
      // so the auto-cinema doesn't replay on next render. The hub
      // appears after cinema unmounts.
      const lang2 = getActiveLang();
      if (!lang2 || lang2.lastStoryId !== sid) return;
      const prog2 = getStoryProgress(lang2.id, sid);
      if (prog2.firstReadStep !== 1 || prog2.step1Phase !== 'narration') return;
      setStoryProgress(lang2.id, sid, { step1Phase: 'done', listenDone: true });
      render();
    }
  });
}
function frPlayClosing() {
  const lang = getActiveLang();
  const sid = lang && lang.lastStoryId;
  if (!sid) return;
  const story = getStory(lang.id, sid);
  if (!story || !Array.isArray(story.sentences)) return;
  startPlayAll(story.sentences, lang.ttsLang, {
    onDone: () => {
      const lang2 = getActiveLang();
      if (!lang2 || lang2.lastStoryId !== sid) return;
      setStoryProgress(lang2.id, sid, { step5Finished: true });
      render();
    }
  });
}

/* ============================================================
   CINEMA MODE — full-screen narration view for First-Read Step 1.
   Mounts a #cinema-root overlay; relies on the existing playback
   machinery (startPlayAll → updatePlayHighlight) to crossfade
   between sentences via the data-sent-idx attribute.
   ============================================================ */

// Discrete playback speeds the cinema cycle button steps through.
// We snap whatever is currently in state.settings.ttsRate to the
// nearest entry on first display so a saved 0.9 → "1×" rather than
// showing as a non-cycle value.
const CINEMA_SPEEDS = [0.75, 1.0, 1.25, 1.5];
// Average wall-clock seconds per sentence at 1× rate, including the
// 280ms inter-sentence gap. Tuned from the rendered Edge-TTS files
// (~12-21KB at 48kbps mono → 2-3.5s of audio + 0.28s gap).
const CINEMA_SECS_PER_SENTENCE = 3.3;

function snapToCinemaSpeed(rate) {
  const r = Number(rate) || 1;
  if (CINEMA_SPEEDS.includes(r)) return r;
  // Nearest entry by absolute distance.
  return CINEMA_SPEEDS.reduce((best, v) =>
    Math.abs(v - r) < Math.abs(best - r) ? v : best, CINEMA_SPEEDS[1]);
}

function formatRate(r) {
  // 1.00 → "1×", 0.75 → "0.75×", 1.25 → "1.25×"
  return `${Number(r).toFixed(2).replace(/\.?0+$/, '')}×`;
}

function formatMSS(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function cinemaTimeLeftSeconds(totalSentences) {
  const cur = playback.idx >= 0 ? playback.idx : 0;
  const remaining = Math.max(0, totalSentences - cur - 1);
  const rate = (state && state.settings && state.settings.ttsRate) || 1;
  return remaining * CINEMA_SECS_PER_SENTENCE / rate;
}

function mountCinemaIntroPhase(lang, story) {
  const cover = story.coverImage || '';
  const intro = (story._atmosphereIntro || story.synopsis || '').trim();
  // Substitute {{PROTAGONIST}} for the visible text — the audio
  // path goes through speak()/playFileOrSpeak which substitutes too.
  const introText = substituteProtagonist(intro);

  const wasInCinema = document.body.classList.contains('cinema-mode');
  const root = document.getElementById('cinema-root');
  root.innerHTML = `
    <div class="cinema-screen cinema-intro"${cover ? ` style="background-image: url('${escapeHtml(cover)}');"` : ''}>
      <div class="cs-overlay"></div>
      <div class="cs-topbar">
        <button class="cs-icon-btn" data-cinema-skip-intro="1" title="Skip to story">⏭</button>
      </div>
      <div class="cs-stage">
        <div class="cs-intro-pulse"><span></span><span></span><span></span></div>
        <div class="cs-intro-eyebrow">Setting the scene…</div>
        <div class="cs-intro-text">${escapeHtml(introText)}</div>
      </div>
      <div class="cs-controls">
        <button class="cs-play" data-cinema-replay-intro="1">↻  Replay</button>
      </div>
    </div>
  `;
  document.body.classList.add('cinema-mode');
  bindCinemaIntroHandlers();

  // Auto-play atmosphere intro on first entry. frPlayIntro advances
  // step1Phase → 'narration' on finish, which re-renders into cinema
  // narration mode automatically.
  if (!wasInCinema && !playback.active) {
    setTimeout(() => frPlayIntro(), 380);
  }
}

function bindCinemaIntroHandlers() {
  document.querySelectorAll('[data-cinema-skip-intro]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (sid) setStoryProgress(lang.id, sid, { step1Phase: 'narration' });
      render();
    });
  });
  document.querySelectorAll('[data-cinema-replay-intro]').forEach(btn => {
    btn.addEventListener('click', () => {
      frPlayIntro();
    });
  });
}

/* ---- Cinematic Grammar review ----
   One rule at a time, full-screen. Prev/next nav, Done on the last
   rule sets grammarDone=true and exits to the hub. */
let cinemaGrammarIdx = 0;

function mountCinemaGrammar(lang, story) {
  const rules = story.grammarRules || [];
  if (rules.length === 0) {
    // Nothing to study — auto-mark done and bounce back.
    setStoryProgress(lang.id, story.id, { grammarDone: true });
    lang.readSubMode = null;
    saveState();
    setTimeout(render, 0);
    return;
  }
  const total = rules.length;
  cinemaGrammarIdx = Math.max(0, Math.min(cinemaGrammarIdx, total - 1));
  const rule = rules[cinemaGrammarIdx];
  const cover = story.coverImage || '';
  const isLast = cinemaGrammarIdx === total - 1;
  const examplesHtml = Array.isArray(rule.examples) && rule.examples.length
    ? `<ul class="cs-examples">${rule.examples.slice(0, 4).map(ex => {
        if (typeof ex === 'string') return `<li>${escapeHtml(ex)}</li>`;
        return `<li><strong>${escapeHtml(ex.target || ex.de || '')}</strong>${ex.gloss || ex.en ? ` — ${escapeHtml(ex.gloss || ex.en)}` : ''}</li>`;
      }).join('')}</ul>`
    : '';

  const root = document.getElementById('cinema-root');
  root.innerHTML = `
    <div class="cinema-screen cinema-rule"${cover ? ` style="background-image: url('${escapeHtml(cover)}');"` : ''}>
      <div class="cs-overlay"></div>
      <div class="cs-topbar">
        <button class="cs-icon-btn" data-cinema-grammar-exit="1" title="Exit">×</button>
        <span class="cs-meta">Tier ${rule.tier || 1}</span>
      </div>
      <div class="cs-stage">
        <div class="cs-rule">
          <div class="cs-rule-name">${escapeHtml(rule.name || 'Rule')}</div>
          <div class="cs-rule-desc">${escapeHtml(rule.longExplanation || rule.desc || '')}</div>
          ${examplesHtml}
        </div>
      </div>
      <div class="cs-controls">
        <div class="cs-meta-row">
          <span class="cs-meta">${cinemaGrammarIdx + 1} / ${total}</span>
        </div>
        <div class="cs-progress"><div class="bar" style="width: ${((cinemaGrammarIdx + 1) / total) * 100}%"></div></div>
        <div class="cs-transport">
          <button class="cs-icon-btn" data-cinema-grammar-skip="-1" title="Previous"${cinemaGrammarIdx === 0 ? ' disabled' : ''}>⏮</button>
          ${isLast
            ? `<button class="cs-play" data-cinema-grammar-done="1">✓  Done</button>`
            : `<button class="cs-play" data-cinema-grammar-skip="1">Next  ⏭</button>`}
        </div>
      </div>
    </div>
  `;
  document.body.classList.add('cinema-mode');
  bindCinemaGrammarHandlers();
}

function bindCinemaGrammarHandlers() {
  document.querySelectorAll('[data-cinema-grammar-exit]').forEach(btn => {
    btn.addEventListener('click', () => {
      cinemaGrammarIdx = 0;
      const lang = getActiveLang();
      if (lang) { lang.readSubMode = null; saveState(); }
      render();
    });
  });
  document.querySelectorAll('[data-cinema-grammar-skip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.getAttribute('data-cinema-grammar-skip'), 10) || 0;
      cinemaGrammarIdx = Math.max(0, cinemaGrammarIdx + delta);
      render();
    });
  });
  document.querySelectorAll('[data-cinema-grammar-done]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (sid) setStoryProgress(lang.id, sid, { grammarDone: true });
      cinemaGrammarIdx = 0;
      if (lang) { lang.readSubMode = null; saveState(); }
      render();
    });
  });
}

/* ---- Cinematic Sentence Walkthrough ----
   Like Listen but manually paced: one sentence at a time, prev/next,
   per-sentence audio play, EN toggle. Done on the last sentence. */
let cinemaWalkIdx = 0;

function mountCinemaWalkthrough(lang, story) {
  const sentences = story.sentences || [];
  if (!sentences.length) {
    setStoryProgress(lang.id, story.id, { walkthroughDone: true });
    lang.readSubMode = null;
    saveState();
    setTimeout(render, 0);
    return;
  }
  const total = sentences.length;
  cinemaWalkIdx = Math.max(0, Math.min(cinemaWalkIdx, total - 1));
  const s = sentences[cinemaWalkIdx];
  const cover = story.coverImage || '';
  const prog = getStoryProgress(lang.id, story.id);
  const showEng = !!prog.showEnglish;
  const isLast = cinemaWalkIdx === total - 1;

  const root = document.getElementById('cinema-root');
  root.innerHTML = `
    <div class="cinema-screen ${showEng ? '' : 'no-en'}"${cover ? ` style="background-image: url('${escapeHtml(cover)}');"` : ''}>
      <div class="cs-overlay"></div>
      <div class="cs-topbar">
        <button class="cs-icon-btn" data-cinema-walk-exit="1" title="Exit">×</button>
        <button class="cs-icon-btn cs-en-toggle" data-cinema-walk-en="1">EN ${showEng ? 'on' : 'off'}</button>
      </div>
      <div class="cs-stage">
        <div class="cs-lines" style="position: static;">
          <div class="cs-line active" style="position: static;">
            <div class="it">${escapeHtml(s.de)}</div>
            <div class="en">${escapeHtml(s.en)}</div>
          </div>
        </div>
      </div>
      <div class="cs-controls">
        <div class="cs-meta-row">
          <span class="cs-meta">${cinemaWalkIdx + 1} / ${total}</span>
          <button class="cs-speed" data-cinema-speed="1">${formatRate(snapToCinemaSpeed(state.settings.ttsRate))}</button>
        </div>
        <div class="cs-progress"><div class="bar" style="width: ${((cinemaWalkIdx + 1) / total) * 100}%"></div></div>
        <div class="cs-transport">
          <button class="cs-icon-btn" data-cinema-walk-skip="-1" title="Previous"${cinemaWalkIdx === 0 ? ' disabled' : ''}>⏮</button>
          <button class="cs-play" data-cinema-walk-play="1">▶  Play</button>
          ${isLast
            ? `<button class="cs-icon-btn" data-cinema-walk-done="1" title="Done">✓</button>`
            : `<button class="cs-icon-btn" data-cinema-walk-skip="1" title="Next">⏭</button>`}
        </div>
      </div>
    </div>
  `;
  document.body.classList.add('cinema-mode');
  bindCinemaWalkthroughHandlers();
}

function bindCinemaWalkthroughHandlers() {
  document.querySelectorAll('[data-cinema-walk-exit]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      cinemaWalkIdx = 0;
      const lang = getActiveLang();
      if (lang) { lang.readSubMode = null; saveState(); }
      render();
    });
  });
  document.querySelectorAll('[data-cinema-walk-skip]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const delta = parseInt(btn.getAttribute('data-cinema-walk-skip'), 10) || 0;
      cinemaWalkIdx = Math.max(0, cinemaWalkIdx + delta);
      render();
    });
  });
  document.querySelectorAll('[data-cinema-walk-play]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      const story = sid && getStory(lang.id, sid);
      if (!story) return;
      const s = story.sentences[cinemaWalkIdx];
      stopPlayAll();
      playSentenceFile(lang.id, sid, cinemaWalkIdx, s.de, lang.ttsLang);
    });
  });
  document.querySelectorAll('[data-cinema-walk-en]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const next = !prog.showEnglish;
      setStoryProgress(lang.id, sid, { showEnglish: next });
      const screen = document.querySelector('.cinema-screen');
      if (screen) screen.classList.toggle('no-en', !next);
      btn.textContent = `EN ${next ? 'on' : 'off'}`;
    });
  });
  document.querySelectorAll('[data-cinema-walk-done]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (sid) setStoryProgress(lang.id, sid, { walkthroughDone: true });
      cinemaWalkIdx = 0;
      if (lang) { lang.readSubMode = null; saveState(); }
      render();
    });
  });
}

function mountCinemaNarration() {
  const lang = getActiveLang();
  if (!lang || !lang.lastStoryId) return;
  const story = getStory(lang.id, lang.lastStoryId);
  if (!story) return;
  const prog = getStoryProgress(lang.id, lang.lastStoryId);

  // Hub-driven cinematic sub-modes.
  if (!cinemaListen && lang.readSubMode === 'grammar')     return mountCinemaGrammar(lang, story);
  if (!cinemaListen && lang.readSubMode === 'walkthrough') return mountCinemaWalkthrough(lang, story);

  // Intro sub-mode: English atmosphere card. Auto-plays atmosphere.mp3
  // (or TTS fallback) via frPlayIntro, which advances step1Phase to
  // 'narration' on finish — that triggers a re-render and the same
  // cinema overlay swaps into narration mode below.
  const isIntroPhase = !cinemaListen
    && prog && prog.phase === 'first-read'
    && prog.firstReadStep === 1
    && prog.step1Phase === 'intro';
  if (isIntroPhase) {
    return mountCinemaIntroPhase(lang, story);
  }

  const showEng = !!prog.showEnglish;
  const cover = story.coverImage || '';

  const wasInCinema = document.body.classList.contains('cinema-mode');
  // Detect intro→narration transition: cinema was open in intro mode
  // and is now being re-rendered as narration. We need to auto-start
  // narration audio in that case even though the body class is set.
  const wasInIntro = !!document.querySelector('#cinema-root .cinema-intro');
  const total = story.sentences.length;
  const startIdx = playback.idx >= 0 ? playback.idx : 0;
  const linesHtml = story.sentences.map((s, i) => `
    <div class="cs-line ${i === startIdx ? 'active' : ''}" data-sent-idx="${i}">
      <div class="it">${escapeHtml(s.de)}</div>
      <div class="en">${escapeHtml(s.en)}</div>
    </div>
  `).join('');

  const root = document.getElementById('cinema-root');
  root.innerHTML = `
    <div class="cinema-screen ${showEng ? '' : 'no-en'}"${cover ? ` style="background-image: url('${escapeHtml(cover)}');"` : ''}>
      <div class="cs-overlay"></div>
      <div class="cs-topbar">
        <button class="cs-icon-btn" data-cinema-exit="1" title="Exit">×</button>
        <button class="cs-icon-btn cs-en-toggle" data-cinema-en="1">EN ${showEng ? 'on' : 'off'}</button>
      </div>
      <div class="cs-stage">
        <div class="cs-lines">${linesHtml}</div>
      </div>
      <div class="cs-controls">
        <div class="cs-meta-row">
          <span class="cs-meta"><span class="cs-current">${startIdx + 1}</span> / ${total}</span>
          <span class="cs-meta cs-time-left">${formatMSS(cinemaTimeLeftSeconds(total))} left</span>
          <button class="cs-speed" data-cinema-speed="1">${formatRate(snapToCinemaSpeed(state.settings.ttsRate))}</button>
        </div>
        <div class="cs-progress"><div class="bar" style="width: ${((startIdx + 1) / total) * 100}%"></div></div>
        <div class="cs-transport">
          <button class="cs-icon-btn" data-cinema-skip="-1" title="Previous sentence">⏮</button>
          <button class="cs-play" data-cinema-play="1">${playback.active ? '⏸  Pause' : '▶  Play'}</button>
          <button class="cs-icon-btn" data-cinema-skip="1" title="Next sentence">⏭</button>
        </div>
      </div>
    </div>
  `;
  document.body.classList.add('cinema-mode');
  bindCinemaHandlers();

  // Auto-start narration audio on first entry OR on the
  // intro → narration transition. Skip when audio is already running
  // (e.g., a no-op re-render mid-playback).
  if (!playback.active && (!wasInCinema || wasInIntro)) {
    setTimeout(() => frPlayNarration(), 380);
  }
}

function unmountCinemaNarration() {
  if (!document.body.classList.contains('cinema-mode')) return;
  document.body.classList.remove('cinema-mode');
  const root = document.getElementById('cinema-root');
  if (root) root.innerHTML = '';
}

function bindCinemaHandlers() {
  document.querySelectorAll('[data-cinema-exit]').forEach(btn => {
    btn.addEventListener('click', () => {
      stopPlayAll();
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      // Either path: mark listenDone so exiting partway still
      // unlocks the Grammar tile. Users can always re-enter the
      // cinema to relisten in full.
      if (sid) setStoryProgress(lang.id, sid, { listenDone: true });
      if (cinemaListen) {
        cinemaListen = null;
      } else {
        if (sid) setStoryProgress(lang.id, sid, { step1Phase: 'done' });
      }
      render();
    });
  });
  document.querySelectorAll('[data-cinema-play]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (playback.active) {
        stopPlayAll();
        btn.textContent = '▶  Play';
      } else {
        frPlayNarration();
        btn.textContent = '⏸  Pause';
      }
    });
  });
  document.querySelectorAll('[data-cinema-en]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      if (!sid) return;
      const prog = getStoryProgress(lang.id, sid);
      const next = !prog.showEnglish;
      setStoryProgress(lang.id, sid, { showEnglish: next });
      const screen = document.querySelector('.cinema-screen');
      if (screen) screen.classList.toggle('no-en', !next);
      btn.textContent = `EN ${next ? 'on' : 'off'}`;
    });
  });
  document.querySelectorAll('[data-cinema-skip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.getAttribute('data-cinema-skip'), 10) || 0;
      const lang = getActiveLang();
      const sid = lang && lang.lastStoryId;
      const story = sid && getStory(lang.id, sid);
      if (!story) return;
      const total = (story.sentences || []).length;
      const cur = playback.idx >= 0 ? playback.idx : 0;
      const target = Math.max(0, Math.min(cur + delta, total - 1));
      stopPlayAll();
      playback.idx = target;
      updatePlayHighlight();
      startPlayAll(story.sentences, lang.ttsLang, {
        startIdx: target,
        onDone: () => {
          if (cinemaListen) {
            const lang2 = getActiveLang();
            if (lang2 && lang2.lastStoryId === sid) {
              setStoryProgress(lang2.id, sid, { listenDone: true });
            }
            cinemaListen = null;
            render();
            return;
          }
          const lang2 = getActiveLang();
          if (!lang2 || lang2.lastStoryId !== sid) return;
          const prog2 = getStoryProgress(lang2.id, sid);
          if (prog2.firstReadStep !== 1 || prog2.step1Phase !== 'narration') return;
          setStoryProgress(lang2.id, sid, { step1Phase: 'done', listenDone: true });
          render();
        }
      });
    });
  });
  document.querySelectorAll('[data-cinema-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cur = snapToCinemaSpeed(state.settings.ttsRate);
      const next = CINEMA_SPEEDS[(CINEMA_SPEEDS.indexOf(cur) + 1) % CINEMA_SPEEDS.length];
      state.settings.ttsRate = next;
      saveState();
      // Live: speed up the currently-playing audio without a restart.
      if (typeof activeAudio !== 'undefined' && activeAudio) activeAudio.playbackRate = next;
      btn.textContent = formatRate(next);
      // Reproject time-left for the new speed.
      updatePlayHighlight();
    });
  });
}

/* ============================================================
   CHUNK 3A — Import / delete handlers for languages, stories,
   test packs.
   ============================================================ */
function handleLanguageImport(json, coverImage) {
  if (!json) {
    showToast('No JSON file selected', 'error');
    return;
  }
  const v = validateLanguage(json);
  if (!v.valid) {
    showToast('Invalid language: ' + v.errors[0], 'error');
    console.warn('language errors:', v.errors);
    return;
  }
  const cover = coverImage || json.coverImage || null;
  // Add this language to EVERY user's languages registry so all
  // profiles can see + study it. Per-user state (theme/lastTab/...)
  // initializes fresh for each profile.
  for (const uid in rawState.users) {
    const user = rawState.users[uid];
    user.languages = user.languages || {};
    user.languages[json.id] = {
      id: json.id,
      name: json.name,
      flag: json.flag,
      ttsLang: json.ttsLang,
      theme: { ...json.theme },
      coverImage: cover,
      stories: [],
      lastTab: 'library',
      lastStoryId: null,
      readMode: 'full',
      themeVersion: 1
    };
  }
  saveState();
  render();
  const note = cover ? ' (with cover image)' : '';
  showToast(`Language ${json.name} added${note}`, 'success');
}

async function handleStoryImport(rawJson, coverImage) {
  if (!rawJson) {
    showToast('No JSON file selected', 'error');
    return;
  }
  // Accept both the legacy {de,en} shape and the Storyglot spec
  // shape (targetText/englishGloss + grammar.id + tests.type).
  // Normalize the new shape to legacy before validating + storing.
  const json = normalizeStoryShape(rawJson);
  const v = validateStoryAllowReplace(json);
  if (!v.valid) {
    showToast('Invalid story: ' + v.errors[0], 'error');
    console.warn('story errors:', v.errors);
    console.warn('original payload:', rawJson);
    return;
  }
  const storyKey = `${json.languageId}::${json.id}`;
  const exists = !!rawState.storiesData[storyKey];
  if (exists) {
    const ok = await confirmModal({
      title: `Story "${json.id}" already exists`,
      body: "Replace it? This deletes existing progress for that story across ALL users.",
      confirmLabel: 'Replace',
      danger: true
    });
    if (!ok) return;
    for (const uid in rawState.users) {
      const user = rawState.users[uid];
      for (const k of Object.keys(user.cards || {})) {
        if (k.startsWith(`${storyKey}::`)) delete user.cards[k];
      }
      for (const k of Object.keys(user.testAttempts || {})) {
        if (k.startsWith(`${storyKey}::`)) delete user.testAttempts[k];
      }
    }
  }
  // Attach the cover (uploaded image overrides any inline coverImage in JSON).
  const finalStory = { ...json };
  if (coverImage) finalStory.coverImage = coverImage;
  rawState.storiesData[storyKey] = finalStory;
  for (const uid in rawState.users) {
    const lang = rawState.users[uid].languages?.[json.languageId];
    if (lang && !lang.stories.includes(json.id)) lang.stories.push(json.id);
  }
  ensureCards(rawState);
  ensureStoryProgress(rawState);
  saveState();
  render();
  const note = (coverImage || json.coverImage) ? ' (with cover image)' : '';
  showToast(`Story "${json.title}" added${note} — ${json.sentences.length} new cards`, 'success');
}

// Like validateStory but allows the id-already-exists case (we handle
// replacement separately via a confirm modal).
function validateStoryAllowReplace(json) {
  const v = validateStory(json);
  // Filter out the "id already taken" check — there isn't one in
  // validateStory currently, but if added later, this stays safe.
  return v;
}

function handleTestPackImport(json) {
  const v = validateTestPack(json);
  if (!v.valid) {
    showToast('Invalid test pack: ' + v.errors[0], 'error');
    console.warn('test pack errors:', v.errors);
    return;
  }
  const key = `${json.languageId}::${json.id}`;
  state.testPacks[key] = {
    id: json.id,
    languageId: json.languageId,
    storyId: json.storyId,
    name: json.name || json.id,
    description: json.description || '',
    tests: json.tests
  };
  saveState();
  render();
  let msg = `Test pack "${state.testPacks[key].name}" added — ${json.tests.length} tests`;
  if (v.warnings && v.warnings.length) msg += ` (${v.warnings[0]})`;
  showToast(msg, 'success');
}

function deleteLanguage(id) {
  // German is built-in and can never be removed. Refuse to delete
  // a language anyone currently has active.
  if (id === 'de') return;
  let firstName = null;
  for (const uid in rawState.users) {
    if (rawState.users[uid].activeLanguageId === id) {
      showToast('Cannot delete a language while someone has it active', 'error');
      return;
    }
    if (!firstName && rawState.users[uid].languages?.[id]) {
      firstName = rawState.users[uid].languages[id].name;
    }
  }
  const langPrefix = `${id}::`;
  // Per-user cleanup.
  for (const uid in rawState.users) {
    const user = rawState.users[uid];
    if (user.languages) delete user.languages[id];
    for (const k of Object.keys(user.cards || {})) if (k.startsWith(langPrefix)) delete user.cards[k];
    for (const k of Object.keys(user.testAttempts || {})) if (k.startsWith(langPrefix)) delete user.testAttempts[k];
  }
  // Global cleanup.
  for (const k of Object.keys(rawState.storiesData)) if (k.startsWith(langPrefix)) delete rawState.storiesData[k];
  for (const k of Object.keys(rawState.testPacks)) if (k.startsWith(langPrefix)) delete rawState.testPacks[k];
  saveState();
  render();
  showToast(`Language ${firstName || id} deleted`, 'info');
}

// Erase the active user's progress for every story in a language and
// return the UI to a fresh-install state for that language: top-level
// library view, no remembered story, no protagonist name (so the name
// picker shows up again when they next open a story).
function restartLanguageProgress(langId) {
  const user = getActiveUser(rawState);
  if (!user) return;
  const lang = user.languages && user.languages[langId];
  if (!lang || !Array.isArray(lang.stories)) return;
  const langPrefix = `${langId}::`;
  for (const k of Object.keys(user.cards || {})) if (k.startsWith(langPrefix)) delete user.cards[k];
  for (const k of Object.keys(user.testAttempts || {})) if (k.startsWith(langPrefix)) delete user.testAttempts[k];
  lang.storyProgress = {};
  for (const sid of lang.stories) lang.storyProgress[sid] = defaultStoryProgress();
  lang.protagonistName = null;
  lang.lastStoryId = null;
  lang.lastTab = 'library';
  user.libraryDrilledIn = null;
  cardSession = null;
  testSession = null;
  ensureCards(rawState);
  saveState();
  render();
  showToast(`${lang.name} reset to the beginning`, 'success');
}

// Erase the active user's progress for a story without removing the
// story itself. Other users' progress is untouched, and the story
// stays in the library so it can be played from the start.
function restartStoryProgress(langId, storyId) {
  const story = getStory(langId, storyId);
  const user = getActiveUser(rawState);
  if (!user) return;
  const prefix = `${langId}::${storyId}::`;
  for (const k of Object.keys(user.cards || {})) if (k.startsWith(prefix)) delete user.cards[k];
  for (const k of Object.keys(user.testAttempts || {})) if (k.startsWith(prefix)) delete user.testAttempts[k];
  const lang = user.languages && user.languages[langId];
  if (lang) {
    lang.storyProgress = lang.storyProgress || {};
    lang.storyProgress[storyId] = defaultStoryProgress();
  }
  cardSession = null;
  testSession = null;
  ensureCards(rawState);   // reseed fresh cards for every sentence/vocab item
  saveState();
  render();
  if (story) showToast(`"${story.title}" reset to the beginning`, 'success');
}

function deleteStory(langId, storyId) {
  const storyKey = `${langId}::${storyId}`;
  const story = rawState.storiesData[storyKey];
  delete rawState.storiesData[storyKey];
  const prefix = `${storyKey}::`;
  // Per-user cleanup of cards + test attempts + last-story pointers.
  for (const uid in rawState.users) {
    const user = rawState.users[uid];
    const lang = user.languages?.[langId];
    if (lang) {
      lang.stories = lang.stories.filter(s => s !== storyId);
      if (lang.lastStoryId === storyId) lang.lastStoryId = null;
    }
    for (const k of Object.keys(user.cards || {})) if (k.startsWith(prefix)) delete user.cards[k];
    for (const k of Object.keys(user.testAttempts || {})) if (k.startsWith(prefix)) delete user.testAttempts[k];
  }
  // Global cleanup of test packs targeting this story.
  for (const k of Object.keys(rawState.testPacks)) {
    const p = rawState.testPacks[k];
    if (p.languageId === langId && p.storyId === storyId) delete rawState.testPacks[k];
  }
  cardSession = null;
  testSession = null;
  saveState();
  render();
  if (story) showToast(`Story "${story.title}" deleted`, 'info');
}

/* ============================================================
   Add-user modal — admin only.
   ============================================================ */
function addUserModal() {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="glass modal">
          <div class="modal-title">Add New User</div>
          <div class="modal-body">
            <p>New profile starts with no progress. They'll appear in the login picker on next launch.</p>
            <div class="form-row" style="margin-bottom: 10px;">
              <div class="lbl"><span>Name</span><span class="val"></span></div>
              <input type="text" id="m-newname" placeholder="e.g. Alex" autocapitalize="words" autocorrect="off" spellcheck="false">
            </div>
            <div class="form-row" style="margin-bottom: 10px;">
              <div class="lbl"><span>Password (optional)</span><span class="val"></span></div>
              <input type="text" id="m-newpass" placeholder="Leave blank for none" autocapitalize="off" autocorrect="off" spellcheck="false">
            </div>
          </div>
          <div class="btn-row">
            <button class="ghost-btn" id="m-cancel" style="flex:1">Cancel</button>
            <button class="gradient-btn" id="m-confirm" style="flex:1">Add User</button>
          </div>
        </div>
      </div>`;
    const finish = () => { closeModal(); resolve(); };
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') finish();
    });
    document.getElementById('m-cancel').addEventListener('click', finish);
    document.getElementById('m-confirm').addEventListener('click', () => {
      const name = (document.getElementById('m-newname').value || '').trim();
      const pass = document.getElementById('m-newpass').value || '';
      if (!name) { showToast('Name required', 'error'); return; }
      // Generate a stable id from the name (slug + counter on collision).
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user';
      let uid = base, n = 2;
      while (rawState.users[uid]) uid = `${base}-${n++}`;
      rawState.users[uid] = makeDefaultUser(uid, name, 'user', pass);
      ensureBuiltins(rawState);   // gives the new user the German language registration
      ensureCards(rawState);      // seeds their cards for any registered story
      ensureStoryProgress(rawState); // initialize first-read state for the new user
      saveState();
      finish();
      render();
      showToast(`${name} added`, 'success');
    });
    try { document.getElementById('m-newname').focus(); } catch {}
  });
}

function deleteTestPack(key) {
  const pack = rawState.testPacks[key];
  if (!pack) return;
  delete rawState.testPacks[key];
  // Per-user cleanup of test attempts whose key carries this packId.
  for (const uid in rawState.users) {
    const user = rawState.users[uid];
    for (const k of Object.keys(user.testAttempts || {})) {
      const parts = k.split('::');
      if (parts.length >= 5 && parts[3] === pack.id) {
        delete user.testAttempts[k];
      }
    }
  }
  saveState();
  render();
  showToast('Test pack deleted', 'info');
}

/* ============================================================
   GRADING — shared by Cards (Type / Speak) and Tests.
   ============================================================ */
function gradeTypeCard(quality) {
  const session = cardSession;
  if (!session) return;
  const card = session.queue[session.idx];
  const stateCard = state.cards[card.id];
  if (!stateCard) return;
  sm2(stateCard, quality);
  const correct = quality >= 3;
  // Type mode has no wrongPile — every card is its own first attempt.
  if (correct) session.correctOnFirst++;
  logActivity(session.langId, session.storyId, correct);
  session.idx++;
  session.revealed = false;
  session.lastInput = '';
  saveState();
  render();
}

function speakGrade(direction) {
  const session = cardSession;
  if (!session) return;
  const card = session.queue[session.idx];
  const stateCard = state.cards[card.id];
  if (!stateCard) return;
  const correct = direction === 'right';
  sm2(stateCard, correct ? 3 : 1);
  if (correct && !card._isRetry) session.correctOnFirst++;
  if (!correct) session.wrongPile.push({ ...card, _isRetry: true });
  logActivity(session.langId, session.storyId, correct);
  session.idx++;
  session.flipped = false;
  saveState();
  render();
}

function gradeTestAnswer() {
  const ts = testSession;
  if (!ts) return;
  const t  = ts.queue[ts.idx];
  // Multi-choice (choose-article) wants exact match against the
  // selected option. Free-text uses Levenshtein with threshold 2.
  const isMultiple = t._type === 'choose-article' && Array.isArray(t._options);
  const ok = isMultiple
    ? (ts.lastInput || '').trim() === String(t.de).trim()
    : (levenshtein(normalize(ts.lastInput || ''), normalize(t.de)) <= 2);
  // Key includes pack segment so uploaded packs and built-in tests
  // accumulate progress under distinct slots.
  const packSeg = t._packId || 'builtin';
  const key = `${ts.langId}::${ts.storyId}::tier${ts.tier}::${packSeg}::${t.originalIdx}`;
  const rec = state.testAttempts[key] || {
    attempts: 0, correct: 0,
    firstAttempts: 0, firstAttemptsCorrect: 0,
    lastAttempt: null
  };
  // Lifetime counters — every attempt, used only for the UI display.
  rec.attempts++;
  if (ok) rec.correct++;
  // First-attempt counters — used by tierUnlocked(). Skip retries
  // that came from the wrong-pile rejoin (they have firstAttempt=false).
  if (t.firstAttempt !== false) {
    rec.firstAttempts++;
    if (ok) rec.firstAttemptsCorrect++;
  }
  rec.lastAttempt = Date.now();
  state.testAttempts[key] = rec;
  if (ok && t.firstAttempt) ts.correctOnFirst++;
  if (!ok) ts.wrongPile.push({ ...t, firstAttempt: false });
  logActivity(ts.langId, ts.storyId, ok);
  ts.revealed = true;
  saveState();
  render();
}

function advanceTestCard() {
  if (!testSession) return;
  testSession.idx++;
  testSession.revealed = false;
  testSession.lastInput = '';
  render();
}

/* ============================================================
   SWIPE — touch gesture handler for Speak-mode flip card.
   ============================================================ */
function attachSwipe(target, handlers) {
  const onStart = (e) => {
    if (e.touches && e.touches.length !== 1) return;
    swipeState.active = true;
    swipeState.committed = false;
    swipeState.startX = (e.touches ? e.touches[0].clientX : e.clientX);
    swipeState.dx = 0;
    swipeState.target = target;
    target.style.transition = 'none';
  };
  const onMove = (e) => {
    if (!swipeState.active || swipeState.committed) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    swipeState.dx = x - swipeState.startX;
    const rot = Math.max(-15, Math.min(15, swipeState.dx / 20));
    target.style.transform = `translateX(${swipeState.dx}px) rotate(${rot}deg)`;
    target.classList.toggle('tint-right', swipeState.dx > 40);
    target.classList.toggle('tint-left',  swipeState.dx < -40);
  };
  const onEnd = () => {
    if (!swipeState.active || swipeState.committed) return;
    target.style.transition = '';
    if (swipeState.dx > 80) {
      swipeState.committed = true;
      target.classList.remove('tint-right');
      target.classList.add('commit-right');
      setTimeout(() => handlers.onRight(), 220);
    } else if (swipeState.dx < -80) {
      swipeState.committed = true;
      target.classList.remove('tint-left');
      target.classList.add('commit-left');
      setTimeout(() => handlers.onLeft(), 220);
    } else {
      target.style.transform = '';
      target.classList.remove('tint-right', 'tint-left');
    }
    swipeState.active = false;
  };
  target.addEventListener('touchstart', onStart, { passive: true });
  target.addEventListener('touchmove',  onMove,  { passive: true });
  target.addEventListener('touchend',   onEnd);
  target.addEventListener('touchcancel', onEnd);
}

/* ============================================================
   DEV — append-only sanity hook.
   Open Safari devtools and run __app.testAppendOnly() to
   verify Story 1 cards survive registration of a fake story-2.
   Returns { before, after } card counts and a sampled card
   state to confirm interval/reps weren't mutated.
   ============================================================ */
window.__app = {
  get state() { return state; },
  saveState,
  testAppendOnly() {
    // Snapshot original state — we restore everything before returning
    // so the test never leaves the user's progress in a tampered state.
    const sampleId = 'de::story-1::0';
    const original = JSON.parse(JSON.stringify(state.cards[sampleId]));
    const beforeCount = Object.keys(state.cards).filter(k => k.startsWith('de::story-1::')).length;

    // Tamper: simulate user progress on card 0 (in-memory only).
    state.cards[sampleId].ef = 2.7;
    state.cards[sampleId].interval = 5;
    state.cards[sampleId].reps = 3;
    const tampered = JSON.parse(JSON.stringify(state.cards[sampleId]));

    // Inject a fake story-2.
    state.languages.de.stories.push('story-2-fake');
    state.storiesData['de::story-2-fake'] = {
      ...BUILTIN_STORY_1,
      id: 'story-2-fake',
      title: 'Fake Story',
      sentences: [
        { de: 'Test eins.', en: 'Test one.', note: null },
        { de: 'Test zwei.', en: 'Test two.', note: null }
      ]
    };

    // Run append-only seeding again — must NOT touch existing cards.
    ensureCards(state);

    const after = JSON.parse(JSON.stringify(state.cards[sampleId]));
    const fakeCount = Object.keys(state.cards).filter(k => k.startsWith('de::story-2-fake::')).length;
    const story1CountAfter = Object.keys(state.cards).filter(k => k.startsWith('de::story-1::')).length;

    // FULL CLEANUP — restore card 0 and remove the fake story so the
    // real app's state is exactly what it was before the test ran.
    state.cards[sampleId] = original;
    state.languages.de.stories = state.languages.de.stories.filter(x => x !== 'story-2-fake');
    for (const k of Object.keys(state.cards)) {
      if (k.startsWith('de::story-2-fake::')) delete state.cards[k];
    }
    delete state.storiesData['de::story-2-fake'];

    // Pass = tampered card survived ensureCards untouched, fake story
    // got 2 new cards, and Story 1 card count was unchanged.
    const passed =
      tampered.ef === after.ef &&
      tampered.interval === after.interval &&
      tampered.reps === after.reps &&
      fakeCount === 2 &&
      beforeCount === story1CountAfter;

    return {
      passed,
      tamperedBefore: tampered,
      afterEnsureCards: after,
      story1CountBefore: beforeCount,
      story1CountAfter,
      fakeStory2Count: fakeCount
    };
  }
};
