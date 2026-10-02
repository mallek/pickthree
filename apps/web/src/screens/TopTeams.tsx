/**
 * Top teams (`#/meta/teams`): meta.pick3.gg's signed team board (docs/design/audits/meta-teams.md),
 * ported into pick3 under its page head (Task 9 of the meta-in-pick3 plan). Cores are the spine,
 * complete teams nest under each.
 *
 * `buildBoard` (@pickthree/engine/meta) does the ranking; this screen only renders it, and renders
 * it honestly: the blended `score` that sorts the board is a ranking key, never a fact about a
 * team, and is never printed. A row prints at most two things about itself: a matchup score out of
 * 100 (a projection from PvPoke's matchup data, explained once behind "How it is ranked", and
 * NEVER printed as a percentage) and a measured record (always a win-loss count, never a
 * percentage). A percentage on this board always means real battles.
 *
 * A row is one tappable line (sprites, title, a one-line summary, its matchup score) that opens in
 * place onto the full facts. What changed from the signed board: "Open in pick3" is "Open in
 * Build" (the in-app team link, so the same parsing reads it) and every complete team, open row
 * or nested build line, also gets "Run this team" (Pick your team, prefilled). A core is two
 * Pokemon and a team needs three, so a core never carries either action; its builds do.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  epochFor,
  type Board,
  type BoardRow,
  type Epoch,
  type SourceKey,
  type SpeciesRanking,
  type WindowKey,
} from '@pickthree/engine/meta';
import {
  Button,
  Chevron,
  Chip,
  Empty,
  ErrorState,
  Header,
  InlineSelect,
  Loading,
  Select,
  Tag,
} from '@pickthree/ui';
import { appNow } from '../clock.ts';
import { PokemonToken, useName } from '../components.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { BlendLine, Note } from '../components/meta/BlendLine.tsx';
import {
  battlesText,
  battleWord,
  count,
  multiTeamOnly,
  plural,
  sortRows,
  subLine,
  teamsSeen,
  SORTS,
  type SortKey,
} from '../components/meta/boardView.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { useMetaRanking, useTopTeams } from '../state/useMeta.ts';
import { teamPath, type SharedPick } from '../teamLink.ts';

const WINDOWS: readonly WindowKey[] = ['meta', '30', '7'];
const SOURCES: readonly SourceKey[] = ['all', 'prior', 'ladder', 'tournament'];

const WINDOW_LABELS: Record<WindowKey, string> = {
  meta: 'This meta',
  '30': '30 days',
  '7': '7 days',
};

const SOURCE_LABELS: Record<SourceKey, string> = {
  all: 'All',
  prior: 'PvPoke',
  ladder: 'GBL',
  tournament: 'Tournaments',
};

/** A team in play order (lead, switch, closer) when the projection named one, else as listed. */
function playOrder(row: BoardRow): string[] {
  return row.order ?? row.species;
}

/** The members a team link carries: each species, with its most common moveset when the record
 * has enough battles behind it to name one. `moves` is aligned with `species`, not `order`. Only a
 * complete, three-member team is ever passed here: `parseTeamPath` answers any other count with
 * "A team link needs three Pokemon". */
function picksOf(row: BoardRow): SharedPick[] {
  return playOrder(row).map((speciesId): SharedPick => {
    const mv = row.moves[row.species.indexOf(speciesId)] ?? null;
    return mv ? { speciesId, moves: { fast: mv.fast, charged: [...mv.charged] } } : { speciesId };
  });
}

/** "Core" for a two-member row, "Full team" for a complete one, or "Projected" for a row nobody
 * has run or faced yet: the generated tag always wins over the kind. */
function kindTag(row: BoardRow): string {
  if (row.source === 'generated') {
    return 'Projected';
  }
  return row.kind === 'core' ? 'Core' : 'Full team';
}

/** The observed record, as counts, never as a percentage. Every branch inflects on 1. */
function recordLine(row: BoardRow): string {
  const hasRun = row.runBattles > 0;
  const hasFaced = row.facedBattles > 0;
  if (row.decided === 0) {
    const total = row.runBattles + row.facedBattles;
    return `Seen ${count(total)} ${plural(total, 'time', 'times')}, no result recorded`;
  }
  const run = `${count(row.runBattles)} ${plural(row.runBattles, 'time', 'times')}`;
  const faced = `${count(row.facedBattles)} ${plural(row.facedBattles, 'time', 'times')}`;
  if (hasRun && hasFaced) {
    const wins = row.runWins + row.facedWins;
    const losses = row.runLosses + row.facedLosses;
    return `Run ${run} and faced ${faced}, the team went ${wins}-${losses} overall`;
  }
  if (hasFaced) {
    // A faced row's wins are the faced team's; the players' own record is the inverse.
    return `Faced ${faced}, players went ${row.facedLosses}-${row.facedWins}`;
  }
  return `Run ${run}, reporters went ${row.runWins}-${row.runLosses}`;
}

/** "A, B and C", the only join this screen needs. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  const last = names[names.length - 1] as string;
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

/** The members that cost a row its projection, by name: outside the matrix slice the data build
 * ships projections for, which is not the same as unknown. */
function outsideText(ids: readonly string[], name: (id: string) => string): string {
  const names = ids.map(name);
  return `No projection: ${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} outside the ranked list this site ships projections for.`;
}

/** `Matchup score <S> of 100`: the one place a projection is printed in a sentence, and never as
 * a percent. The bare number on a collapsed head is the same figure through `scoreOf`. */
function matchupScoreLine(strength: number): string {
  return `Matchup score ${Math.round(strength)} of 100`;
}

function scoreOf(row: BoardRow): number | null {
  return row.strength === null ? null : Math.round(row.strength);
}

/** The explainer behind "How it is ranked": no battle RESULT feeds the score, only which
 * opponents matter, and both halves of the safety factor are named. */
function matchupScoreExplainer(): string {
  return "How much of the meta the three of them beat between them, how well those wins hold when shields change, whether a top opponent goes completely unanswered, and whether the switch has matchups that simply end it. Worked out from PvPoke's matchup data, weighted by how often each opponent is actually faced, not from how anyone's battles turned out.";
}

/** The two things a complete team can do from here: open it in Build (the analysis) or run it. */
function TeamActions({ row, league }: { row: BoardRow; league: string }) {
  const { navigate } = useActions();
  const prefix = `#/t/${league}/`;
  return (
    <div className="tb-actions">
      <Button
        variant="text"
        onClick={() =>
          navigate({
            screen: 'shared',
            league,
            members: teamPath(league, picksOf(row)).slice(prefix.length),
          })
        }
      >
        Open in Build <Chevron />
      </Button>
      <Button variant="text" onClick={() => navigate({ screen: 'meta-new', team: playOrder(row) })}>
        Run this team <Chevron />
      </Button>
    </div>
  );
}

/** What a row is made of and how it was seen (projected, run, faced, or a mix), never the score
 * that ranked it. */
function RowFacts({ row }: { row: BoardRow }) {
  const name = useName();
  return (
    <>
      {row.source === 'generated' ? (
        <p className="tb-fine">
          Projected against PvPoke&apos;s group, not yet seen in shared battles
        </p>
      ) : (
        <p className="tb-fine">{recordLine(row)}</p>
      )}
      {row.strength !== null ? (
        <p className="tb-fine">{matchupScoreLine(row.strength)}</p>
      ) : row.outsideSlice.length > 0 ? (
        <p className="tb-fine">{outsideText(row.outsideSlice, name)}</p>
      ) : null}
    </>
  );
}

/** The distinct thirds a core has been seen complete with, read off its OBSERVED builds only, so
 * the chips, the collapsed line's team count and the multi-team filter can never disagree. */
function thirdsOf(core: BoardRow): string[] {
  const pair = new Set(core.species);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const build of core.builds) {
    if (build.source === 'generated') {
      continue;
    }
    const third = build.species.find((id) => !pair.has(id));
    if (third !== undefined && !seen.has(third)) {
      seen.add(third);
      out.push(third);
    }
  }
  return out;
}

/** What has filled a core's third slot, as tokens. A core never seen complete gets a sentence,
 * unless the pair itself has no projection (RowFacts already says so). */
function CoreThirds({ core }: { core: BoardRow }) {
  const name = useName();
  const thirds = thirdsOf(core);
  if (thirds.length > 0) {
    return (
      <div className="row-part">
        <p className="row-label">Seen with</p>
        <div className="third-chips">
          {thirds.map((id) => (
            <span className="third-chip" key={id}>
              <PokemonToken speciesId={id} size={18} showInitial={false} />
              {name(id)}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (core.projection !== null) {
    return (
      <p className="tb-fine">
        Never seen complete. Projected against any third PvPoke would expect.
      </p>
    );
  }
  return null;
}

/** A complete team nested under a core: its sprites, its kind, one fact (a record or a
 * projection, never both) and the two team actions. */
function BuildLine({ build, league }: { build: BoardRow; league: string }) {
  const name = useName();
  const seen = build.runBattles + build.facedBattles > 0;
  const fact = seen
    ? recordLine(build)
    : build.strength !== null
      ? matchupScoreLine(build.strength)
      : build.outsideSlice.length > 0
        ? outsideText(build.outsideSlice, name)
        : '';
  return (
    <div className="build-line">
      <span className="build-sprites">
        {build.species.map((id) => (
          <PokemonToken key={id} speciesId={id} size={26} showInitial={false} />
        ))}
      </span>
      <Tag>{kindTag(build)}</Tag>
      <span className="tb-fine build-fact">{fact}</span>
      <TeamActions row={build} league={league} />
    </div>
  );
}

/** The collapsed row's sub-line as text, shared by the visual slot and the head's label. */
function rowSubText(row: BoardRow): string {
  return row.source === 'generated' ? 'Projected' : subLine(row);
}

/** What a collapsed head says out loud: the bare figure on the right is named as the matchup
 * score, and empty parts are dropped before the join. */
function headLabel(row: BoardRow, title: string): string {
  const score = scoreOf(row);
  const parts = [title, rowSubText(row), score === null ? '' : matchupScoreLine(score)].filter(
    (p) => p.length > 0,
  );
  return parts.join('. ');
}

/** A top-level row: a head that toggles, and the facts underneath when open. The head is a
 * `<button>` and every action lives in the panel, so nothing interactive nests in another. */
function Row({
  row,
  league,
  open,
  onToggle,
}: {
  row: BoardRow;
  league: string;
  open: boolean;
  onToggle: () => void;
}) {
  const name = useName();
  const isCore = row.kind === 'core';
  // A label, not a sentence: a comma join breaks at a name boundary more often when it truncates.
  const title = row.species.map(name).join(', ');
  const score = scoreOf(row);
  return (
    <div className={`tb-team-row${open ? ' open' : ''}`}>
      <button
        type="button"
        className="row-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={headLabel(row, title)}
      >
        <span className="row-sprites">
          {row.species.map((id) => (
            <PokemonToken key={id} speciesId={id} size={30} showInitial={false} />
          ))}
        </span>
        <span className="row-text">
          <span className="row-title">{title}</span>
          <span className="row-sub">
            {row.source === 'generated' ? <Tag>Projected</Tag> : subLine(row)}
          </span>
        </span>
        <span className="row-score">{score === null ? '' : count(score)}</span>
        <Chevron dir={open ? 'up' : 'down'} />
      </button>
      {open ? (
        <div className="row-body">
          <div className="row-facts">
            <Tag>{kindTag(row)}</Tag>
            <RowFacts row={row} />
          </div>
          {isCore ? <CoreThirds core={row} /> : null}
          {isCore && row.builds.length > 0 ? (
            <div className="row-part">
              <p className="row-label">Built as</p>
              <div className="builds">
                {row.builds.map((build) => (
                  <BuildLine key={build.species.join('+')} build={build} league={league} />
                ))}
              </div>
            </div>
          ) : null}
          {isCore ? null : <TeamActions row={row} league={league} />}
        </div>
      ) : null}
    </div>
  );
}

/** Under All the board mixes two populations, so it says how much came from each. */
function sourcesLine(sources: Record<string, number>): string | null {
  const ladder = sources['ladder'] ?? 0;
  const tournament = sources['broadcast'] ?? 0;
  if (ladder === 0 || tournament === 0) {
    return null;
  }
  return `From ${battlesText(ladder)} shared and ${count(tournament)} tournament ${battleWord(tournament)}.`;
}

/** What is on screen, counted by kind: "14 cores, 3 teams". It moves when the filter does. */
function countLabel(rows: readonly BoardRow[]): string {
  const cores = rows.filter((row) => row.kind === 'core').length;
  const teams = rows.length - cores;
  const parts: string[] = [];
  if (cores > 0) {
    parts.push(`${count(cores)} ${plural(cores, 'core', 'cores')}`);
  }
  if (teams > 0) {
    parts.push(`${count(teams)} ${plural(teams, 'team', 'teams')}`);
  }
  return parts.join(', ');
}

function Controls({
  rows,
  multiOnly,
  onToggleMulti,
  sort,
  onSort,
  showFilter,
}: {
  rows: readonly BoardRow[];
  multiOnly: boolean;
  onToggleMulti: () => void;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  showFilter: boolean;
}) {
  return (
    <div className="board-controls">
      <span className="tb-fine board-count">{countLabel(rows)}</span>
      {showFilter ? (
        <Chip on={multiOnly} onClick={onToggleMulti}>
          Multi-team only
        </Chip>
      ) : null}
      <InlineSelect
        label="Sort"
        value={sort}
        onChange={onSort}
        options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
      />
    </div>
  );
}

/** Nothing shared and nothing projected: say so and ask the reader to log. */
function Contribute({ devices }: { devices: number }) {
  return (
    <div className="card">
      <b>Help fill this in</b>
      <p className="tb-blend">
        Every battle you log is shared here anonymously, and you can switch it off in Settings.{' '}
        {count(devices)} {plural(devices, 'device is', 'devices are')} contributing to this view so
        far.
      </p>
      <Button variant="secondary" href={hashFor({ screen: 'meta-new' })}>
        Log a battle
      </Button>
    </div>
  );
}

/** True when the meta reset names a PvPoke commit other than the one this data was built from. */
function commitMismatch(epoch: Epoch | null, bakedCommit: string): boolean {
  if (!epoch || epoch.pvpokeCommit === undefined) {
    return false;
  }
  return epoch.pvpokeCommit !== bakedCommit;
}

/** The board itself, from what the screen loaded. */
export function TeamBoard(p: {
  league: string;
  /** True when the summary or the team board failed to load. A failed slice is not an error: it
   * degrades the board to `projectionless`. */
  boardError: boolean;
  board: Board | null;
  ranking: SpeciesRanking | null;
  epoch: Epoch | null;
  /** The PvPoke commit the app's game data, and so its projections, was built from. */
  bakedCommit: string | null;
  /** Counted battles by source in the window, for the sentence that says how much of the All
   * board came from each population. */
  sources: Record<string, number>;
  onRetry: () => void;
}): ReactNode {
  const { league, boardError, board, ranking, epoch, bakedCommit, sources, onRetry } = p;
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [multiOnly, setMultiOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('ranked');

  if (boardError) {
    return (
      <ErrorState
        line="Could not load the team board."
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    );
  }
  if (!board || !ranking) {
    return <Loading label="Loading the team board" />;
  }

  const mismatch = bakedCommit !== null && epoch !== null && commitMismatch(epoch, bakedCommit);
  const empty = board.rows.length === 0;
  // The filter is only offered when it has something to act on.
  const showFilter = board.rows.some((row) => row.kind === 'core' && teamsSeen(row) >= 2);
  // A hidden chip (a league switch keeps this state) never thins the rows.
  const shown = sortRows(multiOnly && showFilter ? multiTeamOnly(board.rows) : board.rows, sort);
  const sourcesText = sourcesLine(sources);
  const showMatchupExplainer = !empty && !board.projectionless;
  const showCoverage = showMatchupExplainer && board.weightCovered < 0.95;

  return (
    <>
      <BlendLine
        ranking={ranking}
        zero="Projected against PvPoke's meta group. No shared battles in this window yet."
      >
        {ranking.source === 'all' && sourcesText ? (
          <span className="term-line">{sourcesText}</span>
        ) : null}
        {showMatchupExplainer ? <span className="term-line">{matchupScoreExplainer()}</span> : null}
        {showCoverage ? (
          <span className="term-line">
            {`Projections cover the ${count(board.metaGroupSize)} Pokémon PvPoke lists, which is ${Math.round(board.weightCovered * 100)}% of what players actually faced.`}
          </span>
        ) : null}
      </BlendLine>
      {mismatch && epoch?.pvpokeCommit !== undefined && bakedCommit !== null ? (
        <Note tone="warn">
          <p className="tb-blend">
            {`This meta expects PvPoke commit ${epoch.pvpokeCommit.slice(0, 7)}. The projections were built from ${bakedCommit.slice(0, 7)}, so they may still describe the old movesets.`}
          </p>
        </Note>
      ) : null}
      {!empty && board.projectionless ? (
        <p className="tb-fine">
          Projections are unavailable right now. Rows are ordered by their record.
        </p>
      ) : null}
      {empty ? (
        <Empty
          line="No teams shared in this window yet, and no projections could be loaded."
          action={<Contribute devices={ranking.devices} />}
        />
      ) : (
        <>
          <Controls
            rows={shown}
            multiOnly={multiOnly}
            onToggleMulti={() => setMultiOnly(!multiOnly)}
            sort={sort}
            onSort={setSort}
            showFilter={showFilter}
          />
          <div className="tb-team-rows">
            {shown.map((row) => {
              const key = row.species.join('+');
              return (
                <Row
                  key={key}
                  row={row}
                  league={league}
                  open={openRows[key] ?? false}
                  // Functional update: two taps in one tick must both land.
                  onToggle={() => setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** The board's reads for one league, window and source. */
function LoadedBoard({
  league,
  window: w,
  source,
}: {
  league: string;
  window: WindowKey;
  source: SourceKey;
}) {
  const s = useAppState();
  const board = useTopTeams(league, { window: w, source });
  // The board shows no trend, so it makes no week-earlier read.
  const ranked = useMetaRanking(league, { window: w, source, community: true, trend: false });
  // A failed summary read leaves the ranking standing in as PvPoke's order, marked offline; the
  // board shares that read, so either failing is the board failing.
  const failed =
    board.state === 'error' || ranked.state === 'error' || ranked.data?.offline === true;
  const epoch = s.data ? epochFor(s.data.epochs, league, appNow()) : null;
  return (
    <TeamBoard
      league={league}
      boardError={failed}
      board={board.data}
      ranking={ranked.data?.ranking ?? null}
      epoch={epoch}
      bakedCommit={s.data?.pvpokeCommit ?? null}
      sources={board.data?.sources ?? {}}
      onRetry={() => {
        board.retry();
        ranked.retry();
      }}
    />
  );
}

export function TopTeams() {
  const s = useAppState();
  const { navigate, setLeague, back } = useActions();
  const route = s.route.screen === 'meta-teams' ? s.route : null;
  const w: WindowKey = route?.w ?? 'meta';
  const src: SourceKey = route?.src ?? 'all';
  /** A league named on an inbound link, applied once on arrival. */
  const routeLeague = route?.league ?? null;
  const knownRouteLeague =
    routeLeague !== null && (s.data?.leagues.some((l) => l.id === routeLeague) ?? false);

  // Switch to the league the link named, once. When it is in play the route lets go of it, so
  // the league switcher works again. An unknown league id is ignored.
  useEffect(() => {
    if (!knownRouteLeague || !routeLeague) {
      return;
    }
    if (s.leagueInfo?.id === routeLeague) {
      navigate(
        {
          screen: 'meta-teams',
          ...(route?.w ? { w: route.w } : {}),
          ...(route?.src ? { src: route.src } : {}),
        },
        { replace: true },
      );
    } else if ((s.settings.league ?? 'great') !== routeLeague) {
      setLeague(routeLeague);
    }
  }, [knownRouteLeague, routeLeague, s.leagueInfo, s.settings.league, setLeague, navigate, route]);

  // While a named league is being switched to, read that league, not the one being left.
  const league = knownRouteLeague && routeLeague ? routeLeague : (s.settings.league ?? 'great');

  const choose = (next: { w: WindowKey; src: SourceKey }): void => {
    navigate(
      {
        screen: 'meta-teams',
        ...(next.w !== 'meta' ? { w: next.w } : {}),
        ...(next.src !== 'all' ? { src: next.src } : {}),
        ...(routeLeague ? { league: routeLeague } : {}),
      },
      { replace: true },
    );
  };

  return (
    <div className="screen">
      <div className="sub-head">
        <Header
          variant="sub"
          title="Top teams"
          back={{ label: 'Back', onClick: () => back({ screen: 'meta' }) }}
        />
        <div className="page-head">
          <LeagueSwitcher />
          <div className="tb-filters">
            <Select
              label="Window"
              value={w}
              onChange={(next) => choose({ w: next, src })}
              options={WINDOWS.map((k) => ({ value: k, label: WINDOW_LABELS[k] }))}
            />
            <Select
              label="Source"
              value={src}
              onChange={(next) => choose({ w, src: next })}
              options={SOURCES.map((k) => ({ value: k, label: SOURCE_LABELS[k] }))}
            />
          </div>
        </div>
      </div>
      <div className="scroll tb-board">
        {/* Saved settings first, so a saved league is the first one read. */}
        {s.settingsLoaded ? (
          <LoadedBoard league={league} window={w} source={src} />
        ) : (
          <Loading label="Loading the team board" />
        )}
      </div>
    </div>
  );
}
