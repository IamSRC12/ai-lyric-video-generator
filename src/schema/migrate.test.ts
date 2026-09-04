import { describe, expect, it } from "vitest";
import { defaultProject, migrate, migrateV0ToV1 } from "./index";

describe("document migration", () => {
  it("promotes v0 to v1 as a no-op besides the version bump", () => {
    const v0 = { ...defaultProject({ id: "p1" }), version: 0 };
    const bumped = migrateV0ToV1(v0) as { version: number; id: string };
    expect(bumped.version).toBe(1);
    expect(bumped.id).toBe("p1");
    const doc = migrate(v0);
    expect(doc.version).toBe(1);
    expect(doc.id).toBe("p1");
  });
});
