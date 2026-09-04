import Link from "next/link";
import { Wizard } from "@/components/wizard";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src="/images/mark.png" alt="" className="h-9 w-9 rounded-lg" />
          <div>
            <p className="text-sm font-semibold tracking-wide">LyricForge</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">Studio v0.1</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/5 bg-[#121620] px-3.5 py-1.5 text-xs text-[var(--accent)]">
          <span>AI Lyric Generator</span>
        </div>
      </header>
      <section className="relative overflow-hidden px-4 pb-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <img src="/images/hero.jpg" alt="" className="h-[420px] w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg)]" />
        </div>
        <div className="relative mx-auto max-w-6xl pt-10">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">Auto-synced lyric videos</p>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[1.05] md:text-6xl">
            Drop a mix. Paste the sheet. Export karaoke that actually lands.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
            Whisper word timestamps, FFT clip anchors, and Needleman–Wunsch alignment feed a deterministic canvas renderer — preview and 1080p60 WebCodecs export share one drawFrame.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <Wizard />
      </section>
    </main>
  );
}
