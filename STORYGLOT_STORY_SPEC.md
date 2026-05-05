# Storyglot — Story Generation Spec

This document is the brief for any chat involved in building Storyglot
content. Read it in full before producing anything. It is
language-agnostic — Italian is used for examples, but the same rules
apply to German, Portuguese, or any future target language.

The companion document is the **series bible** for whichever language
is being built (e.g. `STORYGLOT_ITALIAN_BIBLE.md`). The spec governs
*how* a story is built; the bible governs *what story* is being built.
The spec wins on form (length, vocab budget, schema). The bible wins
on content (character, plot, tone). The two should not actually
conflict.

---

## 1. What Storyglot Is

Storyglot is a story-based language-learning app. A learner reads
stories in the target language, drills the new vocabulary via SRS
flashcards, and takes grammar transfer tests. Each story is a JSON
file uploaded to the app. A learner moves up one CEFR level
(A1 → A2 → B1 → B2) by completing the full sequence of stories for
that level.

Source of truth for the app structure is the repo:
`https://github.com/lukajr11/storyglot`. The canonical story schema
lives in `story-1.json` and `example-italian-story.json`. This spec
governs *what content* goes inside that schema — not the schema
itself. If schema fields are unclear, defer to the example files in
the repo. Do not invent fields the schema doesn't have.

---

## 2. Curriculum Model

### 2.1 The story is the source of truth

Storyglot's vocab and grammar curriculum are derived from the stories,
not imposed on them. We build the series outline first, identify every
content word the stories actually need, layer in a floor list of
universal high-frequency vocabulary, then assign each word to a CEFR
level and to a specific story within that level. Frequency lists are a
sanity-check input to that assignment — not the source of truth.

This inverts the older approach where a frequency-derived vocab list
was the gate, and stories had to bend around it. That approach
produced curriculum holes (a lake-village protagonist whose vocab pool
doesn't include "lake") and forced awkward content choices. The
story-first approach produces a curriculum that fits the narrative the
learner is actually reading, while the floor list (§2.5) ensures
universal high-frequency words still get coverage even when the plot
doesn't naturally surface them.

### 2.2 Per-level budget (targets, not caps)

Total new-word target across the full series: **~3,200 words**, soft
target, refined during the outline phase. Distribution across levels:

| Level | New words | New grammar rules |
|-------|-----------|-------------------|
| A1    | ~500      | ~15–18            |
| A2    | ~700      | ~16–20            |
| B1    | ~900      | ~18–22            |
| B2    | ~1100     | ~18–24            |

The grammar rule list per level lives in
`<language>_grammar_roadmap.md` and is the authoritative source for
what grammar is introduced at each level.

### 2.3 Per-story budget

Per-story budgets scale with level. Higher-level stories are longer
not because they cram more new vocabulary, but because the learner
can sustain longer narrative — most of the added length is recycling
and texture.

| Level | Sentences (target) | New words / story | Recycled words (min.) |
|-------|--------------------|-------------------|------------------------|
| A1    | 60–80              | ~60–80            | grows from 0 → 250+    |
| A2    | 80–100             | ~70–90            | A1 + earlier A2        |
| B1    | 100–120            | ~80–100           | all earlier            |
| B2    | 120–150            | ~80–110           | all earlier            |

New-word density per sentence drops as the learner advances. **Never
push 100+ new words at a learner in a single story regardless of
level.** Comfort matters more than throughput.

Each story also introduces ~1–3 new grammar rules and recycles every
prior rule in the level at least once.

**Within-level workload consistency.** Stories within a single level
should be roughly comparable in workload — sentence count and
new-word count within ±20% of the level's target. This is a hard
constraint, not a soft one. The mastery gate (§6) implicitly assumes
a stable per-story workload; uneven stories make the learner's pace
feel jerky even when the content is good. If a story's outline beat
genuinely needs more space, prefer splitting it into two stories.

### 2.4 Sequencing constraint (hard rule)

> Story N may only use vocabulary and grammar assigned to story N or
> any earlier story in the curriculum.

"Earlier" includes earlier stories in the current level *and* every
story in every prior level. Word X assigned to A2 story 3 cannot
appear in any A1 story. Word X assigned to B1 story 5 cannot appear
in B1 stories 1–4 or in any A1/A2 story.

If a story needs a word that isn't yet assigned, two options: (a)
re-assign that word to an earlier story, or (b) rewrite the story to
not need it. Never just use it.

Proper nouns (character names, place names — Bianca, Varenna, Milano,
Roma) and internationalisms ("pizza", "computer", "taxi") are
exempt from the assignment system. Use them sparingly and never as
filler.

### 2.5 Floor list (universal high-frequency vocab)

Even with story-derived vocab, certain words are essential to any
adult speaker of the target language regardless of plot. Every
learner needs them. For Italian A1 these include: *fratello, sorella,
lunedì–domenica, gennaio–dicembre, settimana, mese, occhio, mano,
piede, freddo, caldo, acqua, pane, latte*, basic numbers, basic
colors. A protagonist who's an only child still needs to learn
*fratello*; a story with no morning scene still needs *colazione*.

**The floor list mechanism:**

1. Each level has a curated **floor list** of must-include words —
   roughly 150–200 words for A1, smaller at each subsequent level
   (the learner already has the basics by A2). Total across all four
   levels: ~600–800 entries.
2. The floor list is curated separately, against a real CEFR-aligned
   reference (e.g. *Vocabolario di base* / Crusca for Italian, or the
   word list of an established A1–B2 textbook series). It is not
   improvised.
3. The floor list is merged into the story-derived word list before
   tier assignment.
4. During the outline phase, each floor-list word is assigned to a
   specific story where it can be slotted naturally — even minor
   mentions count. *"Sofia ha un fratello piccolo"* is enough for
   *fratello*; a teacher saying *"lunedì abbiamo l'esame"* is enough
   for *lunedì*.
5. If a floor-list word genuinely doesn't fit any story, the editor
   adds a short sentence to the closest story to make it fit. The
   story-first principle is preserved; the floor list is a thin
   safety net beneath it, not a competing master.

### 2.6 The vocab JSON

After outline, extraction, floor-list merge, tier assignment, and
story-batch assignment, the final authoritative vocab artifact is a
single file: `<language>_vocab.json`. Schema (one record per word):

```json
{
  "word": "lago",
  "translation": "lake",
  "pos": "noun",
  "level": "A1",
  "story": "it-a1-s01",
  "season": 1,
  "story_order": 1,
  "source": "story-derived",
  "notes": "opening pier scene; recurring across S1 and S4"
}
```

`source` is one of `"story-derived"` or `"floor-list"`.

Every word in the series appears in this file exactly once. The story
JSON references this vocab JSON by `word`. This file replaces the
older per-level frequency lists (`italian_A1.json`, `italian_A2.json`,
etc.) as the authoritative source. Older per-level files can stay in
the repo as reference material but are no longer canonical.

---

## 3. Process: Outline-First

The order of work for a new language is fixed:

1. **Bible.** The narrative series bible is finalized — characters,
   setting, season arcs, mystery, tone rules. This is creative work,
   not curricular work.
2. **Grammar roadmap.** The level-by-level grammar rule list
   (`<language>_grammar_roadmap.md`) is built and reviewed.
3. **Outline.** The full series outline is written: every story
   across all seasons gets its plot beats, character moves, mystery
   breadcrumbs, and tonal targets specified to a level where every
   target-language content word the story will need can be
   identified. Single document, e.g.
   `STORYGLOT_<LANGUAGE>_OUTLINE.md`. This is the biggest single
   piece of writing in the project — break it into seasons, do one
   season per chat. Each later-season outline chat reads earlier
   season outlines + the bible + the spec.
4. **Vocab extraction.** Parse the outline; produce a candidate word
   list (~3,000 words for the full series).
5. **Floor list curation.** Build the floor list from a CEFR-aligned
   reference (per §2.5), separately from the outline-derived list.
6. **Floor-list merge.** Distribute each floor-list word to a
   natural-fit story in the outline. Adjust outline lightly where a
   word doesn't fit anywhere.
7. **Tier assignment.** Assign each word in the merged list to A1 /
   A2 / B1 / B2, based on (a) the story of first appearance and
   (b) intrinsic difficulty in real target-language usage. Use a
   frequency reference as sanity check, not as a gate.
8. **Story-batch assignment.** Within each level, assign each new
   word to the specific story it's introduced in. Result:
   `<language>_vocab.json` per §2.6.
9. **Grammar-batch assignment.** Same exercise for grammar rules:
   each rule from the roadmap is assigned to a specific story.
10. **Story drafting.** Only now write the JSON for Story 1, then
    Story 2, etc., in order. Each story-generation chat reads the
    bible, the spec, the outline, the vocab JSON, the grammar
    roadmap, and the previously-written stories.

**Implication.** Story 1 ships later under this process than under
an "make it up as we go" approach. Every story after it ships faster
and is more coherent because the path is laid.

**Season counts are flexible.** The outline phase decides how many
stories each season needs — driven by what the narrative and the
vocab progression actually require, not by a clean grid. Likely
ranges:

- A1: 8 stories (small CEFR band, tight childhood beats)
- A2: 8–10 stories (transition years)
- B1: 10–14 stories (the longest CEFR band; the most material to
  carry — career arc, romance arc, mystery investigation all live
  here)
- B2: 8–12 stories (resolution and return)

Total series length is whatever the outline determines — likely
36–44 stories rather than a uniform 32. Per-story workload stays
consistent within each level (§2.3) even when story counts differ
between levels.

---

## 4. Story Content Rules

### 4.1 The plot rule

A story is a *story*, not a phrasebook. "My name is Max. I am 25. I
have a brother." is unacceptable, even at A1. Every story must have:

- a protagonist with a clear motivation
- a small problem or change that drives the narrative forward
- a resolution (which can be partial — see §8 on hooks)

The story's vocab toolkit is what the writer is *allowed* to use. The
plot is independent and should be genuinely interesting at the
learner's level. Aim for the tone of a children's chapter book at A1,
a YA novel at A2, a literary novel at B1–B2 — small in scope, but
with stakes and feeling.

### 4.2 New-word introduction

Every newly introduced word should appear **at least 3 times** in the
story, ideally in slightly different contexts. This is what makes the
word stick before SRS takes over. If a word can't be naturally
repeated 3 times, it probably doesn't fit this story; flag it during
drafting so the assignment can be reviewed.

### 4.3 Sentence complexity

- A1 stories: short sentences, mostly 5–10 words, one clause each.
  Occasional simple compound with "e" or "ma."
- A2 stories: occasional two-clause sentences with *e, ma, perché*.
  Mostly under 12 words.
- B1 stories: subordinate clauses allowed once the relevant grammar
  rule has been introduced. Mostly under 15 words.
- B2 stories: full range of subordination, including registers
  approaching literary prose. Sentence length flexible.

Never introduce a syntactic structure (relative clauses, conditional,
subjunctive, etc.) unless the grammar roadmap says it's allowed by
this story.

### 4.4 Grammar focus

Each story has a declared **primary grammar focus** — the 1–3 rules
it introduces — and a **secondary focus** — rules it reinforces from
prior stories. The sentences should *visibly demonstrate* the
primary focus. If a story introduces the present perfect, present
perfect should appear in roughly 30–40% of the verbs in that story,
not once at the end.

### 4.5 Cultural texture

Stories should feel like they take place in a country where the
target language is actually spoken. Use real place names (Roma,
Bologna, Trastevere; Berlin, Hamburg; Lisbon, Porto), real foods,
real cultural beats. Avoid generic "European city" mush. Avoid
stereotypes.

### 4.6 What to avoid

- CV recitals ("I am X, I am Y years old, I have Z")
- Exercises disguised as stories ("Maria goes to the supermarket. She
  buys bread. She buys milk. She buys cheese.")
- Anachronisms relative to the story's setting (don't use "smartphone"
  in a story set in 1995 even if the word is available)
- Politically charged content, real public figures, anything that
  would be inappropriate for a general adult learner
- Content unsuitable for minors — Storyglot is a general-audience app

---

## 5. Story JSON Output

The output of any story-generation task is a single JSON file
matching the schema in `story-1.json` from the repo. **Defer to the
canonical schema.** Do not add fields it doesn't have. If the schema
doesn't include a field this spec mentions, the schema wins and the
spec needs updating.

Likely top-level fields (verify against the canonical example):

- `type` — `"story"`
- `id` — stable identifier, e.g. `it-a1-s01`
- `languageId` — matches the language JSON, e.g. `"italian"`
- `level` — `"A1"`, `"A2"`, etc.
- `order` — 1..N, position within the level
- `title` — in the target language
- `synopsis` — short English description for the library screen,
  ~2 sentences. Forward-compatible: a future app build will use this
  as the teaser preview shown on a locked-but-visible library entry.
- `sentences` — array of sentence objects
- `vocabulary` — list of words newly introduced in this story
- `grammar` — the rules introduced and reinforced
- `tests` — grammar transfer tests, distributed across tiers 1–3 in
  line with the story's grammar focus

Always validate against an example file before delivering. If a
field is unclear, ask before guessing. Do not write fields the schema
doesn't have.

### 5.1 Protagonist name token

The app supports user-customizable protagonist names. To make stories
work for any user-chosen name, **every reference to the protagonist's
first name in the story JSON must use the literal token
`{{PROTAGONIST}}`**, in both the target-language text and the English
translation. The app substitutes this token at render time with
either the user's chosen name or the series default (e.g. "Bianca"
for the Italian series, set in the language JSON).

Rules for the writer:

1. Use `{{PROTAGONIST}}` everywhere the protagonist's first name
   appears. Both target text and English gloss get the token.
2. Do **not** put a definite article in front of the token (no
   *la {{PROTAGONIST}}*). Use the bare name. Some northern Italian
   dialects use the article colloquially, but it breaks substitution.
3. Other characters' names (Nonna Elsa, Sofia, Marco, etc.) are
   **hardcoded** — they're not customizable. Only the protagonist.
4. Avoid diminutives of the protagonist's name in MVP stories
   (no *Biancuccia*, *Bianchetta*) — they don't survive substitution.
   If a story genuinely needs a nickname later, use a second token
   `{{PROTAGONIST_NICKNAME}}` and flag it.
5. The protagonist's grammatical gender is **fixed** for the series
   (feminine for the current Italian series). The writer assumes
   any substituted name will match — adjectives, past participles,
   articles, and possessives are all written assuming that gender.
   The app's name-input UI is responsible for restricting input to
   matching names; not the writer's concern.

---

## 6. Mastery & Progression (context for the writer)

The app gates story N+1 behind mastery of story N. Mastery means:

- vocab cards for that story have all reached a minimum SRS interval
- tier 1 grammar tests have been answered ≥80% correct on first
  attempt across at least 20 attempts (tier 2 and 3 gate further
  internally)

The writer doesn't need to manage this — but it explains why each
story must be **self-sufficient** (the learner will spend days or
weeks on it before moving on) and why **vocab repetition within a
story matters so much** (3+ exposures inside the story, then SRS
takes over).

It also explains the §2.3 within-level workload-consistency rule:
the mastery gate produces an even pace only if stories produce an
even cognitive load.

---

## 7. Adding a New Language

To extend Storyglot to a new language, follow the §3 process in
order:

1. Write the bible.
2. Write the grammar roadmap.
3. Write the series outline (per season, in chats).
4. Extract candidate vocab from the outline.
5. Curate the floor list against a CEFR-aligned reference.
6. Merge floor list into the outline.
7. Tier-assign words to A1–B2.
8. Story-batch-assign words within each level.
9. Grammar-batch-assign rules within each level.
10. Draft stories in order.

The curriculum model in §2 is universal, including the floor-list
mechanism (§2.5) — every language has its own universal-frequency
words a story-derived list will miss.

The narrative architecture (genre, season counts, character archetypes)
should be adapted to the target language's culture. A German bible
might foreground different rhythms; a Japanese bible might require
different age-of-protagonist choices for register reasons. The bible
is the place to make those calls; the spec is not.

---

## 8. Hooks (how each story should end)

Every story (not just season finales) should end on a small forward
pull. Options, in rough order of intensity:

- **Image hook** — close on a sensory image that lingers. Most
  stories end like this.
- **Question hook** — a small unanswered question.
- **Decision hook** — the protagonist decides something at the end.
  The consequences fall in the next story.
- **Cliffhanger** — reserve for mid-season and season-finale stories.
  Not for every story, or it gets exhausting.

The reader of a Storyglot story will spend days mastering it before
they unlock the next one. The hook has to survive being walked away
from. Aim for the feeling of *I wonder what happens to her now*, not
*what plot twist is coming*.

---

## 9. Working Brief for a Story-Generation Chat

When starting a new chat to generate a specific story, paste this
spec at the top, paste the relevant bible, and add a brief like:

> Generate Italian A1 story 3.
>
> Series position: Season 1, Story 3 of [N]. (See bible §4.1.)
> Protagonist's age in this story: ~10.
> Setting: Varenna, Lake Como. (See bible §3.)
> Threads to advance: drama 70%, mystery 20%, romance 10%.
> Continuity: [what state previous stories left things in].
> Hook type: image / question / decision / cliffhanger.
>
> Vocabulary assigned to this story: [paste list from
> `italian_vocab.json` filtered by `story: "it-a1-s03"`].
> Grammar rules introduced this story: [paste from roadmap].
> Recycled grammar: [list of prior rule IDs].
>
> Output: full story JSON matching the repo schema.

The chat should produce the JSON, ready to upload via
**Settings → Stories → Add New Story**.

---

## 10. Quality Bar

Before delivering a story, the writer should self-check:

- [ ] Sequencing rule respected — no words used outside the story's
      own assignment + earlier stories' assignments
- [ ] Each new word appears ≥3 times in genuinely different contexts
- [ ] Primary grammar focus visible in 30%+ of relevant sentences
- [ ] Plot has motivation, problem, resolution
- [ ] No CV-recital sentences
- [ ] Sentence count within level target; new-word count within ±20%
      of the level's target (workload consistency, §2.3)
- [ ] JSON validates against the canonical repo schema; no invented
      fields
- [ ] `{{PROTAGONIST}}` token used everywhere the protagonist is
      named (§5.1)
- [ ] No definite article before `{{PROTAGONIST}}`, no diminutives
- [ ] Tone matches the bible's content rules
- [ ] Cultural texture is real-target-language, not generic

If any check fails, fix before delivery.
