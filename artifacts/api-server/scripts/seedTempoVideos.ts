// One-time migration: copies the old static TEMPO_PLAYERS array (client-side
// artifacts/swing-tempo/data/tempoPlayers.ts) into the tempo_videos table, so
// the Tempos tab can move from bundled data to the admin-editable database
// without losing the ~40 hand-curated entries already in the app. Every row
// starts with youtubeId = null; attach real clips later via the admin screen
// or a PATCH /tempo-videos/:id call as they're sourced/uploaded.
//
// Run once: pnpm --filter @workspace/api-server run seed:tempo-videos
// Guarded by a single up-front count check (not per-row, since several
// legitimate entries share a player's name across categories/years) — if the
// table already has any rows, it aborts instead of risking duplicates.

import { db, tempoVideosTable } from "@workspace/db";

import { TEMPO_PLAYERS } from "../../swing-tempo/data/tempoPlayers";

async function main() {
  const existing = await db.query.tempoVideosTable.findFirst();
  if (existing) {
    console.log("tempo_videos already has rows — aborting to avoid duplicates.");
    process.exit(0);
  }

  await db.insert(tempoVideosTable).values(
    TEMPO_PLAYERS.map((player) => ({
      category: player.category,
      name: player.name,
      event: player.event,
      year: player.year,
      club: player.club,
      ratio: player.ratio,
      duration: player.duration,
      backswing: player.backswing,
      downswing: player.downswing,
      result: player.result ?? null,
      youtubeId: null,
      clipStartSec: null,
      clipEndSec: null,
      sortOrder: 0,
    })),
  );

  console.log(`Seeded tempo_videos: ${TEMPO_PLAYERS.length} rows inserted.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
