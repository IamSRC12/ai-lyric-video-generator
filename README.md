# LyricForge Studio

AI auto-synced lyric video generator. Drop a mix and a lyric sheet, review word-level timing on a deterministic canvas, export a 720p/1080p MP4 from the same `drawFrame` path.

## Stack

Next.js 16 App Router · React 19 · TypeScript 5.9 · Drizzle + PostgreSQL (JSON file fallback) · Groq Whisper + Llama · Canvas 2D + WebCodecs · Vitest

## Setup

```bash
pnpm install
cp .env.example .env
# set DATABASE_URL and optionally GROQ_API_KEY
pnpm db:push
pnpm dev
pnpm test
```

npm equivalents: `npm install`, `npx drizzle-kit push`, `npm run dev`, `npm test`.

Open http://localhost:3000. Validate a Groq key (or continue in demo/heuristic mode), upload mp3/wav, paste lyrics, Analyze & Generate.

## Architecture

| Decision | Choice |
| --- | --- |
| Times | Float seconds everywhere; frames/ms only at display/encode |
| Sync | Stage B FFT anchors > Whisper words > syllable interpolation |
| Alignment | Banded Needleman–Wunsch, affine gaps, lyric gaps expensive |
| Render | Pure `drawFrame(ctx, project, timeSec, assets)` — preview ≡ export |
| Clock | AudioContext currentTime, never accumulated rAF deltas |
| Key storage | Server session/DB only — never in the project document |
| Persistence | Postgres via Drizzle; `data/db.json` if `DATABASE_URL` is absent |
| Export | WebCodecs + mp4-muxer primary; FFmpeg ASS burn-in fallback |

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play / pause |
| J / K / L | Back / pause / forward |
| I / O | Mark in / out (numeric fields) |
| S / M | Split / merge |
| Home / End | Start / end |
| [ / ] | Previous / next caption |
| Arrows / Shift+Arrows | Nudge 1 / 10 frames |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| ? | Shortcut overlay |

## Manual check

1. Paste a 4-minute MP3 + lyric sheet, Analyze. Lines should land on vocals (±120 ms target).
2. Drag a flagged out-point in Ripple mode — downstream gaps stay exact.
3. Apply the 7clouds preset. Export 1080p60. Play the MP4; A/V should not drift.

## Known limitations

- Split-clip FFT anchoring is implemented in `@/dsp` and wired through Stage B; the wizard mapping table is stored client-side and the prototype currently skips clip upload on the analyze POST unless you extend the form.
- Lottie is bundled (`public/lottie/pulse.json`) and composited when a frame is supplied; the studio does not yet expose a full overlay picker.
- FFmpeg fallback burns ASS over a solid field — real, but not the full canvas look.
- Custom font upload registers for preview when the browser supports `FontFace`; metrics can still diverge for variable fonts.
- Groq model IDs are resolved at runtime from `/models` with documented fallbacks.
