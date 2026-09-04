import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBuffer } from "music-metadata";
import { createId } from "@/lib/ids";
import { sha256Hex } from "@/lib/ids";
import { saveAsset } from "@/db/repository";
import { messageFor } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/flac",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/x-m4a",
  "image/jpeg",
  "image/png",
  "image/webp",
  "font/ttf",
  "font/otf",
  "font/woff2",
  "application/octet-stream",
]);

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "unassigned");
  const kind = String(form.get("kind") ?? "audio");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > 80 * 1024 * 1024) {
    return Response.json({ error: messageFor("oversized_upload") }, { status: 413 });
  }
  if (file.type && !ALLOWED.has(file.type) && !file.name.match(/\.(mp3|wav|flac|m4a|aac|ogg|jpg|jpeg|png|webp|ttf|otf|woff2)$/i)) {
    return Response.json({ error: messageFor("unsupported_codec") }, { status: 415 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const sha = await sha256Hex(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const id = createId("ast");
  const ext = path.extname(file.name) || ".bin";
  const rel = path.join("data", "uploads", `${id}${ext}`);
  await mkdir(path.dirname(path.join(process.cwd(), rel)), { recursive: true });
  await writeFile(path.join(process.cwd(), rel), buf);

  let durationSec: number | null = null;
  let meta: unknown = { originalName: file.name, size: file.size };
  if (kind === "audio") {
    try {
      const parsed = await parseBuffer(buf, { mimeType: file.type, size: buf.length });
      durationSec = parsed.format.duration ?? null;
      meta = {
        originalName: file.name,
        size: file.size,
        codec: parsed.format.codec,
        container: parsed.format.container,
        sampleRate: parsed.format.sampleRate,
        bitrate: parsed.format.bitrate,
        numberOfChannels: parsed.format.numberOfChannels,
        title: parsed.common.title,
        artist: parsed.common.artist,
      };
    } catch {
      return Response.json({ error: messageFor("corrupt_audio") }, { status: 422 });
    }
  }

  const asset = await saveAsset({
    id,
    projectId,
    kind,
    filename: file.name,
    mime: file.type || "application/octet-stream",
    sha256: sha,
    path: rel,
    durationSec,
    meta,
  });
  return Response.json({ asset });
}
