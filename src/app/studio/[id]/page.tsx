import { StudioApp } from "@/components/studio/studio-app";
import { defaultProject, migrate } from "@/schema";
import { getProject } from "@/db/repository";
import { createId } from "@/lib/ids";
import { heuristicSync, parseLyrics } from "@/align-engine";

export const dynamic = "force-dynamic";

const DEMO_LYRICS = `## title: Midnight Atlas
## artist: Northline
[Verse 1]
City lights fold over the river
I keep your name in the back of my throat
Every red signal feels like a letter
I never found the courage to post

[Chorus]
If the night is a map then I'm lost on purpose
Pin every heartbeat to a borrowed sky
Say it slower so the dark can rehearse us
We only glow when we almost arrive
`;

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getProject(id);

  let project;
  if (existing) {
    project = migrate(existing);
  } else {
    // Only compute demo lyrics when no saved project exists
    const parsed = parseLyrics(DEMO_LYRICS);
    const demo = heuristicSync(parsed.lines, 36);
    project = defaultProject({
      id: id === "demo" ? "demo" : id || createId("proj"),
      meta: {
        title: parsed.title ?? "Midnight Atlas",
        artist: parsed.artist ?? "Northline",
        durationSec: 36,
        fps: 30,
        resolution: "1920x1080",
        aspectRatio: "16:9",
        language: "en",
      },
      captions: demo.captions,
    });
  }

  return <StudioApp initial={project} />;
}
