import { and, eq } from "drizzle-orm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { migrate, type AsrResult, type Project } from "@/schema";
import { createId } from "@/lib/ids";
import { db, hasDatabase } from "./index";
import { asrCache, assets, jobs, projects, sessions } from "./schema";

export interface StoredAsset {
  id: string;
  projectId: string;
  kind: string;
  filename: string;
  mime: string;
  sha256: string | null;
  path: string;
  durationSec: number | null;
  meta: unknown;
}

export interface StoredJob {
  id: string;
  projectId: string;
  type: string;
  status: string;
  progress: number;
  stage: string;
  error: string | null;
  result: unknown;
}

export interface StoredSession {
  id: string;
  groqKey: string | null;
  persist: string;
  expiresAt: string;
}

interface FileDb {
  projects: Array<{ id: string; document: Project; updatedAt: string; createdAt: string }>;
  assets: StoredAsset[];
  jobs: StoredJob[];
  asrCache: Array<{ audioSha256: string; modelId: string; language: string; result: AsrResult }>;
  sessions: StoredSession[];
}

const FILE_PATH = path.join(process.cwd(), "data", "db.json");

async function readFileDb(): Promise<FileDb> {
  try {
    const raw = await readFile(FILE_PATH, "utf8");
    return JSON.parse(raw) as FileDb;
  } catch {
    return { projects: [], assets: [], jobs: [], asrCache: [], sessions: [] };
  }
}

async function writeFileDb(data: FileDb): Promise<void> {
  try {
    await mkdir(path.dirname(FILE_PATH), { recursive: true });
    await writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write to local file DB:", err);
  }
}

export async function listProjects(): Promise<Project[]> {
  if (hasDatabase && db) {
    try {
      const rows = await db.select().from(projects);
      return rows.map((r) => migrate(r.document));
    } catch (err) {
      console.warn("Database query failed in listProjects, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  return file.projects.map((p) => migrate(p.document));
}

export async function getProject(id: string): Promise<Project | null> {
  if (hasDatabase && db) {
    try {
      const rows = await db.select().from(projects).where(eq(projects.id, id));
      const row = rows[0];
      return row ? migrate(row.document) : null;
    } catch (err) {
      console.warn("Database query failed in getProject, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  const row = file.projects.find((p) => p.id === id);
  return row ? migrate(row.document) : null;
}

export async function saveProject(project: Project): Promise<Project> {
  const next = { ...project, updatedAt: new Date().toISOString() };
  if (hasDatabase && db) {
    try {
      const existing = await db.select().from(projects).where(eq(projects.id, next.id));
      if (existing[0]) {
        await db
          .update(projects)
          .set({
            title: next.meta.title,
            artist: next.meta.artist,
            version: next.version,
            document: next,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, next.id));
      } else {
        await db.insert(projects).values({
          id: next.id,
          version: next.version,
          title: next.meta.title,
          artist: next.meta.artist,
          document: next,
        });
      }
      return next;
    } catch (err) {
      console.warn("Database query failed in saveProject, falling back to file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  const idx = file.projects.findIndex((p) => p.id === next.id);
  const rec = { id: next.id, document: next, createdAt: next.createdAt, updatedAt: next.updatedAt };
  if (idx >= 0) file.projects[idx] = rec;
  else file.projects.push(rec);
  await writeFileDb(file);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  if (hasDatabase && db) {
    try {
      await db.delete(projects).where(eq(projects.id, id));
      return;
    } catch (err) {
      console.warn("Database query failed in deleteProject, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  file.projects = file.projects.filter((p) => p.id !== id);
  await writeFileDb(file);
}

export async function saveAsset(asset: StoredAsset): Promise<StoredAsset> {
  if (hasDatabase && db) {
    try {
      await db.insert(assets).values({
        id: asset.id,
        projectId: asset.projectId,
        kind: asset.kind,
        filename: asset.filename,
        mime: asset.mime,
        sha256: asset.sha256,
        path: asset.path,
        durationSec: asset.durationSec,
        meta: asset.meta,
      });
      return asset;
    } catch (err) {
      console.warn("Database query failed in saveAsset, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  file.assets.push(asset);
  await writeFileDb(file);
  return asset;
}

export async function getAsset(id: string): Promise<StoredAsset | null> {
  if (hasDatabase && db) {
    try {
      const rows = await db.select().from(assets).where(eq(assets.id, id));
      const row = rows[0];
      if (row) {
        return {
          id: row.id,
          projectId: row.projectId,
          kind: row.kind,
          filename: row.filename,
          mime: row.mime,
          sha256: row.sha256,
          path: row.path,
          durationSec: row.durationSec,
          meta: row.meta,
        };
      }
    } catch (err) {
      console.warn("Database query failed in getAsset, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  return file.assets.find((a) => a.id === id) ?? null;
}

export async function getAsrCache(sha: string, modelId: string, language: string): Promise<AsrResult | null> {
  if (hasDatabase && db) {
    try {
      const rows = await db
        .select()
        .from(asrCache)
        .where(and(eq(asrCache.audioSha256, sha), eq(asrCache.modelId, modelId), eq(asrCache.language, language)));
      return (rows[0]?.result as AsrResult | undefined) ?? null;
    } catch (err) {
      console.warn("Database query failed in getAsrCache, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  return file.asrCache.find((c) => c.audioSha256 === sha && c.modelId === modelId && c.language === language)?.result ?? null;
}

export async function putAsrCache(sha: string, modelId: string, language: string, result: AsrResult): Promise<void> {
  if (hasDatabase && db) {
    try {
      await db.insert(asrCache).values({
        id: createId("asr"),
        audioSha256: sha,
        modelId,
        language,
        result,
      });
      return;
    } catch (err) {
      console.warn("Database query failed in putAsrCache, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  file.asrCache.push({ audioSha256: sha, modelId, language, result });
  await writeFileDb(file);
}

export async function saveJob(job: StoredJob): Promise<void> {
  if (hasDatabase && db) {
    try {
      const existing = await db.select().from(jobs).where(eq(jobs.id, job.id));
      if (existing[0]) {
        await db
          .update(jobs)
          .set({
            status: job.status,
            progress: job.progress,
            stage: job.stage,
            error: job.error,
            result: job.result,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, job.id));
      } else {
        await db.insert(jobs).values(job);
      }
      return;
    } catch (err) {
      console.warn("Database query failed in saveJob, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  const idx = file.jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) file.jobs[idx] = job;
  else file.jobs.push(job);
  await writeFileDb(file);
}

export async function upsertSession(session: StoredSession): Promise<void> {
  if (hasDatabase && db) {
    try {
      const existing = await db.select().from(sessions).where(eq(sessions.id, session.id));
      if (existing[0]) {
        await db
          .update(sessions)
          .set({
            groqKey: session.groqKey,
            persist: session.persist,
            expiresAt: new Date(session.expiresAt),
          })
          .where(eq(sessions.id, session.id));
      } else {
        await db.insert(sessions).values({
          id: session.id,
          groqKey: session.groqKey,
          persist: session.persist,
          expiresAt: new Date(session.expiresAt),
        });
      }
      return;
    } catch (err) {
      console.warn("Database query failed in upsertSession, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  const idx = file.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) file.sessions[idx] = session;
  else file.sessions.push(session);
  await writeFileDb(file);
}

export async function getSession(id: string): Promise<StoredSession | null> {
  if (hasDatabase && db) {
    try {
      const rows = await db.select().from(sessions).where(eq(sessions.id, id));
      const row = rows[0];
      if (row) {
        return {
          id: row.id,
          groqKey: row.groqKey,
          persist: row.persist,
          expiresAt: row.expiresAt.toISOString(),
        };
      }
    } catch (err) {
      console.warn("Database query failed in getSession, using file storage:", (err as Error).message);
    }
  }
  const file = await readFileDb();
  return file.sessions.find((s) => s.id === id) ?? null;
}

export function storageMode(): "postgres" | "file" {
  return hasDatabase ? "postgres" : "file";
}
