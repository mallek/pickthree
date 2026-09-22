/**
 * The one sentence under every list, per source. Generated from the same two numbers the blend
 * actually uses (`say` and `tournamentSay`), the way Pokemon.tsx already tied its own sentence to
 * `measuredSay`, so the stated weight can never drift from the weight applied. CLAUDE.md: this
 * site "blends PvPoke's curated list with measured play on a stated, visible weight".
 *
 * It lives in its own file because three screens print it (Pokemon, Teams and Species) and used
 * to print three near-copies of it.
 */
import { battleWord, battles as battlesText, count, plural } from './format.js';
import type { SpeciesRanking } from './rank.js';

function devicesText(n: number): string {
  return `${count(n)} ${plural(n, 'device', 'devices')}`;
}

function eventsText(n: number): string {
  return `${count(n)} ${plural(n, 'event', 'events')}`;
}

/** "148 shared battles", the adjective folded in with the count rather than tacked on after
 *  `battlesText`, so it reads as one phrase ("shared battles"), not two ("battles shared"). */
function sharedBattlesText(n: number): string {
  return `${count(n)} shared ${battleWord(n)}`;
}

/** The `all`-source fallback when there is no tournament data in the window. `headerCopy.test.ts`
 *  ("falls back to the ladder sentence under All...") pins this exact wording, "shared battles",
 *  which is NOT the same string as the literal `ladder` sentence below even though both branches
 *  are reached whenever `!hasTournament`. */
function ladderLine(r: SpeciesRanking): string {
  return `${Math.round(r.say * 100)}% measured, from ${sharedBattlesText(r.battles)} by ${devicesText(r.devices)}`;
}

/** The literal `source === 'ladder'` sentence: unchanged from today's wording, "battles shared
 *  by", the exact text Pokemon.tsx, Teams.tsx and Species.tsx currently build inline (not yet
 *  replaced by this file -- see pokemon.test.tsx:108, teams.test.tsx:422, species.test.tsx:423,
 *  all still passing, all still this word order). Kept deliberately distinct from `ladderLine`
 *  above, whose "shared battles" wording belongs only to the `all` fallback. */
function literalLadderLine(r: SpeciesRanking): string {
  return `${Math.round(r.say * 100)}% measured, from ${battlesText(r.battles)} shared by ${devicesText(r.devices)}`;
}

/** `zero` is the screen's own sentence for "nothing measured at all": Teams says it is projecting
 *  against PvPoke's group, Pokemon says it is showing PvPoke's list, and neither belongs here. */
export function sourceHeaderLine(r: SpeciesRanking, zero: string): string {
  if (r.source === 'prior') {
    return `PvPoke's list, commit ${r.pvpokeCommit.slice(0, 7)} from ${r.pvpokeDate}. Nothing measured.`;
  }
  if (r.source === 'tournament') {
    if (r.tournamentBattles === 0) {
      return "PvPoke's list. No tournament battles in this window yet.";
    }
    const t = Math.round(r.tournamentSay * 100);
    return `${t}% from tournaments, ${100 - t}% PvPoke. From ${battlesText(r.tournamentBattles)} at ${eventsText(r.events)}. Not shared ladder play.`;
  }
  const hasTournament = r.source === 'all' && r.tournamentBattles > 0;
  if (!hasTournament) {
    if (r.battles === 0) {
      return zero;
    }
    return r.source === 'ladder' ? literalLadderLine(r) : ladderLine(r);
  }
  const pvpokePct = Math.round((1 - r.say) * (1 - r.tournamentSay) * 100);
  const tPct = Math.round((1 - r.say) * r.tournamentSay * 100);
  const tourney = `${count(r.tournamentBattles)} tournament ${battleWord(r.tournamentBattles)} from ${eventsText(r.events)}`;
  if (r.battles === 0) {
    return `PvPoke ${pvpokePct}%, tournaments ${tPct}%. From ${tourney}. No shared ladder battles in this window yet.`;
  }
  const lPct = Math.round(r.say * 100);
  return `PvPoke ${pvpokePct}%, tournaments ${tPct}%, GBL ${lPct}%. From ${sharedBattlesText(r.battles)} by ${devicesText(r.devices)} and ${tourney}.`;
}
