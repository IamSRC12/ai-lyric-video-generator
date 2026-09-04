import { NextResponse } from "next/server";
import { realignSingleLine, distributeWordsInLine } from "@/align-engine";
import type { LineTiming, WordTiming } from "@/schema";
import { createId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RefineRequestBody {
  lines?: Array<{
    id?: string;
    text: string;
    start: number;
    end: number;
    startSec?: number;
    endSec?: number;
    words?: Array<{ text: string; start?: number; end?: number }>;
  }>;
  line?: {
    id?: string;
    text: string;
    start: number;
    end: number;
    startSec?: number;
    endSec?: number;
  };
  audioSignal?: number[];
  sampleRate?: number;
}

export async function POST(req: Request) {
  try {
    const body: RefineRequestBody = await req.json();
    const sampleRate = body.sampleRate ?? 44100;
    const signal = body.audioSignal ? new Float32Array(body.audioSignal) : undefined;

    // Single line refine mode
    if (body.line) {
      const line = body.line;
      const start = line.start ?? line.startSec ?? 0;
      const end = line.end ?? line.endSec ?? (start + 2);
      const refinedWords = realignSingleLine(line.text, start, end, [], signal, sampleRate);
      
      const refinedLine: LineTiming = {
        id: line.id ?? createId("cap"),
        text: line.text,
        start,
        end,
        startSec: start,
        endSec: end,
        words: refinedWords,
        confidence: refinedWords.length > 0
          ? refinedWords.reduce((s, w) => s + w.confidence, 0) / refinedWords.length
          : 0.5,
      };

      return NextResponse.json({ ok: true, line: refinedLine });
    }

    // Multi-line refine mode
    const lines = body.lines ?? [];
    const refinedLines: LineTiming[] = lines.map((line, idx) => {
      const start = line.start ?? line.startSec ?? 0;
      const end = line.end ?? line.endSec ?? (start + 2);
      const refinedWords = realignSingleLine(line.text, start, end, [], signal, sampleRate);

      return {
        id: line.id ?? createId("cap"),
        text: line.text,
        start,
        end,
        startSec: start,
        endSec: end,
        words: refinedWords,
        confidence: refinedWords.length > 0
          ? refinedWords.reduce((s, w) => s + w.confidence, 0) / refinedWords.length
          : 0.5,
        index: idx,
      };
    });

    return NextResponse.json({ ok: true, lines: refinedLines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refine failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
