# Storyglot — App UX Spec

This document is the brief for the Storyglot client app: how stories
are packaged, how the learner moves through them, and what the UI
needs to expose at each stage. It is the companion to
`STORYGLOT_STORY_SPEC.md` (which governs how content is authored)
and the language bible (which governs what content is authored).
The story spec wins on content rules. This spec wins on app
behavior.

The repo is `https://github.com/lukajr11/storyglot`. Where this
spec describes structure that already exists in the repo (story
JSON schema, top-level navigation), the existing code is the
source of truth — read it before changing it. Where this spec
describes new behavior, the spec is the source of truth.

This is a v1 specification. Items marked **(v2)** are deferred and
should not be built in this pass.

---

## 1. Product Shape

### 1.1 What the learner sees

Storyglot is a story-based language-learning app. Per language, the
learner moves through a single connected series of stories, A1 to
B2, in order. Each story is a chapter in that series. The library
tab shows one card per language journey — not multiple books per
language.

The learner's experience of a single story has three sequential
phases:

| Phase | Duration | Shape | Gating |
|---|---|---|---|
| **First-read** | ~30 min, single sitting | Linear, 6 fixed steps | Must complete to unlock drill flow |
| **Drill flow** | ~10 min/day across 4–8 days | Linear, 6 gated drills | Final drill unlocks next story |
| **Free practice** | Open-ended, returns indefinitely | Tile grid, any order | Unlocks after drill flow complete |

These three phases are different screens. They share the same
underlying story data but present it through different UI shells.
Do not collapse them into one "story screen with tabs" — the whole
point is that the learner has a single obvious next action at every
stage.

### 1.2 What gates what

- Story N's first-read unlocks when story N−1's drill flow is
  complete (specifically, drill 6 — the transfer test — passes
  the spec's mastery threshold).
- Story 1's first-read is always available.
- Free practice for story N unlocks when story N's drill flow is
  complete.
- A "Review" button at the library level is always available once
  any story has reached free practice; it pulls SRS-due cards
  across all stories that have reached that stage. See §6.

---

## 2. Book Bundle Format

A "book" is a packaging format for one language's full series. One
book = one language journey (A1 → B2). The library tab lists books;
opening a book is what gives access to its stories.

### 2.1 Folder layout

```
italian/
  book.json
  background.jpg
  placeholder.jpg
  stories/
    s01.json
    s02.json
    ...
  covers/
    s01.jpg
    s02.jpg
    ...
  audio/
    s01_intro_en.mp3
    s01_full_it.mp3
    s01_sentences/
      001.mp3
      002.mp3
      ...
    s02_intro_en.mp3
    ...
```

Asset filenames are predictable from the story id. The app does not
need a manifest of audio/image paths — it derives them by
convention. Missing assets fall back gracefully (see §2.4).

### 2.2 `book.json`

Top-level metadata for the journey. Required fields:

- `id` — e.g. `"italian"`
- `language` — display name, e.g. `"Italian"`
- `target_language_code` — e.g. `"it"` (for TTS fallback)
- `title` — series title for the library card
- `teaser` — 1–2 sentence English description for the library card
- `levels` — array, e.g. `["A1", "A2", "B1", "B2"]`
- `default_protagonist` — string, e.g. `"Bianca"`
- `suggested_protagonist_names` — array of strings shown in the
  name-selection dropdown
- `protagonist_gender` — `"feminine"` or `"masculine"`. The
  name-selection UI must restrict custom-typed names to matching
  gender; see story spec §5.1.
- `story_order` — array of story ids in curriculum order, e.g.
  `["it-a1-s01", "it-a1-s02", ...]`. This is what the app reads to
  know which story comes next.

### 2.3 Story JSON — additions to existing schema

The existing schema in `story-1.json` is the source of truth. This
spec adds three new top-level fields. Do not add others; verify
the additions do not collide with existing field names before
implementing.

- `cover_image_prompt` — 1–2 sentences describing the story's cover
  image, written for an image generator. Used as fallback display
  text when `covers/sNN.jpg` is missing, and as authoring input
  when generating images. Example: *"A young girl alone at her
  school desk by a window, autumn light, Lake Como visible
  outside, watercolor style."*
- `atmosphere_intro` — English mood-setter script, ~30s read
  aloud. Sets atmosphere only — no plot summary, no learning
  framing. Played at first-read step 1 before the Italian
  narration. Distinct from the existing `synopsis` field, which is
  the library-card description.
- `audio_assets` — optional object listing which audio files
  should exist for this story; if omitted the app derives them by
  convention. Reserved for explicit overrides only.

The existing `sentences`, `vocabulary`, `grammar`, and `tests`
fields are unchanged.

### 2.4 Asset fallbacks

- **Cover image missing** → render a placeholder card showing the
  story title, level badge, and `cover_image_prompt` as styled
  text-on-gradient. Do not show a broken-image icon.
- **Background image missing** → flat color background per level
  (A1 = warm cream, A2 = soft sage, B1 = dusk blue, B2 = deep
  plum, or similar). Pick once, document the palette.
- **Audio missing** → fall back to on-device TTS in
  `target_language_code`. Per-sentence fallback uses sentence
  text; full narration falls back to concatenated TTS;
  `atmosphere_intro` falls back to TTS in English. The app should
  cache TTS output locally so it is generated once per device per
  story.

The asset detection happens at book-load time, not per-screen.
Cache the result.

---

## 3. Library Tab

### 3.1 Top-level

The library tab shows one card per book (one per language). Card
contents:

- Cover image (`book.json` could reference one, or use the first
  story's cover as fallback)
- Title and teaser
- Level badge: "A1 → B2 journey" or current progress
- Action button: **Start** (no progress yet) or **Continue**
  (progress exists) — Continue resumes whatever the learner was
  last doing across any phase.

A persistent **Review** button sits below the card; see §6.

### 3.2 Inside a book (story selector)

Tapping into a book shows:

- **Resume bar** at top: "Continue: Story 3 — Sentence walk" or
  similar. One tap returns the learner to exactly where they
  stopped.
- **Story tiles** in curriculum order. Tile states:
  - **Locked** — grey, no cover, shows title and 1-line tease
    (the next story's teaser is visible; stories beyond that are
    fully hidden, or shown as "?")
  - **Unlocked, not started** — full cover, "Start" button, expand
    to read full English synopsis + "you'll learn ~N new words and
    M grammar rules"
  - **First-read in progress** — cover with progress ring, "Continue"
  - **Drill flow in progress** — cover with progress ring labeled
    by drill number, "Continue"
  - **Drill flow complete (free practice unlocked)** — cover with
    a small "✓" badge, taps into the practice hub (§6)

### 3.3 Name-selection screen

Triggered the first time a learner taps **Start** on a book.
Full-screen, background image is the book's `background.jpg`.

- Heading: "Choose your protagonist's name."
- Dropdown of `suggested_protagonist_names`.
- Custom input field (validated against `protagonist_gender` —
  reject incompatible names with a friendly message; the
  validation list can be a small bundled lookup, no need for a
  service).
- Default selection is `default_protagonist`.
- Confirmation locks the choice for this book on this device. A
  setting in the book's options screen allows changing it later
  with a warning ("this resets in-progress story state").

After confirmation, the app substitutes `{{PROTAGONIST}}` (per
story spec §5.1) at render time everywhere it appears.

---

## 4. First-read Flow

Single linear flow, six fixed steps, no skipping. Resumable mid-flow
if the app is closed: store `current_step` and `current_substep`
locally per story.

### Step 1 — Atmosphere listen

1. Cover image fills the screen.
2. `atmosphere_intro` plays as English audio (~30s). No text on
   screen during this. A subtle waveform or breathing animation is
   fine.
3. The full Italian narration plays. **Italian subtitles display
   synced to the audio**, sentence-by-sentence highlight as each
   plays. An English-translation toggle sits in a corner, off by
   default; tapping it shows the English gloss for the currently
   playing sentence.
4. When narration ends, a soft message: *"Don't worry if you
   didn't grasp it all — you'll go through this sentence by
   sentence next."* "Continue" button.

### Step 2 — Grammar preview

1. List of the 1–3 new grammar rules introduced by this story.
2. Each rule: short name, 1-paragraph plain-English explanation,
   2–3 example sentences (in Italian with English translation).
   Examples drawn from the story where possible.
3. No quiz here. This is preview, not test. "Continue" at the
   bottom.

### Step 3 — Sentence walk

1. One sentence at a time. Card shows Italian sentence, English
   translation, audio-play button.
2. Auto-play audio on card show, optional.
3. User advances by tapping "Next" or swiping. Backward navigation
   allowed.
4. Vocabulary words newly introduced in this story are visually
   marked (underline, dotted underline, or color tint) so the
   learner notices them in context. Tapping the marked word shows
   a small popover with the word's translation.
5. Progress indicator: "12 / 64".

### Step 4 — Vocab walk

1. The new-vocabulary list for this story. One word at a time.
2. Card shows: Italian word, translation, part of speech, audio,
   and the first sentence from the story where the word appears
   (with the word highlighted).
3. User advances by tapping "Next" or swiping.
4. No testing here. Passive exposure.

### Step 5 — Closing listen

1. Cover image fills the screen.
2. Full Italian narration plays again — **no subtitles, no
   English**. The point is the learner realizes they understand
   it.
3. When narration ends: *"You've finished your first read. Come
   back tomorrow to start practicing."* "Done" button completes
   the first-read phase.

### Step 6 — Drill flow unlocks

State transition: story moves to drill flow. Next time the learner
opens the app, the resume bar reads *"Continue: Story N — Vocab
recognition (drill 1)"*.

---

## 5. Drill Flow

Six drills, fixed order, gated. The learner does roughly one
drill per session, ~10 min each, across multiple days. The app
always tells the learner what the next drill is — they do not pick.

### Drill ordering

1. **Vocab recognition** — Italian → English
2. **Vocab production** — English → Italian (typed)
3. **Sentence assembly** — word-tile reconstruction
4. **Dictation** — listen → type Italian
5. **Rule spotting** — find rule instances in story sentences
6. **Transfer test** — novel sentences using the story's grammar;
   gates the next story

**(v2)** A self-graded speak-aloud drill where the learner hears
an English sentence, speaks the Italian aloud, then taps to
reveal the answer and rates themselves (right / close / wrong).
Skip in v1.

### Drill 1 — Vocab recognition

Card-based. Shows Italian word, learner taps to reveal translation,
self-rates (Again / Hard / Good / Easy — standard SRS buttons).
Cards drawn from this story's new vocab only. Drill is "complete"
when every card has reached a minimum SRS interval defined in §7.
Likely takes 2–3 sessions over 2–3 days.

### Drill 2 — Vocab production

Same word set, harder direction. Shows English, learner types
Italian. Submission is **forgiving on diacritics, apostrophes, and
spacing, strict on letters and word order**. Specifically:

- Strip diacritics from both expected and submitted before compare:
  `è/é → e`, `à → a`, `ò → o`, `ù → u`, `ì → i`
- Strip apostrophes from both before compare
- Collapse whitespace
- Compare lowercased

If the answer is correct after normalization but the learner
omitted a diacritic or apostrophe, show a soft "Correct! Note:
spelled *è*, not *e*" message — accept the answer but flag the
spelling.

Drill complete when every word has been answered correctly twice
in a row. Words answered wrong return to the front of the queue.

### Drill 3 — Sentence assembly

Duolingo-style word-tile reconstruction. For each sentence in the
story:

- **A1, A2, early B1**: present the full sentence as scrambled
  tiles.
- **Later B1 (long sentences) and B2**: split at clause boundaries
  (`,`, `e`, `ma`, `che`, `perché`, `quando`, `mentre`, `se`,
  `dopo che`, `prima che` — extend list as needed). The learner
  assembles each clause separately. Sub-progress within sentence.

Tiles include 2–3 distractors per sentence drawn from the story's
own vocabulary (so the learner can't brute-force by elimination
on tile count alone).

Drill complete when every sentence has been assembled correctly
on a first attempt. Sentences failed on first attempt return to
the queue.

### Drill 4 — Dictation

For each sentence in the story:

- Sentence audio plays (per-sentence file from
  `audio/sNN_sentences/NNN.mp3`, fallback to TTS).
- Learner types Italian.
- Submission normalization same as drill 2: forgiving on
  diacritics, apostrophes, spacing. Strict on letters and word
  order.
- Replay button always available; no penalty for replay.

Drill complete when every sentence has been entered correctly
once.

### Drill 5 — Rule spotting

For each new grammar rule introduced by this story:

- Show the rule's name and explanation (same as first-read step 2).
- Display every sentence in the story where the rule appears
  (these can be tagged in the story JSON's grammar field, or
  derived if the rule has a clean syntactic marker — verify how
  the existing schema represents this before implementing).
- For each such sentence, ask the learner to tap the
  rule-relevant token(s) — e.g. tap the verb, tap the article,
  tap the past participle.

Drill complete when every rule's sentences have been correctly
tagged.

### Drill 6 — Transfer test

Pulls from the story's `tests` field. Per the story spec, tests
are distributed across tiers 1–3.

- Tier 1 only is the gate. The learner must hit the mastery
  threshold (§7) on tier 1 to unlock the next story.
- Tiers 2 and 3 remain available in free practice (§6) for ongoing
  refinement but do not gate progression.

When tier 1 mastery is met, the next story unlocks and a
celebration screen plays. Story moves to free practice state.

---

## 6. Free Practice

Tile grid, accessed by tapping a completed story's tile in the
library. Available tiles:

- **Listen** — full Italian narration, with subtitle toggle
  (off / Italian / Italian + English)
- **Sentence cards** — same set as first-read, shuffled or
  in-order, user choice
- **Vocab cards** — SRS-driven by default (system surfaces due
  cards from this story); manual browse mode also available
- **Sentence assembly** — same as drill 3, freely repeatable
- **Dictation** — same as drill 4, freely repeatable
- **Rule spotting** — same as drill 5, freely repeatable
- **Transfer test** — full tier 1, 2, 3 access; progress shown
  per tier

Each tile shows a small progress indicator where one applies
("32/45 vocab mastered", "tier 2: 4/12 attempts").

### 6.1 Global Review (library-level)

The **Review** button on the library home aggregates SRS-due cards
across all stories whose drill flow is complete, plus tier 1
transfer test items from those stories. Mixed queue. This is the
daily-touchpoint feature; a learner who's mid-way through story 4
should see story 1 and story 2 vocab resurface here naturally as
SRS schedules dictate.

Review session length is bounded — propose a default of 15 min or
20 cards, whichever first, with a setting to adjust.

---

## 7. Mastery & SRS Parameters

These numbers tune the gating. They are tunable post-launch and
should live in a single config file the app reads, not hardcoded
in screens.

### 7.1 SRS intervals

Standard SM-2-style scheduling is fine. Minimum interval to count
a card as "mastered for drill purposes": **3 successful reviews
with intervals reaching ≥3 days**. This is the gate for drill 1
completion.

### 7.2 Transfer test threshold (drill 6 / §1.2 gate)

The story spec §6 says ≥80% on tier 1 over ≥20 attempts. That
threshold can be too punishing on stories with few rules.

**Adjusted rule for v1:** ≥80% over `max(15, 7 × rules_introduced)`
attempts. So a story introducing 1 rule needs ≥80% over 15
attempts; a story introducing 3 rules needs ≥80% over 21
attempts. Document this in the config so it can be revisited
once real learner data exists.

### 7.3 Soft override

No "skip ahead" button in v1. If learners get stuck, that is data;
add an override only after seeing the actual stuck-rate.

---

## 8. State & Persistence

Local-first. The app should work fully offline once a book bundle
is downloaded (TTS fallback excepted, where on-device TTS is
required).

Per-device state to persist:

- Per-book: chosen protagonist name, current story, current phase,
  current step/drill within phase
- Per-story: completion status of each first-read step and each
  drill, per-card SRS state, per-test attempt log
- Global: Review queue state, settings

A simple JSON-on-disk store keyed by book id is fine. No server
sync required for v1.

**(v2: cloud sync, multi-device.)**

---

## 9. What Claude Code Should Build

This list is roughly in implementation order. Each item should be
verified against the existing repo before changes — the schema
and any existing screen scaffolding take precedence.

1. Verify and document the existing story JSON schema. Create a
   schema-validation script if none exists. The new fields in §2.3
   are additive; confirm they don't collide.
2. Implement the book bundle loader: read `book.json`, build the
   story-id ordering, detect asset presence per §2.4, set up TTS
   fallback wiring.
3. Library tab per §3.1 and §3.2, including locked/unlocked tile
   states.
4. Name-selection screen per §3.3 and the `{{PROTAGONIST}}`
   substitution layer at render time.
5. First-read flow, all six steps, per §4. The atmosphere listen
   (step 1) and closing listen (step 5) are the most
   distinctive — verify the audio sync and the subtitle toggle
   behave correctly.
6. Drill flow, drills 1 through 6, per §5. The submission
   normalization in drills 2 and 4 should live in a single shared
   utility.
7. Free practice hub per §6, including the global Review button
   and its aggregation logic.
8. Mastery parameters per §7 in a config file.
9. State persistence per §8.

Items not in v1: speak-aloud drill, cloud sync, multi-device,
soft skip-ahead.

---

## 10. Self-check before declaring v1 complete

- [ ] A learner who has never opened the app can tap into the
      Italian book, choose a name, complete story 1's first-read,
      complete story 1's drill flow over multiple sessions, and
      see story 2 unlock — without any app crash, broken asset, or
      stuck screen
- [ ] Closing the app mid-first-read and reopening resumes at the
      correct step
- [ ] Closing the app mid-drill and reopening resumes at the
      correct drill and card position
- [ ] Story 1 with all assets present looks the way §4 step 1 and
      §5 describe
- [ ] Story 1 with cover image and audio deliberately removed
      still works end-to-end via fallbacks
- [ ] `{{PROTAGONIST}}` never leaks into rendered text anywhere
- [ ] Review button surfaces story 1 vocab cards on day 3 after
      completion
