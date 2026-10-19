/**
 * The wire shapes of the counter worker's v1 read endpoints (/api/v1/meta, /api/v1/teams,
 * /api/v1/species/:id), the contract pick3 reads. They are written down again rather than
 * imported from workers/counter: no client depends on that workspace, and a format written on
 * both sides is the contract. They must match workers/counter/src/meta.ts exactly. Types only;
 * the fetchers live with the app that makes the requests.
 */

/** Which populations a ranking blends: everything, PvPoke's list alone, the ladder, or
 *  tournaments. */
export type SourceKey = 'all' | 'prior' | 'ladder' | 'tournament';

export interface SpeciesStats {
  speciesId: string;
  sightings: number;
  wins: number;
  losses: number;
  runs: number;
  runWins: number;
  runLosses: number;
}
export interface MovesetStats {
  fast: string;
  charged: string[];
  battles: number;
}
export interface TeamStats {
  species: [string, string, string];
  battles: number;
  wins: number;
  losses: number;
  moves: (MovesetStats | null)[];
}
export interface TournamentSpeciesStat {
  speciesId: string;
  picks: number;
  game1Picks: number;
  wins: number;
  losses: number;
  unresolvedForms: number;
}
export interface TournamentBlock {
  events: number;
  battles: number;
  eventsOther: number;
  species: TournamentSpeciesStat[];
}
export interface RosterMovesetStats {
  fast: string;
  charged: string[];
  entries: number;
}
export interface SpeciesTournamentBlock {
  picks: number;
  game1Picks: number;
  wins: number;
  losses: number;
  byDepth: number[];
  unresolvedForms: number;
  broughtBy: number;
  rosterSize: number;
  pickedOnStream: number;
  movesets: RosterMovesetStats[];
  movesetsKnown: number;
}
export interface MetaSummaryV1 {
  league: string;
  since: string;
  until: string;
  source: string;
  battles: number;
  tanked: number;
  devices: number;
  bands: Record<string, number>;
  /** Counted battles by source. One key today; nothing reads it yet. */
  sources: Record<string, number>;
  species: SpeciesStats[];
  /**
   * @deprecated Run teams only, and capped at 50. The whole team board, run and faced, cores and
   * complete teams, is /api/v1/teams. Left in place and unchanged rather than altered under a
   * consumer; nothing new should read it.
   */
  teams: TeamStats[];
  previous: { battles: number; species: { speciesId: string; sightings: number }[] } | null;
  tournament: TournamentBlock | null;
  generatedAt: string;
}
export interface TeamRowV1 {
  species: string[];
  kind: 'core' | 'team';
  runBattles: number;
  runWins: number;
  runLosses: number;
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  moves: (MovesetStats | null)[];
  thirds: { speciesId: string; sightings: number }[];
}
export interface TeamsV1 {
  league: string;
  since: string;
  until: string;
  source: string;
  battles: number;
  devices: number;
  sources: Record<string, number>;
  teams: TeamRowV1[];
  cores: TeamRowV1[];
  generatedAt: string;
}
export interface SpeciesDetailV1 {
  league: string;
  speciesId: string;
  since: string;
  until: string;
  source: string;
  sightings: number;
  wins: number;
  losses: number;
  runs: number;
  runWins: number;
  runLosses: number;
  weekly: { week: string; battles: number; sightings: number }[];
  bands: { band: string; sightings: number; wins: number; losses: number }[];
  alongside: { speciesId: string; battles: number }[];
  movesets: MovesetStats[];
  tournament: SpeciesTournamentBlock | null;
  generatedAt: string;
}

/*
 * The tournament event reads (/api/v1/events, /api/v1/events/:id). They must match
 * workers/counter/src/tournamentRead.ts (EventListRow, EventGameV1, EventMatchV1, EventSpeciesV1,
 * EventDetailV1) and the event row in workers/counter/src/tournamentStore.ts.
 */

/** One Twitch VOD and the event day it covers. A day with no VOD has no entry. */
export interface VodDayV1 {
  day: number;
  id: string;
}
export interface EventListRowV1 {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cup: string;
  battles: number;
  /** Battles with a winner. */
  decided: number;
  players: number;
  /** Whether this event's cup feeds the league's blend. */
  blended: boolean;
}
export interface EventsV1 {
  events: EventListRowV1[];
}
export interface EventGameV1 {
  game: number;
  /** startDate + (day - 1) days + seconds into that day's VOD. */
  at: string;
  leftTeam: string[];
  rightTeam: string[];
  leftForms: string[];
  rightForms: string[];
  winnerSide: string | null;
  resultSource: string | null;
  scoreAtStart: [number, number];
  notes: string | null;
}
export interface EventMatchV1 {
  match: string;
  day: number;
  stage: string;
  group: string | null;
  roundLabel: string | null;
  bracket: string;
  bracketDepth: number;
  matchFormat: string;
  left: string;
  right: string;
  games: EventGameV1[];
}
export interface EventRosterV1 {
  player: string;
  species: { species: string; moves: { fast: string; charged: string[] } | null }[];
}
export interface EventSpeciesV1 extends TournamentSpeciesStat {
  byDepth: number[];
  broughtBy: number;
}
export interface EventDetailV1 {
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    league: string;
    cup: string;
    vods: VodDayV1[];
    notes: string | null;
    received: string;
  };
  matches: EventMatchV1[];
  roster: EventRosterV1[];
  species: EventSpeciesV1[];
}
