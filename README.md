# Storyglot — Story-Based Language Learning

Single-file HTML app for the "story mastery" method.

## What It Does

Story-based language learning with SM-2 spaced repetition, grammar transfer
tests with tier progression, and multi-language support. Designed to run
fully offline once loaded — your progress lives in browser localStorage and
can be exported as a JSON backup at any time.

## Features

- **Library** — pick a story, see your mastery progress
- **Read** — Full Text mode with sentence-by-sentence highlighted TTS, or
  Sentence-by-Sentence mode with grammar notes inline
- **Cards** — spaced repetition with two interaction modes:
  - **Type** — translate English to German, four-grade SM-2 (Again/Hard/Good/Easy)
  - **Speak** — say it aloud, flip to verify, mark Right or Wrong (or swipe)
- **Test** — grammar transfer tests organized in three tiers; Tier 2 unlocks
  after ≥20 first-attempt answers at ≥80% on Tier 1, and so on for Tier 3
- **Multi-language** — each language has its own NFT/crypto theme; uploading
  a new language swaps the gradient, glow, and accent palette
- **Test packs** — extra tests can be uploaded to expand any story's pool
  without modifying the original story file
- **Backup** — export your full state as JSON, import to restore on any device
- **PWA** — Add to Home Screen on iPad for fullscreen install with custom icon

## Setup on iPad

1. Open the hosted URL (GitHub Pages, Netlify, or any static host)
2. Tap **Share → Add to Home Screen**
3. Optional: download a better German voice in
   **Settings → Accessibility → Spoken Content → Voices → German → Anna (Premium)**
4. (Optional) In the app: **Settings → Study Preferences → TTS voice**, pick
   the premium voice you just downloaded

## Setup on Mac/Desktop

Open `index.html` in any modern browser (Safari, Chrome, Firefox).

## Daily Use

- **Library** — pick a story, see mastery and due counts; toggle the
  **📈 Progress** panel for streak, sparkline, and vocab count
- **Read** — study sentences with audio; switch between Full Text and
  Sentence-by-Sentence depending on whether you want flow or focus
- **Cards** — spaced repetition (Type or Speak mode)
- **Test** — grammar transfer tests with tier progression

## Adding New Content

### New Story

1. Ask Claude (or any LLM):
   > Generate Story 2 — A2 level, perfect tense focus, JSON format matching
   > the schema in story-1.json. ~50 sentences, 5-7 grammar rules across
   > tiers 1-3, 10-14 grammar tests.
2. Save the resulting JSON
3. **Settings → Stories → Add New Story → pick file**

### New Test Pack

A test pack adds tests to an existing story's pool without touching the
story itself. Schema includes `type: "test-pack"`, `languageId`, `storyId`.

**Settings → Stories → Add Test Pack → pick file**

### New Language

A language JSON registers a new ID, name, flag, TTS code, and theme palette.
Once installed, you can upload stories targeting that language.

**Settings → Languages → Add New Language → upload language JSON**

See `example-italian-language.json` and `example-italian-story.json` in this
folder for templates.

## Backup

**Settings → Backup → Export Backup** weekly. Save the JSON to iCloud Drive,
Dropbox, GitHub, or wherever you trust.

Recovery: **Settings → Backup → Import Backup** — pick the JSON. The app
validates the schema, asks you to confirm, then replaces all data.

A banner reminds you to back up if it's been more than 14 days.

## Storage

Progress lives in browser `localStorage` under the key `germanApp.v1`.
Backups are JSON files identical to in-memory state.

(Cloud sync via Firebase planned for Chunk 3b.)

## Reset

**Settings → Reset → Reset all data**. You'll be asked to type **RESET** to
confirm. Wipes everything on this device, including uploaded languages and
stories. Built-in German + Story 1 reseeds on next load.

## Schema

Currently version 2. Future updates run migrations automatically on load —
older backups are upgraded silently. Backups from a *newer* version of the
app are rejected with a clear error.

## Built With

Vanilla HTML / CSS / JS in a single file. No dependencies, no build step,
no CDN beyond Google Fonts. Designed for iPad Safari first; works on any
modern browser.

## File Layout

- `index.html` — the entire app
- `story-1.json` — canonical example story schema (also embedded in the app)
- `example-italian-language.json` — example language JSON for testing uploads
- `example-italian-story.json` — short example story for testing uploads
- `README.md` — this file
