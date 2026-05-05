'use strict';

/* Schema migrations + localStorage layer + ensure helpers + stats. */

/* ============================================================
   Even with only v1 today, this is wired up so future versions
   just need entries like `migrations[2] = (data) => { ... }`.
   ============================================================ */
const migrations = {
  // v1 → v2: split `attempts`/`correct` so tier-unlock gating uses
  // first-attempt counters only (prevents grinding the same wrong test
  // until memorized). Historical entries are assumed to have been first
  // attempts since chunk-2 had no retry tracking.
  2: (data) => {
    if (data.testAttempts) {
      for (const k in data.testAttempts) {
        const r = data.testAttempts[k];
        if (r.firstAttempts === undefined)        r.firstAttempts = r.attempts || 0;
        if (r.firstAttemptsCorrect === undefined) r.firstAttemptsCorrect = r.correct || 0;
      }
    }
    return data;
  },
  // v2 → v3: introduce a multi-user model. The previous root-level
  // per-user fields (cards, testAttempts, sessions, settings,
  // languages, activeLanguageId) collapse under `users.luka` so the
  // existing learner keeps every shred of progress. Sofia is seeded
  // empty for the family iPad use case. After this migration, code
  // accesses per-user fields through a Proxy that routes to the
  // active user automatically.
  3: (data) => {
    const luka = {
      id: 'luka', name: 'Luka', role: 'admin', password: '1234',
      activeLanguageId: data.activeLanguageId || 'de',
      languages:    data.languages    || {},
      cards:        data.cards        || {},
      testAttempts: data.testAttempts || {},
      sessions:     data.sessions     || [],
      settings:     data.settings     || { theme: 'dark', newPerDay: 10, dailyCap: 30, cardMode: 'type', ttsRate: 0.9 }
    };
    const sofia = {
      id: 'sofia', name: 'Sofia', role: 'user', password: '',
      activeLanguageId: 'de',
      languages: {},
      cards: {}, testAttempts: {}, sessions: [],
      settings: { theme: 'dark', newPerDay: 10, dailyCap: 30, cardMode: 'type', ttsRate: 0.9 }
    };
    const out = {
      schemaVersion: 3,
      activeUserId: 'luka',
      users: { luka, sofia },
      // Global content stays at root.
      storiesData: data.storiesData || {},
      testPacks:   data.testPacks   || {},
      lastBackup:  data.lastBackup  ?? null
    };
    return out;
  },
};

function migrate(data) {
  while (data.schemaVersion < CURRENT_SCHEMA) {
    const next = data.schemaVersion + 1;
    const fn = migrations[next];
    if (!fn) {
      // No migration registered — bump version anyway to avoid lockup.
      data.schemaVersion = next;
      continue;
    }
    data = fn(data);
    data.schemaVersion = next;
  }
  return data;
}

/* ============================================================
   STORAGE
   ============================================================ */
/* ------------------------------------------------------------
   Multi-user state (chunk 3a-patch / pre-3b).
   Per-user fields live under users[uid]; global content (story
   data, test packs, last backup) lives at root. A Proxy routes
   reads/writes of per-user fields to the active user, so existing
   code that says `state.cards`, `state.languages`, etc. keeps
   working without a refactor.
   ------------------------------------------------------------ */
const PER_USER_FIELDS = new Set(['cards', 'testAttempts', 'sessions', 'settings', 'languages', 'activeLanguageId', 'libraryDrilledIn']);

function makeDefaultUser(id, name, role, password) {
  return {
    id, name, role, password,
    activeLanguageId: 'de',
    libraryDrilledIn: null,    // null = top-level language picker; langId = drilled into that book
    languages: {},
    cards: {},
    testAttempts: {},
    sessions: [],
    settings: { theme: 'dark', newPerDay: 10, dailyCap: 30, cardMode: 'type', ttsRate: 0.9 }
  };
}

function defaultState() {
  return {
    schemaVersion: CURRENT_SCHEMA,
    activeUserId: 'luka',
    users: {
      luka:  makeDefaultUser('luka',  'Luka',  'admin', '1234'),
      sofia: makeDefaultUser('sofia', 'Sofia', 'user',  '')
    },
    storiesData: {},
    testPacks: {},
    lastBackup: null
  };
}

function getActiveUser(s) {
  const raw = s || rawState;
  return raw && raw.users ? raw.users[raw.activeUserId] : null;
}

function makeStateProxy(rawTarget) {
  const FALLBACK = { cards: {}, testAttempts: {}, sessions: [], settings: {}, languages: {}, activeLanguageId: null };
  return new Proxy(rawTarget, {
    get(target, prop) {
      if (PER_USER_FIELDS.has(prop)) {
        const user = target.users && target.users[target.activeUserId];
        if (!user) return FALLBACK[prop];
        return user[prop];
      }
      return target[prop];
    },
    set(target, prop, value) {
      if (PER_USER_FIELDS.has(prop)) {
        const user = target.users && target.users[target.activeUserId];
        if (user) user[prop] = value;
        return true;
      }
      target[prop] = value;
      return true;
    },
    has(target, prop) {
      if (PER_USER_FIELDS.has(prop)) return true;
      return prop in target;
    }
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    let data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return defaultState();
    if (typeof data.schemaVersion !== 'number') data.schemaVersion = 0;
    return migrate(data);
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    // Persist the underlying rawState (the Proxy is a pass-through
    // for serialization, but referencing rawState directly is more
    // explicit and avoids surprises if Proxy traps change later).
    const raw = (typeof rawState !== 'undefined' ? rawState : state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (e) {
    console.warn('saveState failed', e);
  }
}

/* ------------------------------------------------------------
   ensureBuiltins — register German + Story 1 if missing.
   NEVER overwrites user data. New built-ins added in future
   app versions get auto-installed without nuking progress.
   ------------------------------------------------------------ */
// ensureBuiltins — make sure each USER has German registered with
// current built-in metadata, story-1 in their stories list, and the
// built-in story content is up to date in the global storiesData.
// Map of built-in stories per language. Each entry has the embedded
// story object plus the preset theme to use as a one-time default
// when the language is first registered for a user.
const BUILTIN_STORIES = {
  de: { story: BUILTIN_STORY_1,    defaultThemePreset: 'flag_at' },
  it: { story: BUILTIN_STORY_IL_GRUPPO, defaultThemePreset: 'flag_it' }
};

/* ------------------------------------------------------------
   DEFAULT COVER ART — atmospheric SVG scenes per language.
   Used when no user image is uploaded. Each is a self-contained
   SVG that scales to its container via preserveAspectRatio.
   ------------------------------------------------------------ */
const DEFAULT_COVERS = {
  // Bavarian / alpine vibe: warm dawn sky over pine forest + peaks,
  // with gold sun and hint of red ridgeline (Bundesflagge palette).
  de: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
  <defs>
<linearGradient id="de-sky" x1="0" x2="0" y1="0" y2="1">
  <stop offset="0%" stop-color="#1a0a14"/>
  <stop offset="55%" stop-color="#2a0c0a"/>
  <stop offset="100%" stop-color="#1f1500"/>
</linearGradient>
<radialGradient id="de-sun" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0%" stop-color="#ffce00" stop-opacity="0.95"/>
  <stop offset="60%" stop-color="#ffce00" stop-opacity="0.5"/>
  <stop offset="100%" stop-color="#ffce00" stop-opacity="0"/>
</radialGradient>
  </defs>
  <rect width="800" height="300" fill="url(#de-sky)"/>
  <!-- Sun glow + disk -->
  <circle cx="640" cy="100" r="120" fill="url(#de-sun)"/>
  <circle cx="640" cy="100" r="32" fill="#ffce00" opacity="0.95"/>
  <!-- Far peaks -->
  <path d="M0 215 L90 140 L155 175 L240 110 L310 165 L400 90 L490 165 L580 130 L670 175 L780 145 L800 160 L800 300 L0 300 Z"
    fill="#0d0606" opacity="0.78"/>
  <!-- Mid ridge with red tint -->
  <path d="M0 245 L120 195 L210 225 L320 175 L450 220 L560 195 L680 230 L800 215 L800 300 L0 300 Z"
    fill="#1a0606" opacity="0.92"/>
  <!-- Pine trees row -->
  <g fill="#000" opacity="0.92">
<polygon points="40,278 18,300 62,300"/>
<polygon points="100,266 78,300 122,300"/>
<polygon points="155,272 130,300 180,300"/>
<polygon points="220,260 195,300 245,300"/>
<polygon points="285,275 262,300 308,300"/>
<polygon points="350,265 325,300 375,300"/>
<polygon points="420,272 396,300 444,300"/>
<polygon points="490,260 465,300 515,300"/>
<polygon points="555,275 532,300 578,300"/>
<polygon points="620,265 596,300 644,300"/>
<polygon points="690,275 666,300 714,300"/>
<polygon points="760,260 736,300 784,300"/>
  </g>
</svg>`,
  // Tuscan twilight: rolling hills, cypress trees, warm horizon glow,
  // green sky transition (Italian Tricolore palette).
  it: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
  <defs>
<linearGradient id="it-sky" x1="0" x2="0" y1="0" y2="1">
  <stop offset="0%" stop-color="#0d1a14"/>
  <stop offset="50%" stop-color="#3a1410"/>
  <stop offset="100%" stop-color="#1a0606"/>
</linearGradient>
<radialGradient id="it-sun" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0%" stop-color="#fef9c3" stop-opacity="0.95"/>
  <stop offset="55%" stop-color="#ffce00" stop-opacity="0.45"/>
  <stop offset="100%" stop-color="#ce2b37" stop-opacity="0"/>
</radialGradient>
  </defs>
  <rect width="800" height="300" fill="url(#it-sky)"/>
  <!-- Warm horizon glow -->
  <ellipse cx="200" cy="220" rx="320" ry="60" fill="#ce2b37" opacity="0.18"/>
  <!-- Sun -->
  <circle cx="180" cy="115" r="140" fill="url(#it-sun)"/>
  <circle cx="180" cy="115" r="28" fill="#fef9c3" opacity="0.96"/>
  <!-- Distant rolling hills (greenish, faded) -->
  <path d="M0 210 Q120 160 260 195 T520 180 T800 200 L800 300 L0 300 Z"
    fill="#0a1f15" opacity="0.65"/>
  <!-- Mid hill -->
  <path d="M0 245 Q160 210 320 235 T640 230 T800 245 L800 300 L0 300 Z"
    fill="#1a0606" opacity="0.85"/>
  <!-- Front hill -->
  <path d="M0 275 Q200 255 400 270 T800 270 L800 300 L0 300 Z"
    fill="#0a0a0a" opacity="0.95"/>
  <!-- Cypress trees clustered on the right hill -->
  <g fill="#0a0606">
<ellipse cx="500" cy="232" rx="7"  ry="34"/>
<ellipse cx="540" cy="228" rx="9"  ry="42"/>
<ellipse cx="572" cy="234" rx="6"  ry="32"/>
<ellipse cx="608" cy="226" rx="8"  ry="44"/>
<ellipse cx="650" cy="232" rx="7"  ry="36"/>
<ellipse cx="690" cy="228" rx="9"  ry="42"/>
<ellipse cx="730" cy="234" rx="6"  ry="32"/>
  </g>
</svg>`
};

function getDefaultCoverSvg(langId) {
  return DEFAULT_COVERS[langId] || null;
}

function ensureBuiltins(s) {
  s.users = s.users || {};
  // Defensive: at least one user must exist (migrations create
  // luka + sofia but a hand-edited backup might lack them).
  if (Object.keys(s.users).length === 0) {
    s.users.luka = makeDefaultUser('luka', 'Luka', 'admin', '1234');
  }
  if (!s.activeUserId || !s.users[s.activeUserId]) {
    s.activeUserId = 'luka' in s.users ? 'luka' : Object.keys(s.users)[0];
  }

  // One-time migration: replace the legacy IT built-in
  // "Una giornata a Roma" (id: story-1) with "Il gruppo" (it-a1-s01).
  // Drops the old story slot and any progress that was tied to it.
  if (!s.italianBuiltinV2) {
    if (s.storiesData && s.storiesData['it::story-1']) {
      delete s.storiesData['it::story-1'];
    }
    for (const uid in s.users) {
      const user = s.users[uid];
      const itLang = user.languages && user.languages.it;
      if (itLang && Array.isArray(itLang.stories)) {
        itLang.stories = itLang.stories.filter(id => id !== 'story-1');
        if (itLang.lastStoryId === 'story-1') itLang.lastStoryId = null;
        if (itLang.storyProgress) delete itLang.storyProgress['story-1'];
      }
      for (const k of Object.keys(user.cards || {})) {
        if (k.startsWith('it::story-1::')) delete user.cards[k];
      }
      for (const k of Object.keys(user.testAttempts || {})) {
        if (k.startsWith('it::story-1::')) delete user.testAttempts[k];
      }
      if (Array.isArray(user.sessions)) {
        user.sessions = user.sessions.filter(x => !(x.languageId === 'it' && x.storyId === 'story-1'));
      }
    }
    s.italianBuiltinV2 = true;
  }

  // Per-user: register every BUILTIN_LANGUAGES entry, seed each
  // language's built-in story, set the default theme on first
  // registration. Languages already present are preserved.
  for (const uid in s.users) {
    const user = s.users[uid];
    user.languages = user.languages || {};

    for (const langId in BUILTIN_LANGUAGES) {
      const builtin = BUILTIN_LANGUAGES[langId];
      const existing = user.languages[langId];

      if (!existing) {
        user.languages[langId] = {
          ...builtin,
          theme: { ...builtin.theme },
          stories: [],
          lastTab: 'library',
          lastStoryId: null,
          readMode: 'full',
          themeVersion: 1   // mark as already-themed; preset picker can change later
        };
      } else {
        // Backfill missing fields on previously-stored language records.
        existing.theme   = existing.theme   || { ...builtin.theme };
        existing.ttsLang = existing.ttsLang || builtin.ttsLang;
        existing.flag    = existing.flag    || builtin.flag;
        existing.name    = existing.name    || builtin.name;
        existing.teaser  = existing.teaser  || builtin.teaser  || null;
        existing.levels  = existing.levels  || builtin.levels  || null;
        // Protagonist metadata (Stage B). Only languages that use
        // {{PROTAGONIST}} substitution carry these fields.
        if (builtin.defaultProtagonist && existing.defaultProtagonist === undefined) {
          existing.defaultProtagonist = builtin.defaultProtagonist;
        }
        if (builtin.suggestedProtagonistNames && existing.suggestedProtagonistNames === undefined) {
          existing.suggestedProtagonistNames = [...builtin.suggestedProtagonistNames];
        }
        if (builtin.protagonistGender && existing.protagonistGender === undefined) {
          existing.protagonistGender = builtin.protagonistGender;
        }
        // Seed the built-in coverImage so the body-bg-on-drilldown
        // feature has something to show for users who haven't picked
        // a custom one. User-chosen covers are preserved.
        if (builtin.coverImage && existing.coverImage == null) {
          existing.coverImage = builtin.coverImage;
        }
        if (!Array.isArray(existing.stories)) existing.stories = [];
        if (!existing.lastTab) existing.lastTab = 'library';
        if (existing.lastStoryId === undefined) existing.lastStoryId = null;
        if (!existing.readMode) existing.readMode = 'full';
        // One-time theme refresh for users from before the flag-theme
        // patch (German) or before Italian was a built-in.
        if (existing.themeVersion === undefined) {
          const preset = BUILTIN_STORIES[langId] && BUILTIN_STORIES[langId].defaultThemePreset;
          if (preset && THEME_PRESETS[preset]) {
            existing.theme = { ...THEME_PRESETS[preset].theme };
          }
          existing.themeVersion = 1;
        }
        // German default switched from `flag_de` → `flag_at`. Users
        // who are still on the previous default get bumped to the
        // new one; users who picked another preset (Cosmic, Ocean,
        // …) keep their choice. themeVersion=2 marks the swap done.
        if (langId === 'de' && existing.themeVersion < 2) {
          const currentPreset = matchPresetId(existing.theme);
          if (currentPreset === 'flag_de') {
            existing.theme = { ...THEME_PRESETS.flag_at.theme };
          }
          existing.themeVersion = 2;
        }
      }

      // Make sure each language's built-in story is registered.
      const builtinEntry = BUILTIN_STORIES[langId];
      if (builtinEntry && builtinEntry.story) {
        const storyId = builtinEntry.story.id;
        if (!user.languages[langId].stories.includes(storyId)) {
          user.languages[langId].stories.push(storyId);
        }
      }
    }
  }

  // Global story content: refresh each built-in story when its
  // _storyVersion has advanced. Sentences don't change, so existing
  // card indices stay valid (cards are append-only by index).
  for (const langId in BUILTIN_STORIES) {
    const builtinEntry = BUILTIN_STORIES[langId];
    const story = builtinEntry.story;
    if (!story) continue;
    const key = `${langId}::${story.id}`;
    const stored = s.storiesData[key];
    const storedVer  = (stored && stored._storyVersion) || 1;
    const builtinVer = story._storyVersion || 1;
    if (!stored || storedVer < builtinVer) {
      s.storiesData[key] = story;
    }
  }
  // Italian "Il gruppo" grammar enrichment patch — the imported v1
  // shipped with sparse explanations only. Splice the rich examples /
  // tips / paradigm tables into the stored copy so the Rules tab,
  // first-read step 2, and drill 5 review all show the richer card.
  patchItGrammarRich(s);
}

// Idempotent: only writes when fields are missing.
const IT_A1_S01_GRAMMAR_PATCH = {
  'a1-g-01': {
    longExplanation: "Italian has subject pronouns — io, tu, lui, lei, noi, voi, loro — but it usually drops them, because the verb ending already tells you who's doing the action. You'll mostly see them when the speaker wants to emphasize a person or contrast two subjects. Notice how 'lei' and 'loro' carry the emotional weight of this chapter: 'lei' picks out {{PROTAGONIST}} alone, 'loro' the group she's not in.",
    examples: [
      { de: 'Lei ha dieci anni.', en: 'She is ten years old.', highlight: 'Lei' },
      { de: 'Loro ridono.', en: 'They laugh.', highlight: 'Loro' },
      { de: 'Io sono Bianca.', en: 'I am Bianca.', highlight: 'Io' }
    ],
    tips: [
      "Italian usually drops the pronoun — the verb ending tells you who.",
      "Use the pronoun only for emphasis or contrast.",
      "'lui' = he, 'lei' = she; both can also mean polite 'you' (introduced later)."
    ],
    table: {
      title: 'Subject pronouns',
      headers: ['Person', 'Pronoun'],
      rows: [
        ['1st sing.',    'io (I)'],
        ['2nd sing.',    'tu (you, informal)'],
        ['3rd sing. m',  'lui (he)'],
        ['3rd sing. f',  'lei (she)'],
        ['1st plur.',    'noi (we)'],
        ['2nd plur.',    'voi (you all)'],
        ['3rd plur.',    'loro (they)']
      ]
    }
  },
  'a1-g-02': {
    longExplanation: "Every Italian noun is either masculine or feminine — there's no neutral. Most nouns ending in -o are masculine (il libro, il banco, il lago); most ending in -a are feminine (la casa, la matita, la bambina). Nouns ending in -e go either way (il sole is masculine; la classe is feminine) and have to be learned one by one. The article and any adjective in the sentence MUST agree with the noun's gender.",
    examples: [
      { de: "L'aria è fredda.", en: 'The air is cold.', highlight: 'aria' },
      { de: 'il lago', en: 'the lake', highlight: 'lago' },
      { de: 'la matita', en: 'the pencil', highlight: 'matita' }
    ],
    tips: [
      "Most -o nouns are masculine; most -a nouns are feminine.",
      "-e nouns can be either gender — memorize each one's gender with the article.",
      "When in doubt, learn the noun together with its definite article (il / la)."
    ],
    table: {
      title: 'Typical gender endings',
      headers: ['Ending', 'Usually', 'Examples'],
      rows: [
        ['-o', 'masculine', 'libro, banco, lago'],
        ['-a', 'feminine',  'casa, matita, aria'],
        ['-e', 'either',    'sole (m) · classe (f)']
      ]
    }
  },
  'a1-g-03': {
    longExplanation: "Italian nouns change ending to mark plural. The pattern depends on the singular ending: masculine -o becomes -i (libro → libri), feminine -a becomes -e (matita → matite), and both-gender -e becomes -i (nome → nomi, classe → classi). The article and adjective shift to plural too: il libro → i libri, la matita → le matite.",
    examples: [
      { de: 'i bambini', en: 'the children', highlight: 'bambini' },
      { de: 'le pietre', en: 'the stones',   highlight: 'pietre' },
      { de: 'le classi', en: 'the classes',  highlight: 'classi' }
    ],
    tips: [
      "Masculine -o → -i.",
      "Feminine -a → -e.",
      "-e nouns (either gender) → -i.",
      "The whole phrase shifts: la matita rossa → le matite rosse."
    ],
    table: {
      title: 'Plural endings',
      headers: ['Singular', 'Plural', 'Example'],
      rows: [
        ['-o (m)',   '-i', 'libro → libri'],
        ['-a (f)',   '-e', 'matita → matite'],
        ['-e (m/f)', '-i', 'nome → nomi · classe → classi']
      ]
    }
  },
  'a1-g-04': {
    longExplanation: "Indefinite articles (the equivalents of English 'a' / 'an') agree with the noun's gender and the next sound. Use 'un' before any masculine noun. Use 'una' before a feminine noun starting with a consonant. Use 'un\\'' (with apostrophe, no space) before a feminine noun starting with a vowel. Note: 'un amico' has no apostrophe — masculine 'un' never elides.",
    examples: [
      { de: 'una bambina piccola', en: 'a small girl',         highlight: 'una' },
      { de: 'un libro',            en: 'a book',               highlight: 'un' },
      { de: "un'amica",            en: 'a (female) friend',    highlight: "un'" }
    ],
    tips: [
      "'un' before masculine nouns — no apostrophe even before vowels.",
      "'una' before feminine nouns starting with a consonant.",
      "'un\\'' (apostrophe) before feminine nouns starting with a vowel."
    ],
    table: {
      title: 'Indefinite articles',
      headers: ['Form', 'Use', 'Example'],
      rows: [
        ['un',   'masculine (any sound)',    'un libro · un amico'],
        ['una',  'feminine + consonant',     'una matita · una bambina'],
        ["un'",  'feminine + vowel',         "un'amica · un'ora"]
      ]
    }
  },
  'a1-g-05': {
    longExplanation: "Definite articles (the equivalents of English 'the') change with gender, number, and the sound that follows. In this story you'll meet four forms: 'il' / 'la' for singular nouns starting with a consonant, 'l\\'' for singular nouns starting with a vowel (both genders), and 'i' / 'le' for plurals. The masculine 'lo' / 'gli' (before s+consonant, z, ps, gn) come up more fully in later stories.",
    examples: [
      { de: 'il lago',   en: 'the lake',   highlight: 'il' },
      { de: 'la classe', en: 'the class',  highlight: 'la' },
      { de: "l'aria",    en: 'the air',    highlight: "l'" },
      { de: 'le pietre', en: 'the stones', highlight: 'le' }
    ],
    tips: [
      "'il' / 'la' before consonants — 'l\\'' before vowels (both genders).",
      "Plural: 'i' for masculine, 'le' for feminine.",
      "Always learn a noun together with its article."
    ],
    table: {
      title: 'Definite articles in this story',
      headers: ['', 'Singular', 'Plural'],
      rows: [
        ['masculine',     'il',  'i'],
        ['feminine',      'la',  'le'],
        ['before vowel',  "l'",  '— (i / le)']
      ],
      note: "'lo' (sing.) and 'gli' (plur.) before s+consonant, z, ps, gn — covered later."
    }
  },
  'a1-g-06': {
    longExplanation: "'Essere' (to be) and 'avere' (to have) are the two everyday verbs Italian leans on the most. Use 'essere' for identity, location, and description (Sono Bianca · È in classe · L'aria è fredda). Use 'avere' for possession AND for the states English expresses with 'to be' — age, hunger, thirst, cold (Ha dieci anni — literally 'she has ten years'). Memorize both paradigms now; almost every conversation uses one of them.",
    examples: [
      { de: '{{PROTAGONIST}} è in classe.', en: '{{PROTAGONIST}} is in class.', highlight: 'è' },
      { de: 'Lei ha dieci anni.',           en: 'She is ten years old.',         highlight: 'ha' },
      { de: 'Io sono Bianca.',              en: 'I am Bianca.',                  highlight: 'sono' }
    ],
    tips: [
      "'essere' = identity, location, traits.",
      "'avere' = possession AND age, hunger, thirst, fear.",
      "English says 'I am 10' — Italian says 'I have 10 years' (Ho dieci anni)."
    ],
    table: {
      title: 'Present tense — essere & avere',
      headers: ['', 'essere (to be)', 'avere (to have)'],
      rows: [
        ['io',        'sono',   'ho'],
        ['tu',        'sei',    'hai'],
        ['lui / lei', 'è',      'ha'],
        ['noi',       'siamo',  'abbiamo'],
        ['voi',       'siete',  'avete'],
        ['loro',      'sono',   'hanno']
      ]
    }
  },
  'a1-g-07': {
    longExplanation: "Adjectives in Italian shift their ending to match the noun's gender and number. Most adjectives have four forms: -o (masc. sing.), -a (fem. sing.), -i (masc. plur.), -e (fem. plur.) — so piccolo, piccola, piccoli, piccole. Some adjectives end in -e in the singular (grande, felice) and use only -e / -i. The adjective usually follows the noun, but a small core (bello, buono, grande, piccolo, vecchio, giovane) often goes before.",
    examples: [
      { de: 'una bambina piccola', en: 'a small girl',  highlight: 'piccola' },
      { de: 'un bambino piccolo',  en: 'a small boy',   highlight: 'piccolo' },
      { de: 'le pietre bagnate',   en: 'the wet stones', highlight: 'bagnate' }
    ],
    tips: [
      "Adjective ending must match the noun's gender + number.",
      "Most adjectives have 4 forms: -o / -a / -i / -e.",
      "Adjectives ending in -e (singular) use only 2 forms: -e (sing.) / -i (plur.)."
    ],
    table: {
      title: 'Adjective endings',
      headers: ['', 'Singular', 'Plural'],
      rows: [
        ['masculine',       '-o', '-i'],
        ['feminine',        '-a', '-e'],
        ['both (-e type)',  '-e', '-i']
      ]
    }
  }
};
function patchItGrammarRich(s) {
  const story = s.storiesData && s.storiesData['it::it-a1-s01'];
  if (!story || !Array.isArray(story.grammarRules)) return;
  let changed = false;
  story.grammarRules.forEach(r => {
    const patch = IT_A1_S01_GRAMMAR_PATCH[r._id];
    if (!patch) return;
    // Only fill in fields that aren't already set, so user-imported
    // updates aren't overwritten.
    if (!Array.isArray(r.examples) || !r.examples.length) {
      r.examples = patch.examples; changed = true;
    }
    if (!Array.isArray(r.tips) || !r.tips.length) {
      r.tips = patch.tips; changed = true;
    }
    if (!r.table) { r.table = patch.table; changed = true; }
    if (patch.longExplanation && (!r.longExplanation || r.longExplanation === r.desc)) {
      r.longExplanation = patch.longExplanation; changed = true;
    }
  });
  // No saveState here — caller's flow will save once everything's
  // ensured. Just mark the in-memory copy.
}

/* ------------------------------------------------------------
   ensureCards — append-only seeding across every user. Each user
   gets their own card record per (langId, storyId, sentenceIdx);
   existing cards are never modified.
   ------------------------------------------------------------ */
function ensureCards(s) {
  const newCard = () => ({
    ef: 2.5, interval: 0, reps: 0, nextReview: null,
    totalReviews: 0, correctReviews: 0, lastReviewed: null
  });
  for (const uid in s.users) {
    const user = s.users[uid];
    user.cards = user.cards || {};
    const langs = user.languages || {};
    for (const langId in langs) {
      const lang = langs[langId];
      if (!Array.isArray(lang.stories)) continue;

      for (const storyId of lang.stories) {
        const storyKey = `${langId}::${storyId}`;
        const story = s.storiesData[storyKey];
        if (!story) continue;

        // Sentence cards: id = `${langId}::${storyId}::${idx}`
        if (Array.isArray(story.sentences)) {
          story.sentences.forEach((_, idx) => {
            const cardId = `${langId}::${storyId}::${idx}`;
            if (!user.cards[cardId]) user.cards[cardId] = newCard();
          });
        }
        // Vocabulary cards (chunk-3a-patch): separate namespace so
        // they're tracked independently from sentence cards.
        // id = `${langId}::${storyId}::vocab::${idx}`
        if (Array.isArray(story.vocabulary)) {
          story.vocabulary.forEach((_, idx) => {
            const cardId = `${langId}::${storyId}::vocab::${idx}`;
            if (!user.cards[cardId]) user.cards[cardId] = newCard();
          });
        }
      }
    }
  }
}

/* ------------------------------------------------------------
   ensureStoryProgress — every (user, lang, story) gets a progress
   record describing which phase the learner is in (first-read,
   drill-flow, free-practice) and which substep within first-read.
   Stories with prior card activity are auto-promoted past first-read
   so existing users aren't pushed back through the 6-step flow.
   ------------------------------------------------------------ */
function defaultStoryProgress() {
  return {
    phase: 'first-read',     // 'first-read' | 'drill-flow' | 'free-practice'
    firstReadStep: 1,        // 1..6
    step1Phase: 'intro',     // 'intro' | 'narration' | 'done'
    sentenceIdx: 0,          // step 3 cursor
    vocabIdx: 0,             // step 4 cursor
    firstReadDone: false,
    showEnglish: true,       // step 1 narration toggle — on by default for first read
    // Story-hub tile completion gates. Each unlocks the next tile.
    listenDone: false,       // cinema narration played to the end at least once
    grammarDone: false,      // user finished the cinematic grammar review
    walkthroughDone: false,  // user reached the last sentence in cinematic walkthrough
    // Stage D — drill flow. currentDrill is the active drill (1..6);
    // drillsDone[N] flips true when drill N is satisfied. Per-drill
    // ephemeral state (queue index, retry buckets) lives here so a
    // learner can resume mid-drill across sessions.
    currentDrill: 1,
    drillsDone: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false },
    drill2: { idx: 0, queue: null, streak: {} },        // EN→IT typed
    drill3: { idx: 0, queue: null, retried: {} },        // sentence assembly
    drill4: { idx: 0, queue: null, doneSet: {} },        // dictation
    drill5: { idx: 0, queue: null, results: {} },        // rule spotting
    unlocked: false,                                      // drill 6 → next story unlock
    // Stage E — free practice. fpMode is the active sub-screen
    // inside the free-practice phase; default 'hub' = tile grid.
    fpMode: 'hub'                                         // 'hub' | 'listen' | 'assembly' | 'dictation'
  };
}
function ensureStoryProgress(s) {
  for (const uid in s.users) {
    const user = s.users[uid];
    const langs = user.languages || {};
    for (const langId in langs) {
      const lang = langs[langId];
      if (!Array.isArray(lang.stories)) continue;
      lang.storyProgress = lang.storyProgress || {};
      for (const storyId of lang.stories) {
        if (lang.storyProgress[storyId]) continue;
        const prog = defaultStoryProgress();
        // If any sentence/vocab card for this story already has reps>0,
        // the user has already played with it — skip first-read.
        const prefix = `${langId}::${storyId}::`;
        let touched = false;
        for (const cardId in user.cards) {
          if (!cardId.startsWith(prefix)) continue;
          const c = user.cards[cardId];
          if (c && c.reps > 0) { touched = true; break; }
        }
        if (touched) {
          prog.phase = 'drill-flow';
          prog.firstReadDone = true;
          prog.firstReadStep = 6;
          prog.step1Phase = 'done';
        }
        lang.storyProgress[storyId] = prog;
      }
      // Backfill drill fields for stories that pre-date Stage D so
      // existing localStorage upgrades cleanly without losing first-read
      // progress.
      for (const storyId of lang.stories) {
        const p = lang.storyProgress[storyId];
        if (!p) continue;
        if (p.currentDrill === undefined) p.currentDrill = 1;
        if (!p.drillsDone) p.drillsDone = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false };
        if (!p.drill2) p.drill2 = { idx: 0, queue: null, streak: {} };
        if (!p.drill3) p.drill3 = { idx: 0, queue: null, retried: {} };
        if (!p.drill4) p.drill4 = { idx: 0, queue: null, doneSet: {} };
        if (!p.drill5) p.drill5 = { idx: 0, queue: null, results: {} };
        if (p.unlocked === undefined) p.unlocked = false;
        if (!p.fpMode) p.fpMode = 'hub';
      }
    }
  }
}

/* ============================================================
   STATS HELPERS
   ============================================================ */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getStreak(s) {
  if (!Array.isArray(s.sessions) || s.sessions.length === 0) return 0;
  const dates = new Set(s.sessions.map(x => x.date));
  let streak = 0;
  const cur = new Date();
  // Walk back day-by-day until we hit a missing day.
  while (true) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${dd}`;
    if (dates.has(key)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Walks all cards belonging to a (langId, optional storyId) prefix.
 * Returns counts: { new, due, mastered, total }.
 */
function getStats(s, langId, storyId) {
  const now = Date.now();
  const prefix = storyId ? `${langId}::${storyId}::` : `${langId}::`;
  let n = 0, due = 0, mastered = 0, total = 0;
  for (const cardId in s.cards) {
    if (!cardId.startsWith(prefix)) continue;
    const c = s.cards[cardId];
    total++;
    if (c.reps === 0 && c.nextReview === null) {
      n++;
    } else if (c.nextReview !== null && c.nextReview <= now) {
      due++;
    }
    if (c.interval >= MASTERED_INTERVAL_DAYS) mastered++;
  }
  return { new: n, due, mastered, total };
}
