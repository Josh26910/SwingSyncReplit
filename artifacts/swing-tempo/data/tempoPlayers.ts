export type ShotCategory = "tee" | "approach" | "shortgame" | "putting";

export interface PlayerTempo {
  id: string;
  name: string;
  event: string;
  year: number;
  club: string;
  category: ShotCategory;
  ratio: number;
  duration: number;    // start to impact, seconds
  backswing: number;   // seconds
  downswing: number;   // seconds
  result?: string;
}

export const CATEGORY_LABELS: Record<ShotCategory, string> = {
  tee:        "Off the Tee",
  approach:   "Approach",
  shortgame:  "Short Game",
  putting:    "Putting",
};

export const TEMPO_PLAYERS: PlayerTempo[] = [
  // ── OFF THE TEE ──────────────────────────────────────────────────────────────
  {
    id: "tiger-tee",
    name: "Tiger Woods",
    event: "U.S. Open",
    year: 2000,
    club: "Driver",
    category: "tee",
    ratio: 3.17,
    duration: 0.96,
    backswing: 0.72,
    downswing: 0.24,
    result: "Won by 15",
  },
  {
    id: "fred-tee",
    name: "Fred Couples",
    event: "The Masters",
    year: 1992,
    club: "Driver",
    category: "tee",
    ratio: 2.75,
    duration: 1.20,
    backswing: 0.88,
    downswing: 0.32,
    result: "Won by 2",
  },
  {
    id: "rory-tee",
    name: "Rory McIlroy",
    event: "PGA Championship",
    year: 2014,
    club: "Driver",
    category: "tee",
    ratio: 3.00,
    duration: 0.84,
    backswing: 0.63,
    downswing: 0.21,
    result: "Won by 1",
  },
  {
    id: "jordan-tee",
    name: "Jordan Spieth",
    event: "British Open",
    year: 2017,
    club: "Driver",
    category: "tee",
    ratio: 2.80,
    duration: 0.95,
    backswing: 0.70,
    downswing: 0.25,
    result: "Won by 3",
  },

  // ── APPROACH ────────────────────────────────────────────────────────────────
  {
    id: "tiger-approach",
    name: "Tiger Woods",
    event: "WGC Bridgestone",
    year: 2001,
    club: "7-Iron",
    category: "approach",
    ratio: 2.91,
    duration: 0.98,
    backswing: 0.73,
    downswing: 0.25,
    result: "Won by 7",
  },
  {
    id: "fred-approach",
    name: "Fred Couples",
    event: "Doral Open",
    year: 1992,
    club: "7-Iron",
    category: "approach",
    ratio: 2.60,
    duration: 1.10,
    backswing: 0.79,
    downswing: 0.31,
    result: "Won by 1",
  },
  {
    id: "rory-approach",
    name: "Rory McIlroy",
    event: "Ryder Cup",
    year: 2014,
    club: "7-Iron",
    category: "approach",
    ratio: 2.80,
    duration: 0.88,
    backswing: 0.65,
    downswing: 0.23,
  },
  {
    id: "jordan-approach",
    name: "Jordan Spieth",
    event: "The Masters",
    year: 2015,
    club: "7-Iron",
    category: "approach",
    ratio: 2.50,
    duration: 0.90,
    backswing: 0.64,
    downswing: 0.26,
    result: "Won by 1",
  },

  // ── SHORT GAME ──────────────────────────────────────────────────────────────
  {
    id: "tiger-short",
    name: "Tiger Woods",
    event: "Johnny Walker Classic",
    year: 2000,
    club: "Pitch",
    category: "shortgame",
    ratio: 1.84,
    duration: 0.91,
    backswing: 0.59,
    downswing: 0.32,
    result: "Won by 3",
  },
  {
    id: "jordan-short",
    name: "Jordan Spieth",
    event: "Travelers Championship",
    year: 2017,
    club: "Wedge",
    category: "shortgame",
    ratio: 2.04,
    duration: 0.85,
    backswing: 0.57,
    downswing: 0.28,
    result: "Won by 2",
  },
  {
    id: "fred-short",
    name: "Fred Couples",
    event: "The Masters",
    year: 1992,
    club: "Wedge",
    category: "shortgame",
    ratio: 2.15,
    duration: 0.82,
    backswing: 0.55,
    downswing: 0.27,
    result: "Won by 2",
  },
  {
    id: "rory-short",
    name: "Rory McIlroy",
    event: "U.S. Open",
    year: 2014,
    club: "Wedge",
    category: "shortgame",
    ratio: 2.20,
    duration: 0.78,
    backswing: 0.52,
    downswing: 0.26,
    result: "Won by 8",
  },

  // ── PUTTING ────────────────────────────────────────────────────────────────
  {
    id: "tiger-putt",
    name: "Tiger Woods",
    event: "The Masters",
    year: 2005,
    club: "Putter",
    category: "putting",
    ratio: 1.50,
    duration: 1.20,
    backswing: 0.72,
    downswing: 0.48,
    result: "Won by 1",
  },
  {
    id: "jordan-putt",
    name: "Jordan Spieth",
    event: "The Masters",
    year: 2015,
    club: "Putter",
    category: "putting",
    ratio: 1.65,
    duration: 1.10,
    backswing: 0.68,
    downswing: 0.42,
    result: "Won by 1",
  },
  {
    id: "fred-putt",
    name: "Fred Couples",
    event: "TPC Sawgrass",
    year: 1995,
    club: "Putter",
    category: "putting",
    ratio: 1.40,
    duration: 1.35,
    backswing: 0.79,
    downswing: 0.56,
  },
  {
    id: "rory-putt",
    name: "Rory McIlroy",
    event: "Ryder Cup",
    year: 2016,
    club: "Putter",
    category: "putting",
    ratio: 1.55,
    duration: 1.15,
    backswing: 0.71,
    downswing: 0.44,
  },
];

export function getPlayersByCategory(cat: ShotCategory): PlayerTempo[] {
  return TEMPO_PLAYERS.filter((p) => p.category === cat);
}
