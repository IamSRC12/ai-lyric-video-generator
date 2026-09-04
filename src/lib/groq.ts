import Groq from "groq-sdk";
import { AsrResultSchema, LlmTiebreakSchema, type AsrResult, type LlmTiebreak } from "@/schema";
import { StudioError } from "./errors";

const ASR_CANDIDATES = ["whisper-large-v3-turbo", "whisper-large-v3", "distil-whisper-large-v3-en"];
const LLM_CANDIDATES = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant"];

export interface GroqModel {
  id: string;
}

export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new StudioError("invalid_api_key", "Groq rejected the API key.");
  }
  if (!res.ok) throw new StudioError("generic", `Could not list Groq models (${res.status}).`);
  const json = (await res.json()) as { data?: GroqModel[] };
  return (json.data ?? []).map((m) => m.id);
}

export function pickModel(available: string[], candidates: string[]): string {
  for (const id of candidates) {
    if (available.includes(id)) return id;
  }
  return candidates[0]!;
}

export async function validateKey(apiKey: string): Promise<{ ok: true; models: string[]; asr: string; llm: string }> {
  const models = await listModels(apiKey);
  return {
    ok: true,
    models,
    asr: pickModel(models, ASR_CANDIDATES),
    llm: pickModel(models, LLM_CANDIDATES),
  };
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 0;
      if (status !== 429 && status < 500) throw err;
      const wait = Math.min(8000, 400 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last instanceof Error ? last : new Error("Groq request failed");
}

export async function transcribeAudio(input: {
  apiKey: string;
  file: File | Blob;
  filename: string;
  language: string;
  prompt: string;
  model: string;
}): Promise<AsrResult> {
  const client = new Groq({ apiKey: input.apiKey });
  const file = input.file instanceof File ? input.file : new File([input.file], input.filename);
  const raw = await withBackoff(() =>
    client.audio.transcriptions.create({
      file,
      model: input.model,
      language: input.language,
      temperature: 0,
      prompt: input.prompt.slice(0, 800),
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    }),
  );
  const parsed = AsrResultSchema.safeParse(raw);
  if (!parsed.success) {
    const loose = raw as { text?: string; words?: unknown; segments?: unknown };
    return AsrResultSchema.parse({
      text: loose.text ?? "",
      words: Array.isArray(loose.words) ? loose.words : [],
      segments: Array.isArray(loose.segments) ? loose.segments : [],
    });
  }
  return parsed.data;
}

export async function llmTiebreak(input: {
  apiKey: string;
  model: string;
  payload: unknown;
}): Promise<LlmTiebreak | null> {
  const client = new Groq({ apiKey: input.apiKey });
  try {
    const res = await withBackoff(() =>
      client.chat.completions.create({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You map lyric line indices to ASR segment indices. Return JSON {\"map\":[{\"lyricIndex\":0,\"segmentIndex\":0}]}. Only include genuinely ambiguous lines. Indices must be monotonic.",
          },
          { role: "user", content: JSON.stringify(input.payload) },
        ],
      }),
    );
    const text = res.choices[0]?.message?.content ?? "";
    const json = JSON.parse(text) as unknown;
    const parsed = LlmTiebreakSchema.safeParse(json);
    if (!parsed.success) return null;
    let last = -1;
    for (const row of parsed.data.map) {
      if (row.lyricIndex <= last) return null;
      last = row.lyricIndex;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export interface AiAlignedLine {
  lineIndex: number;
  startSec: number;
  endSec: number;
  confidence: number;
  matchedText?: string;
}

export interface DeepAiAlignResult {
  alignedLines: AiAlignedLine[];
  instrumentalBreaks?: { startSec: number; endSec: number; label?: string }[];
}

export async function deepAiAlignLyrics(input: {
  apiKey: string;
  model: string;
  lines: { index: number; text: string; section?: string }[];
  asrSegments: { index: number; start: number; end: number; text: string }[];
  durationSec: number;
}): Promise<DeepAiAlignResult | null> {
  const client = new Groq({ apiKey: input.apiKey });
  const systemPrompt = `You are an expert audio-to-lyric synchronization and song structure alignment AI.
Your task is to accurately map each lyric line to its exact heard time interval [startSec, endSec] in the audio based on the ASR speech transcript segments.

Rules:
1. Every lyric line sung in the audio must be mapped with its real [startSec, endSec] timestamps.
2. Timestamps must be strictly non-decreasing (monotonic). Line N+1 cannot start before Line N starts.
3. If an instrumental intro exists (e.g. 0s to 18s), the first lyric line MUST start when singing actually begins, NOT at 0s!
4. If an instrumental solo, break, or interlude occurs between verses/choruses, the next lyric line must start after the break ends.
5. If a line is repeated in the lyrics (e.g. chorus), match it to the corresponding audio timestamp where that repetition occurs.
6. A single line should have a realistic singing duration (typically 1.5s to 6.0s depending on line length). NEVER crush multiple lines into a single second.
7. Output strictly valid JSON conforming to:
{
  "alignedLines": [
    {
      "lineIndex": 0,
      "startSec": 15.2,
      "endSec": 18.5,
      "confidence": 0.95,
      "matchedText": "heard words"
    }
  ],
  "instrumentalBreaks": [
    { "startSec": 0, "endSec": 15.2, "label": "Intro" }
  ]
}`;

  const userPrompt = JSON.stringify({
    totalDurationSec: input.durationSec,
    lyricLines: input.lines,
    heardAudioSegments: input.asrSegments,
  });

  try {
    const res = await withBackoff(() =>
      client.chat.completions.create({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    );
    const text = res.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text) as DeepAiAlignResult;
    if (!parsed || !Array.isArray(parsed.alignedLines) || parsed.alignedLines.length === 0) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("Deep AI alignment call failed:", err);
    return null;
  }
}
