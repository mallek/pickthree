/**
 * One species in the meta (`#/species/<id>`), built on the signed specimen page's parts: the hero
 * (token, name, types, the blended "#N meta" with its trend and PvPoke's tags, "#M PvPoke", and
 * how many you have), the facts card, your own copies, PvPoke's recommended moves, the moves
 * players ran when any were reported, tournament sets, what it is seen next to, and Build around
 * it / Who beats it.
 *
 * It replaces meta.pick3.gg's Species page. The measured parts read `/api/v1/meta` and
 * `/api/v1/species/:id` for the league and the default window ("This meta", every source).
 * Opening the page is the player's own choice, so it reads whatever the sharing switch says;
 * the read names this page's species and nothing from the collection.
 */
import type { MoveChoice, MovePool, Specimen } from '@pickthree/engine';
import type {
  BaselineSpecies,
  MovesetStats,
  SourceKey,
  SpeciesDetailV1,
  SpeciesRanking,
  WindowKey,
} from '@pickthree/engine/meta';
import { Button, Empty, ErrorState, Header, IconButton, Loading, Switch, Tag } from '@pickthree/ui';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CogGlyph,
  MetaRankTags,
  MoveRows,
  PokemonToken,
  Share,
  sharePct,
  TypeChip,
  TypeChips,
  VerdictTag,
  useName,
  useSpecies,
} from '../components.tsx';
import { coversLine, num, ownSpeciesId, rankLabel, SEP } from '../format.ts';
import { loadPvpokeSide, type PvpokeSide } from '../metaData.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { useMetaRanking, useSpeciesDetail } from '../state/useMeta.ts';

/** The page reads the default window and every source, as the Meta landing does. */
const WINDOW: WindowKey = 'meta';
const SOURCE: SourceKey = 'all';
const FAILED = 'Could not load the community meta.';

/** Sorts after every judged copy. */
const UNJUDGED = 99_999;

function plural(n: number, one: string, many: string): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/** Joins names the way a sentence would: "A", "A and B", "A, B and C". */
function joinAnd(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/** Whether a source blends tournament play in, so tournament sets belong on the page. */
function includesTournaments(source: SourceKey): boolean {
  return source === 'all' || source === 'tournament';
}

/** The battles whose moves are known: the worker records a moveset only when it saw the moves,
 * so a move's share is over these, not over every battle the species was run in. */
function knownMoveBattles(movesets: readonly MovesetStats[]): number {
  return movesets.reduce((sum, m) => sum + m.battles, 0);
}

/** Each move with the battles behind it, folded across every set, most run first. */
function aggregateMoves(
  movesets: readonly MovesetStats[],
  pick: (m: MovesetStats) => readonly string[],
): { moveId: string; battles: number }[] {
  const totals = new Map<string, number>();
  for (const set of movesets) {
    for (const moveId of pick(set)) {
      totals.set(moveId, (totals.get(moveId) ?? 0) + set.battles);
    }
  }
  return [...totals.entries()]
    .map(([moveId, battles]) => ({ moveId, battles }))
    .sort((a, b) => b.battles - a.battles || a.moveId.localeCompare(b.moveId));
}

/** The source line under the facts: which window, and how many battles stand behind it. */
function sourceLine(r: SpeciesRanking): string {
  const parts: string[] = [];
  if (r.battles > 0) {
    parts.push(
      `${plural(r.battles, 'GBL battle', 'GBL battles')} from ${plural(r.devices, 'player', 'players')}`,
    );
  }
  if (r.tournamentBattles > 0) {
    parts.push(plural(r.tournamentBattles, 'tournament battle', 'tournament battles'));
  }
  return `This meta${SEP}${parts.length > 0 ? parts.join(' and ') : 'no battles shared yet'}`;
}

type MoveNames = Record<string, { name: string; type: string }>;

/** How the set players ran compares to PvPoke's: the same, or which moves PvPoke runs instead. */
function compareLine(
  shown: readonly string[],
  entry: BaselineSpecies,
  moveName: (id: string) => string,
) {
  const pv = [entry.fastMove, ...entry.chargedMoves];
  const pvOnly = pv.filter((m) => !shown.includes(m)).map(moveName);
  const ranOnly = shown.filter((m) => !pv.includes(m)).map(moveName);
  if (pvOnly.length === 0 && ranOnly.length === 0) {
    return 'Same as PvPoke recommends.';
  }
  if (pvOnly.length > 0 && ranOnly.length > 0) {
    return `PvPoke runs ${joinAnd(pvOnly)} over ${joinAnd(ranOnly)}.`;
  }
  if (pvOnly.length > 0) {
    return `PvPoke also runs ${joinAnd(pvOnly)}.`;
  }
  return `PvPoke does not run ${joinAnd(ranOnly)}.`;
}

function MoveRow({ kind, moveId, moves }: { kind: string; moveId: string; moves: MoveNames }) {
  const m = moves[moveId];
  return (
    <div className="move-row">
      <span className="move-kind">{kind}</span>
      <span className="move-main">
        <span className="move-line">
          <span className="move-name">{m?.name ?? moveId}</span>
          <span className="move-tags">{m ? <TypeChip type={m.type} small /> : null}</span>
        </span>
      </span>
    </div>
  );
}

/**
 * Moves players ran: the most run fast move and two charged moves, folded across every set.
 * Nothing at all while no battle reported its moves; Recommended moves above says what PvPoke runs.
 */
function MovesRan({
  detail,
  entry,
  moves,
}: {
  detail: SpeciesDetailV1;
  entry: BaselineSpecies | null;
  moves: MoveNames;
}) {
  const moveName = (id: string): string => moves[id]?.name ?? id;
  const known = knownMoveBattles(detail.movesets);
  const fast = aggregateMoves(detail.movesets, (m) => [m.fast])[0];
  if (known === 0 || !fast) {
    return null;
  }
  const charged = aggregateMoves(detail.movesets, (m) => m.charged)
    .slice(0, 2)
    .map((c) => c.moveId);
  // The battles whose set holds every move shown.
  const seen = detail.movesets
    .filter((set) => set.fast === fast.moveId && charged.every((c) => set.charged.includes(c)))
    .reduce((sum, set) => sum + set.battles, 0);
  const compare = entry ? ` ${compareLine([fast.moveId, ...charged], entry, moveName)}` : '';
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3>Moves players ran</h3>
      <div className="card" style={{ padding: '0 14px' }}>
        <div className="moves">
          <MoveRow kind="Fast" moveId={fast.moveId} moves={moves} />
          {charged.map((c) => (
            <MoveRow kind="Charged" moveId={c} moves={moves} key={c} />
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Seen in {num(seen)} of {plural(known, 'battle', 'battles')} with known moves.{compare}
      </p>
    </div>
  );
}

/** PvPoke's set out of a species' move pool: the recommended fast move and charged moves. */
function recommendedMoves(pool: MovePool): { fast: MoveChoice; charged: MoveChoice[] } | null {
  const fast = pool.fast.find((m) => m.moveId === pool.recommended.fast);
  const charged = pool.recommended.charged
    .map((id) => pool.charged.find((m) => m.moveId === id))
    .filter((m) => m !== undefined);
  return fast && charged.length > 0 ? { fast, charged } : null;
}

/** Sets from tournament rosters: what players brought, over the known sets only. */
function TournamentMoves({
  block,
  entry,
  moves,
}: {
  block: NonNullable<SpeciesDetailV1['tournament']>;
  entry: BaselineSpecies | null;
  moves: MoveNames;
}) {
  const setKey = (fast: string, charged: readonly string[]) =>
    `${fast}|${[...charged].sort().join('+')}`;
  const recommended = entry ? setKey(entry.fastMove, entry.chargedMoves) : null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3>Moves at tournaments</h3>
      <div className="card" style={{ gap: 8 }}>
        {block.movesets.map((set) => {
          const key = setKey(set.fast, set.charged);
          return (
            <div className="sp-set" key={key}>
              <span className="sp-set-moves">
                <span>
                  {joinAnd([set.fast, ...set.charged].map((id) => moves[id]?.name ?? id))}
                </span>
                {key === recommended ? <Tag tone="neutral">PvPoke&apos;s set</Tag> : null}
              </span>
              <span className="small muted">{plural(set.entries, 'entry', 'entries')}</span>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        From {plural(block.movesetsKnown, 'known set', 'known sets')} of{' '}
        {plural(block.broughtBy, 'roster entry', 'roster entries')}.
      </p>
    </div>
  );
}

export function SpeciesPage({ id }: { id: string }) {
  const s = useAppState();
  const { back, loadVerdicts, movePool, navigate, openSheet, setLeague, toggleExcludedSpecies } =
    useActions();
  const name = useName();
  const species = useSpecies();
  const route = s.route.screen === 'species' ? s.route : null;
  /** League named on an inbound link; the app's own links never carry one. */
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
      navigate({ screen: 'species', id }, { replace: true });
    } else if ((s.settings.league ?? 'great') !== routeLeague) {
      setLeague(routeLeague);
    }
  }, [knownRouteLeague, routeLeague, s.leagueInfo, s.settings.league, setLeague, navigate, id]);

  // While a named league is being switched to, read that league, not the one being left.
  const league = knownRouteLeague && routeLeague ? routeLeague : (s.settings.league ?? 'great');
  const info = s.leagueInfo?.id === league ? s.leagueInfo : null;
  const known = info ? info.legal.includes(id) : null;

  const ranked = useMetaRanking(league, { window: WINDOW, source: SOURCE, community: true });
  const detail = useSpeciesDetail(league, known ? id : '', WINDOW, SOURCE);
  // For one render after a league switch the hook still holds the last league's ranking.
  const meta = ranked.data && ranked.data.league === league ? ranked.data : null;

  // PvPoke's set for the comparison and the ban list; memoised per league in metaData.ts.
  const [side, setSide] = useState<{ league: string; side: PvpokeSide } | null>(null);
  useEffect(() => {
    let live = true;
    loadPvpokeSide(league).then(
      (loaded) => {
        if (live) {
          setSide({ league, side: loaded });
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [league]);
  const pvpoke = side && side.league === league ? side.side : null;

  // PvPoke's set for this species in the league in play, from the worker's move pool (the same
  // path Build's picks take), with PvPoke's elite moves left in whatever the Elite TM setting.
  const poolKey = info && known ? `${league}|${id}` : null;
  const [pool, setPool] = useState<{ key: string; pool: MovePool } | null>(null);
  useEffect(() => {
    if (!poolKey || s.boot !== 'ready') {
      return;
    }
    let live = true;
    // Promise.resolve tolerates a test double that returns the pool directly, or nothing.
    Promise.resolve(movePool(id, null, { fast: null, charged: [] }, { allowEliteTm: true })).then(
      (p) => {
        if (live && p) {
          setPool({ key: poolKey, pool: p });
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [poolKey, s.boot, movePool, id]);
  const recommended = pool && pool.key === poolKey ? recommendedMoves(pool.pool) : null;

  useEffect(() => {
    if (
      s.boot === 'ready' &&
      s.leagueInfo &&
      s.collection &&
      Object.keys(s.verdicts).length === 0 &&
      !s.verdictsLoading &&
      !s.verdictsError
    ) {
      void loadVerdicts();
    }
  }, [
    s.boot,
    s.leagueInfo,
    s.collection,
    s.verdicts,
    s.verdictsLoading,
    s.verdictsError,
    loadVerdicts,
  ]);

  /** Your copies of this species, and those that build as it, best IV rank first. */
  const mine = useMemo(() => {
    const rankOf = (sp: Specimen): number => s.verdicts[sp.id]?.build?.ivRank.rank ?? UNJUDGED;
    return (s.collection?.specimens ?? [])
      .filter((sp) => ownSpeciesId(sp) === id || s.verdicts[sp.id]?.build?.speciesId === id)
      .sort((a, b) => rankOf(a) - rankOf(b) || b.cp - a.cp);
  }, [s.collection, s.verdicts, id]);

  const header = (
    <Header
      variant="sub"
      back={{ label: 'Back', onClick: () => back({ screen: 'collection' }) }}
      actions={
        <IconButton label="Settings" onClick={openSheet}>
          <CogGlyph />
        </IconButton>
      }
    />
  );

  if (!s.data || known === null) {
    return (
      <div className="screen">
        <div className="page-head">{header}</div>
        <div className="scroll">
          <Loading label="Loading" />
        </div>
      </div>
    );
  }
  if (!known) {
    return (
      <div className="screen">
        <div className="page-head">{header}</div>
        <div className="scroll">
          <Empty
            line={
              s.data.species[id]
                ? `${name(id)} is not allowed in ${s.data.leagues.find((l) => l.id === league)?.title ?? 'this league'}.`
                : 'No Pokémon called that in this league.'
            }
            action={
              <Button variant="text" href={hashFor({ screen: 'collection' })}>
                Open Collection
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const moves = s.data.moves;
  const row = meta?.ranking.rows.find((r) => r.speciesId === id) ?? null;
  const role = info?.metaRanks[id];
  const pvpokeRank = role?.overall ?? row?.pvpokeRank ?? null;
  const banned = row?.banned ?? pvpoke?.banned.has(id) ?? false;
  const entry = pvpoke?.baseline.byId.get(id) ?? null;
  const types = species(id)?.types ?? [];
  // The ranking stands in with PvPoke's order when the read fails; this page has nothing
  // measured to show then, so it says the read failed.
  const failed = detail.state === 'error' || ranked.state === 'error' || meta?.offline === true;
  const retry = () => {
    ranked.retry();
    detail.retry();
  };
  const d = detail.state === 'ready' ? detail.data : null;
  const settled = !failed && meta !== null && detail.state === 'ready';

  let facts = null;
  if (settled && meta) {
    const r = meta.ranking;
    const sighted = row !== null && row.share !== null && row.sightings > 0;
    const tournament = banned
      ? 'Banned at tournaments'
      : r.tournamentBattles > 0
        ? (row?.tournamentPicks ?? 0) > 0
          ? `${sharePct((row?.tournamentPicks ?? 0) / r.tournamentBattles)} of picks`
          : 'Not picked'
        : null;
    facts = (
      <div className="card" style={{ gap: 8 }}>
        <div className="kv" style={{ alignItems: 'baseline' }}>
          <span className="muted">Share of battles</span>
          {sighted && row.share !== null ? (
            <Share value={sharePct(row.share)} />
          ) : (
            <span className="muted">Not faced in this window</span>
          )}
        </div>
        {d && d.sightings > 0 ? (
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">Players went against it</span>
            <span style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {d.wins}-{d.losses}
            </span>
          </div>
        ) : null}
        {tournament ? (
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">At tournaments</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{tournament}</span>
          </div>
        ) : null}
        <p className="small muted" style={{ margin: 0 }}>
          {sourceLine(r)}
        </p>
      </div>
    );
  }

  const mates = (d?.alongside ?? []).slice(0, 3);

  // The specimen page's switch, by the id a copy battles as: this page's own species. Every copy
  // with a build of it is covered, owned or not; with none, the switch has no line.
  const excluded = (s.settings.excludedSpecies ?? []).includes(id);
  const coveredBy = s.verdictsLoading
    ? []
    : [
        ...(s.collection?.specimens ?? [])
          .filter((c) => s.verdicts[c.id]?.buildSpecies.includes(id))
          .reduce((m, c) => {
            const n = name(c.speciesId);
            return m.set(n, (m.get(n) ?? 0) + 1);
          }, new Map<string, number>()),
      ].map(([n, count]) => ({ name: n, count }));
  const covers = coveredBy.length > 0 ? coversLine(coveredBy) : undefined;

  return (
    <div className="screen">
      <div className="page-head">{header}</div>
      <div className="scroll" style={{ gap: 22 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px 1fr',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <PokemonToken speciesId={id} size={64} />
          <div>
            <h2>{name(id)}</h2>
            <div
              className="small muted"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
            >
              <TypeChips types={types} small />
              <span className="mtags" style={{ marginTop: 0 }}>
                <MetaRankTags rank={row?.rank ?? null} delta={meta?.trend.get(id)} role={role} />
                {pvpokeRank !== null ? <span className="mtag">#{pvpokeRank} PvPoke</span> : null}
              </span>
            </div>
            {s.settingsLoaded ? (
              <div className="meta">
                {mine.length > 0 ? `You have ${num(mine.length)}` : 'Not in your collection'}
              </div>
            ) : null}
          </div>
        </div>

        {failed ? (
          <ErrorState line={FAILED} action={<Button onClick={retry}>Try again</Button>} />
        ) : settled ? (
          facts
        ) : (
          <Loading label="Loading the community meta" />
        )}

        <div className="stack" style={{ gap: 6 }}>
          <h3>Yours</h3>
          {mine.length > 0 ? (
            <div className="card sp-yours" style={{ padding: '0 14px', gap: 0 }}>
              {mine.map((sp) => {
                const v = s.verdicts[sp.id];
                const row = (
                  <a
                    className="spec-row sub"
                    key={sp.id}
                    href={hashFor({ screen: 'specimen', id: sp.id })}
                    style={{ gridTemplateColumns: '1fr auto' }}
                  >
                    <span className="meta" style={{ display: 'block' }}>
                      {ownSpeciesId(sp) !== id ? `${name(sp.speciesId)} · ` : ''}CP {sp.cp} ·{' '}
                      {rankLabel(sp, v)} · Level {sp.level.max}
                      {sp.lucky ? ' · Lucky' : ''}
                    </span>
                    {v ? <VerdictTag label={v.label} /> : <span className="meta">...</span>}
                  </a>
                );
                if (v?.label !== 'Needs rescan') {
                  return row;
                }
                // Its IVs never came through: Collection sends it here, and here it can be fixed
                // by typing in what the appraisal screen shows.
                return (
                  <Fragment key={sp.id}>
                    {row}
                    <div className="sp-yours-action">
                      <Button variant="text" href={hashFor({ screen: 'add', edit: sp.id })}>
                        Enter values
                      </Button>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ gap: 10 }}>
              <span className="small muted">Scan one in Poke Genie, or add it by hand.</span>
              {/* Build around it is the page's one filled button; this one is secondary. */}
              <Button href={hashFor({ screen: 'add', species: id })}>Add one</Button>
            </div>
          )}
        </div>

        {recommended ? (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Recommended moves</h3>
            <div className="card" style={{ padding: '0 14px' }}>
              <MoveRows fast={recommended.fast} charged={recommended.charged} eliteOnly />
            </div>
          </div>
        ) : null}

        {settled && d ? <MovesRan detail={d} entry={entry} moves={moves} /> : null}

        {settled &&
        d?.tournament &&
        !banned &&
        includesTournaments(SOURCE) &&
        d.tournament.movesets.length > 0 ? (
          <TournamentMoves block={d.tournament} entry={entry} moves={moves} />
        ) : null}

        {settled && mates.length > 0 ? (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Seen next to</h3>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {mates.map((m) => (
                <a
                  className="sp-mate"
                  key={m.speciesId}
                  href={hashFor({ screen: 'species', id: m.speciesId })}
                >
                  <PokemonToken speciesId={m.speciesId} size={28} showInitial={false} />
                  <span className="small">{name(m.speciesId)}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card">
          <Switch
            label={`Use ${name(id)} in team recommendations`}
            {...(covers ? { line: covers } : {})}
            checked={!excluded}
            disabled={!s.settingsLoaded}
            onChange={() => toggleExcludedSpecies(id)}
          />
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <Button variant="primary" href={hashFor({ screen: 'build', lead: id })}>
            Build around it
          </Button>
          {/* The back mark: Counters shows Back to this page. */}
          <Button href={hashFor({ screen: 'counters', vs: id, from: true })}>Who beats it</Button>
        </div>
      </div>
    </div>
  );
}
