#!/usr/bin/env python3
"""
Generate per-sentence narration MP3s for a Storyglot story using
edge-tts (the same neural voices Microsoft Edge's "Read Aloud" uses).

Output layout matches what the app expects:
    audio/{langId}/{storyId}/sentences/NNN.mp3   (1-indexed, 3-digit)

Usage:
    pip install -r scripts/requirements.txt
    python3 scripts/gen_audio.py it-a1-s01.json
    python3 scripts/gen_audio.py it-a1-s01.json --voice it-IT-DiegoNeural
    python3 scripts/gen_audio.py it-a1-s01.json --rate=-10%
    python3 scripts/gen_audio.py it-a1-s01.json --force   # re-render existing

List available Italian voices:
    python3 scripts/gen_audio.py --list it
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("Missing dependency. Run: pip install -r scripts/requirements.txt")

# Mirrors LANGUAGE_ID_ALIASES in js/data.js so paths line up with the app.
LANG_ALIASES = {
    "italian": "it", "german": "de", "english": "en", "french": "fr",
    "spanish": "es", "portuguese": "pt", "japanese": "ja",
    "chinese": "zh", "russian": "ru",
}

DEFAULT_VOICE_BY_LANG = {
    # Emma is multilingual but reads Italian fluently with a younger
    # timbre than the native it-IT voices. Pass --voice to override.
    "it": "en-US-EmmaMultilingualNeural",
    "de": "de-DE-KatjaNeural",
    "fr": "fr-FR-DeniseNeural",
    "es": "es-ES-ElviraNeural",
    "en": "en-US-JennyNeural",
}


def sentence_text(s):
    return s.get("targetText") or s.get("de") or s.get("text") or ""


def normalize_lang(raw):
    if not raw:
        return None
    low = str(raw).lower()
    return LANG_ALIASES.get(low, low)


async def synth_one(text, voice, rate, out_path):
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(str(out_path))


async def list_voices(lang_filter):
    voices = await edge_tts.list_voices()
    if lang_filter:
        prefix = lang_filter.lower() + "-"
        voices = [v for v in voices if v["Locale"].lower().startswith(prefix)]
    voices.sort(key=lambda v: (v["Locale"], v["ShortName"]))
    for v in voices:
        print(f"  {v['ShortName']:<35} {v['Gender']:<6} {v['Locale']}")


DEFAULT_ENGLISH_VOICE = "en-US-EmmaMultilingualNeural"


async def run(story_path, voice, english_voice, rate, force, protagonist, atmosphere_only):
    story = json.loads(Path(story_path).read_text(encoding="utf-8"))
    lang = normalize_lang(story.get("languageId"))
    sid = story.get("id")
    sentences = story.get("sentences") or []
    if not lang or not sid or not sentences:
        sys.exit(f"Bad story JSON: need languageId, id, sentences. Got {lang=}, {sid=}, {len(sentences)} sentences.")

    voice = voice or DEFAULT_VOICE_BY_LANG.get(lang)
    if not voice:
        sys.exit(f"No default voice for language '{lang}'. Pass --voice.")
    english_voice = english_voice or DEFAULT_ENGLISH_VOICE

    # The story uses {{PROTAGONIST}} placeholders the app substitutes
    # at render time. Audio is baked once — pick a name and stick with it.
    protagonist = protagonist or story.get("defaultProtagonist") or "Bianca"

    repo_root = Path(__file__).resolve().parent.parent
    story_dir = repo_root / "audio" / lang / sid
    out_dir = story_dir / "sentences"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Story:        {sid} ({lang})  {len(sentences)} sentences")
    print(f"Voice (lang): {voice}   rate={rate or '+0%'}")
    print(f"Voice (en):   {english_voice}   (atmosphere intro)")
    print(f"Protagonist:  {protagonist}")
    print(f"Output:       audio/{lang}/{sid}/")
    print()

    # Atmosphere intro — story.synopsis or _atmosphereIntro, read in English.
    atmosphere_text = (story.get("_atmosphereIntro") or story.get("synopsis") or "").strip()
    atmosphere_text = atmosphere_text.replace("{{PROTAGONIST}}", protagonist)
    atmosphere_path = story_dir / "atmosphere.mp3"
    if atmosphere_text:
        if atmosphere_path.exists() and not force:
            print(f"  atmosphere  skip (exists)")
        else:
            try:
                await synth_one(atmosphere_text, english_voice, rate or "+0%", atmosphere_path)
                size_kb = atmosphere_path.stat().st_size / 1024
                print(f"  atmosphere  ok ({size_kb:.0f} KB)  {atmosphere_text[:60]}…")
            except Exception as e:
                print(f"  atmosphere  FAIL: {e}")
    else:
        print(f"  atmosphere  skip (no synopsis/_atmosphereIntro field)")
    print()

    if atmosphere_only:
        print("Atmosphere only — skipping per-sentence render.")
        return

    rendered = skipped = failed = 0
    for s in sentences:
        order = int(s.get("order") or 0)
        text = sentence_text(s).strip().replace("{{PROTAGONIST}}", protagonist)
        if not order or not text:
            continue
        out_path = out_dir / f"{order:03d}.mp3"
        if out_path.exists() and not force:
            print(f"  {order:03d}  skip (exists)")
            skipped += 1
            continue
        try:
            await synth_one(text, voice, rate or "+0%", out_path)
            size_kb = out_path.stat().st_size / 1024
            print(f"  {order:03d}  ok ({size_kb:.0f} KB)  {text[:50]}")
            rendered += 1
        except Exception as e:
            print(f"  {order:03d}  FAIL: {e}")
            failed += 1

    print()
    print(f"Done. rendered={rendered} skipped={skipped} failed={failed}")
    if failed:
        sys.exit(1)


async def run_protagonist_variants(story_path, voice, rate, force, names):
    story = json.loads(Path(story_path).read_text(encoding="utf-8"))
    lang = normalize_lang(story.get("languageId"))
    sid = story.get("id")
    sentences = story.get("sentences") or []
    if not lang or not sid or not sentences:
        sys.exit("Bad story JSON.")
    voice = voice or DEFAULT_VOICE_BY_LANG.get(lang)
    if not voice:
        sys.exit(f"No default voice for language '{lang}'. Pass --voice.")

    # Only render sentences that mention {{PROTAGONIST}} — the others
    # sound identical for every name and live in the canonical folder.
    affected = [s for s in sentences if "{{PROTAGONIST}}" in sentence_text(s)]
    if not affected:
        print("No sentences contain {{PROTAGONIST}} — nothing to vary.")
        return

    repo_root = Path(__file__).resolve().parent.parent
    base = repo_root / "audio" / lang / sid / "sentences" / "_proto"

    print(f"Story:        {sid} ({lang})")
    print(f"Voice:        {voice}   rate={rate or '+0%'}")
    print(f"Affected:     {len(affected)} sentences with {{{{PROTAGONIST}}}}")
    print(f"Names:        {', '.join(names)}")
    print(f"Output:       audio/{lang}/{sid}/sentences/_proto/<Name>/")
    print()

    total_rendered = total_skipped = total_failed = 0
    for name in names:
        out_dir = base / name
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"[{name}]")
        for s in affected:
            order = int(s.get("order") or 0)
            text = sentence_text(s).strip().replace("{{PROTAGONIST}}", name)
            if not order or not text:
                continue
            out_path = out_dir / f"{order:03d}.mp3"
            if out_path.exists() and not force:
                print(f"  {order:03d}  skip (exists)")
                total_skipped += 1
                continue
            try:
                await synth_one(text, voice, rate or "+0%", out_path)
                kb = out_path.stat().st_size / 1024
                print(f"  {order:03d}  ok ({kb:.0f} KB)  {text[:50]}")
                total_rendered += 1
            except Exception as e:
                print(f"  {order:03d}  FAIL: {e}")
                total_failed += 1
        print()

    print(f"Done. rendered={total_rendered} skipped={total_skipped} failed={total_failed}")
    if total_failed:
        sys.exit(1)


def main():
    p = argparse.ArgumentParser(description="Generate narration MP3s for a Storyglot story.")
    p.add_argument("story", nargs="?", help="Path to the story JSON")
    p.add_argument("--voice", help="Edge TTS voice for the story language (default: per-language)")
    p.add_argument("--english-voice", help=f"Voice for the English atmosphere intro (default: {DEFAULT_ENGLISH_VOICE})")
    p.add_argument("--rate", help="Speech rate, e.g. -10%% or +0%% (default +0%%)")
    p.add_argument("--force", action="store_true", help="Re-render even if file exists")
    p.add_argument("--protagonist", help="Name to substitute for {{PROTAGONIST}} (defaults to story's defaultProtagonist or 'Bianca')")
    p.add_argument("--atmosphere-only", action="store_true", help="Only render atmosphere.mp3, skip the 80 sentence files")
    p.add_argument("--protagonists", help="Comma-separated names. For each name, render only the sentences containing {{PROTAGONIST}} into sentences/_proto/<Name>/. Skips the canonical render.")
    p.add_argument("--list", metavar="LANG", help="List voices for a language code (e.g. it, de) and exit")
    args = p.parse_args()

    if args.list:
        asyncio.run(list_voices(args.list))
        return
    if not args.story:
        p.error("story JSON path is required (or pass --list LANG)")
    if args.protagonists:
        names = [n.strip() for n in args.protagonists.split(",") if n.strip()]
        asyncio.run(run_protagonist_variants(args.story, args.voice, args.rate, args.force, names))
        return
    asyncio.run(run(args.story, args.voice, args.english_voice, args.rate, args.force, args.protagonist, args.atmosphere_only))


if __name__ == "__main__":
    main()
