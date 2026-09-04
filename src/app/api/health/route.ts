import { db, hasDatabase } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (hasDatabase && db) {
      await db.execute(sql`select 1`);
    }
    return Response.json({ ok: true, storage: hasDatabase ? "postgres" : "file" });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
