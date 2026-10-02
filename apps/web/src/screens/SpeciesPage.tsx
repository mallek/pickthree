/**
 * One species (`#/species/<id>`), and the place its copies are managed. Top to bottom: the hero
 * (token, name, types, the blended "#N meta" with its trend and PvPoke's tags, "#M PvPoke", and
 * how many you have); the copy shown, with pin, edit and remove beside its heading, judged as
 * this species; its moves against PvPoke's set; what it costs to build; the teams it is in; your
 * other copies, including lower forms that can evolve into it; then the meta: the facts card, the
 * moves players ran, tournament sets, what it is seen next to, and Build around it / Who beats it.
 *
 * `?copy=<id>` names the copy to show; without it the page shows the pinned one. It took over the
 * Pokémon page (`#/collection/<id>`), whose links hand off here.
 *
 * The measured parts read `/api/v1/meta` and `/api/v1/species/:id` for the league and the default
 * window ("This meta", every source). Opening the page is the player's own choice, so it reads
 * whatever the sharing switch says; the read names this page's species and nothing from the
 * collection.
 */
import type { MoveChoice, MoveIds, MovePool, SpeciesView } from '@pickthree/engine';
import type {
  MovesetStats,
  SourceKey,
  SpeciesDetailV1,
  SpeciesRanking,
  WindowKey,
} from '@pickthree/engine/meta';
import {
  Button,
  ConfirmSheet,
  Empty,
  ErrorState,
  Header,
  IconButton,
  Loading,
  Switch,
  Tag,
} from '@pickthree/ui';
import { useEffect, useMemo, useState } from 'react';
import {
  CogGlyph,
  MetaRankTags,
  MoveRows,
  PokemonToken,
  Share,
  sharePct,
  TypeChip,
  TypeChips,
  useName,
  useSpecies,
} from '../components.tsx';
import { MovesCard, movesEntered } from '../components/species/MovesCard.tsx';
import { ShownCopy } from '../components/species/ShownCopy.tsx';
import { Yours, type YoursRow } from '../components/species/Yours.tsx';
import { coversLine, num, ownSpeciesId, powerUpLine, SEP } from '../format.ts';
import { loadPvpokeSide, type PvpokeSide } from '../metaData.ts';
import { hashFor, useActions, useAppState } from '../state/store.tsx';
import { useMetaRanking, useSpeciesDetail } from '../state/useMeta.ts';

/** The page reads the default window and every source, as the Meta landing does. */
const WINDOW: WindowKey = 'meta';
const SOURCE: SourceKey = 'all';
const FAILED = 'Could not load the community meta.';

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
function compareLine(shown: readonly string[], pvSet: MoveIds, moveName: (id: string) => string) {
  const pv = [pvSet.fast, ...pvSet.charged];
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
  pvSet,
  moves,
}: {
  detail: SpeciesDetailV1;
  /** The set Recommended moves shows, so the page states one PvPoke set; null until it loads. */
  pvSet: MoveIds | null;
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
  const compare = pvSet ? ` ${compareLine([fast.moveId, ...charged], pvSet, moveName)}` : '';
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
  pvSet,
  moves,
}: {
  block: NonNullable<SpeciesDetailV1['tournament']>;
  pvSet: MoveIds | null;
  moves: MoveNames;
}) {
  const setKey = (fast: string, charged: readonly string[]) =>
    `${fast}|${[...charged].sort().join('+')}`;
  const recommended = pvSet ? setKey(pvSet.fast, pvSet.charged) : null;
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

/** "You have 2, and 3 Eevee that evolve into it": your copies of the species and of lower forms. */
function haveLine(
  rows: readonly YoursRow[],
  id: string,
  mega: boolean,
  name: (id: string) => string,
): string {
  if (rows.length === 0) {
    return 'Not in your collection';
  }
  const own = rows.filter((r) => ownSpeciesId(r.sp) === id).length;
  const lower = new Map<string, number>();
  for (const r of rows) {
    if (ownSpeciesId(r.sp) !== id) {
      const n = name(r.sp.speciesId);
      lower.set(n, (lower.get(n) ?? 0) + 1);
    }
  }
  if (lower.size === 0) {
    return `You have ${num(own)}`;
  }
  const count = rows.length - own;
  const list = joinAnd([...lower].map(([n, c]) => `${num(c)} ${n}`));
  const verb = mega
    ? 'that can Mega Evolve into it'
    : `that ${count === 1 ? 'evolves' : 'evolve'} into it`;
  return own > 0 ? `You have ${num(own)}, and ${list} ${verb}` : `You have ${list} ${verb}`;
}

type Ask = 'pin' | 'unpin' | 'remove';

export function SpeciesPage({ id }: { id: string }) {
  const s = useAppState();
  const {
    back,
    loadVerdicts,
    movePool,
    navigate,
    openSheet,
    removeSpecimen,
    setLeague,
    setPin,
    speciesView,
    toggleExcludedSpecies,
  } = useActions();
  const name = useName();
  const species = useSpecies();
  const route = s.route.screen === 'species' ? s.route : null;
  const routeCopy = route?.copy;
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
      navigate(
        { screen: 'species', id, ...(routeCopy ? { copy: routeCopy } : {}) },
        { replace: true },
      );
    } else if ((s.settings.league ?? 'great') !== routeLeague) {
      setLeague(routeLeague);
    }
  }, [
    knownRouteLeague,
    routeLeague,
    routeCopy,
    s.leagueInfo,
    s.settings.league,
    setLeague,
    navigate,
    id,
  ]);

  // While a named league is being switched to, read that league, not the one being left.
  const league = knownRouteLeague && routeLeague ? routeLeague : (s.settings.league ?? 'great');
  const info = s.leagueInfo?.id === league ? s.leagueInfo : null;
  const known = info ? info.legal.includes(id) : null;
  const leagueTitle = s.data?.leagues.find((l) => l.id === league)?.title ?? 'this league';

  const ranked = useMetaRanking(league, { window: WINDOW, source: SOURCE, community: true });
  const detail = useSpeciesDetail(league, known ? id : '', WINDOW, SOURCE);
  // For one render after a league switch the hook still holds the last league's ranking.
  const meta = ranked.data && ranked.data.league === league ? ranked.data : null;

  // The Play! ban list, for when the ranking read has no row; memoised per league in metaData.ts.
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

  // Your copies of this species and of every lower form that can become it, each judged as this
  // species, from the worker. Asked again whenever the collection, the pins or a filter changes;
  // the last answer stays on screen meanwhile, so a pin does not blank the page.
  const collection = s.collection;
  const filters = s.settings.filters;
  // Nothing of yours shares this species' family: no need to ask, the page is "not collected".
  const kin = useMemo(() => {
    const all = s.data?.species;
    const family = all?.[all[id]?.megaOf ?? id]?.familyId ?? null;
    return (collection?.specimens ?? []).some((sp) => {
      const f = all?.[sp.speciesId]?.familyId ?? sp.familyId;
      return ownSpeciesId(sp) === id || (family !== null && f === family);
    });
  }, [s.data, collection, id]);
  const viewKey = `${league}|${id}`;
  const [view, setView] = useState<{ key: string; view: SpeciesView } | null>(null);
  const [viewFailed, setViewFailed] = useState(false);
  useEffect(() => {
    if (s.boot !== 'ready' || !info || !collection || !kin) {
      return;
    }
    let live = true;
    // Promise.resolve tolerates a test double that returns the view directly, or nothing.
    Promise.resolve(speciesView(id, league)).then(
      (v) => {
        if (live && v) {
          setView({ key: viewKey, view: v });
          setViewFailed(false);
        }
      },
      () => {
        if (live) {
          setViewFailed(true);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [s.boot, info, collection, filters, kin, speciesView, id, league, viewKey]);
  const current = kin && view && view.key === viewKey ? view.view : null;
  const viewPending = kin && current === null && !viewFailed;

  /** Your copies on this page, best IV rank for it first. */
  const rows: YoursRow[] = useMemo(() => {
    const byId = new Map((collection?.specimens ?? []).map((sp) => [sp.id, sp]));
    return (current?.copies ?? []).flatMap((c) => {
      const sp = byId.get(c.specimenId);
      return sp ? [{ sp, verdict: c.verdict }] : [];
    });
  }, [current, collection]);
  const pinnedId = current && rows.some((r) => r.sp.id === current.pickId) ? current.pickId : null;
  // The copy shown: the one the address names, else the pinned one, else pick3's own pick.
  const shown =
    rows.find((r) => r.sp.id === routeCopy) ??
    rows.find((r) => r.sp.id === pinnedId) ??
    rows.find((r) => r.sp.id === current?.defaultId) ??
    rows[0] ??
    null;
  const shownOwn = shown !== null && ownSpeciesId(shown.sp) === id;
  // A lower form's moves change when it evolves, so only a copy of this species has known moves.
  const ownMoves = shown && shownOwn ? shown.sp.currentMoves : null;
  const knownMoves = ownMoves && movesEntered(ownMoves) ? ownMoves : null;
  const movesKey = knownMoves ? `${knownMoves.fast ?? ''}|${knownMoves.charged.join('+')}` : '';

  // PvPoke's set for this species in the league in play, from the worker's move pool (the same
  // path Build's picks take), with PvPoke's elite moves left in whatever the Elite TM setting.
  // The counts follow the fast move the shown copy knows.
  const poolKey = info && known ? `${league}|${id}|${movesKey}` : null;
  const [pool, setPool] = useState<{ key: string; pool: MovePool } | null>(null);
  useEffect(() => {
    if (!poolKey || s.boot !== 'ready') {
      return;
    }
    let live = true;
    const [fast, chargedKey] = poolKey.split('|').slice(2) as [string | undefined, string?];
    const moves = {
      fast: fast ? fast : null,
      charged: chargedKey ? chargedKey.split('+') : [],
    };
    const ask = (fastId: string | null) =>
      // Promise.resolve tolerates a test double that returns the pool directly, or nothing.
      Promise.resolve(movePool(id, fastId, moves, { allowEliteTm: true }));
    ask(moves.fast)
      // A scanned fast move the species no longer lists: the counts fall back to PvPoke's.
      .catch(() => ask(null))
      .then(
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
  const shownPool = pool && pool.key === poolKey ? pool.pool : null;
  const recommended = shownPool ? recommendedMoves(shownPool) : null;
  // The one PvPoke set the page states: the stars on the moves card, the comparison under the
  // moves players ran, and the tournament card's "PvPoke's set" mark all read it.
  const pvSet = recommended ? shownPool!.recommended : null;

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

  const [ask, setAsk] = useState<Ask | null>(null);

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

  if (!s.data || known === null || (!known && viewPending)) {
    return (
      <div className="screen">
        {header}
        <div className="scroll">
          <Loading label="Loading" />
        </div>
      </div>
    );
  }
  if (!known && !shown) {
    return (
      <div className="screen">
        {header}
        <div className="scroll">
          <Empty
            line={
              s.data.species[id]
                ? `${name(id)} is not allowed in ${leagueTitle}.`
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

  // The switch goes by the id a copy battles as: this page's own species. Every copy with a
  // build of it is covered, owned or not; with none, the switch has no line.
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

  // The shown copy's own numbers: what the Pokémon page used to hold.
  const v = shown?.verdict ?? null;
  const build = v?.build ?? null;
  const sp = shown?.sp ?? null;
  // The copy's best build over every stage, from the collection's verdicts: named when it is
  // another species than this page's.
  const best = sp ? (s.verdicts[sp.id]?.build?.speciesId ?? null) : null;
  const bestAs = best !== null && best !== id && info?.legal.includes(best) ? best : null;
  // No power-up and no evolution to do reads "Already at level L." in place of "Level A to B",
  // and drops the zero tiles; whatever still costs something (a second move unlock) keeps its
  // tile. Half a level short is not already there, whatever the verdict's own margin says.
  const alreadyThere =
    sp !== null && build !== null && build.stageOffset === 0 && build.baseLevel <= sp.level.max;
  const cost = v?.cost ?? null;
  const tiles: [string, number][] = cost
    ? (
        [
          ['Stardust', cost.stardust],
          ['Candy', cost.candy],
          ['XL Candy', cost.xlCandy],
        ] as [string, number][]
      ).filter(([, value]) => !alreadyThere || value > 0)
    : [];
  // Nothing to pay at all: the section goes, rather than say "Already at level L." on its own.
  const nothingToPay =
    cost !== null &&
    alreadyThere &&
    tiles.length === 0 &&
    !cost.secondMoveUnlock &&
    cost.eliteTm === 0 &&
    cost.megaEnergy !== 'needed';
  const teams = sp
    ? (s.recommendation?.teams ?? []).filter((t) =>
        t.slots.some((sl) => sl.candidate.build.specimenId === sp.id),
      )
    : [];
  const pinnedRow = rows.find((r) => r.sp.id === pinnedId) ?? null;
  const show = (copy: string): void => navigate({ screen: 'species', id, copy }, { replace: true });

  const movesNote = !sp
    ? null
    : !shownOwn
      ? `A ${name(sp.speciesId)}'s moves change when it evolves, so pick3 assumes the starred ones.`
      : knownMoves
        ? 'pick3 uses these to work out what the recommended moves would cost.'
        : 'Moves not entered yet. pick3 assumes the starred moves. Edit to tick what it knows.';

  const hero = (
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
          {known ? (
            <span className="mtags" style={{ marginTop: 0 }}>
              <MetaRankTags rank={row?.rank ?? null} delta={meta?.trend.get(id)} role={role} />
              {pvpokeRank !== null ? <span className="mtag">#{pvpokeRank} PvPoke</span> : null}
            </span>
          ) : null}
        </div>
        {s.settingsLoaded && !viewPending ? (
          <div className="meta">
            {haveLine(rows, id, Boolean(s.data.species[id]?.megaOf), name)}
          </div>
        ) : null}
      </div>
    </div>
  );

  const yours =
    shown && sp && v ? (
      <>
        <ShownCopy
          speciesId={id}
          leagueTitle={leagueTitle}
          sp={sp}
          verdict={v}
          alsoPickFor={current?.copies.find((c) => c.specimenId === sp.id)?.alsoPickFor ?? []}
          pinned={sp.id === pinnedId}
          unpinned={current?.unpinned === true}
          bestAs={bestAs}
          onPin={() => setAsk(sp.id === pinnedId ? 'unpin' : 'pin')}
          onRemove={() => setAsk('remove')}
        />

        {shownPool && known ? (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Moves</h3>
            <MovesCard
              pool={shownPool}
              known={knownMoves}
              leagueTitle={leagueTitle}
              note={movesNote}
            />
            {v.formNote ? <p className="small form-note">{v.formNote}</p> : null}
          </div>
        ) : null}

        {build && build.stageOffset > 0 && build.mega === null ? (
          <div className="evo">
            <PokemonToken speciesId={build.speciesId} size={36} showInitial={false} />
            <div>
              <div className="role" style={{ display: 'block' }}>
                Before powering up
              </div>
              <div style={{ fontSize: 15 }}>Evolve it to {name(build.speciesId)}</div>
            </div>
          </div>
        ) : null}

        {/* Every Mega build the league allows, beside the page's own build. */}
        {v.megaBuilds
          .filter((mb) => mb.speciesId !== id)
          .map((mb) => (
            <div className="evo" role="group" aria-label="Mega build" key={mb.speciesId}>
              <PokemonToken speciesId={mb.speciesId} size={36} showInitial={false} />
              <div>
                <div className="role" style={{ display: 'block' }}>
                  Mega build
                </div>
                <div style={{ fontSize: 15 }}>{name(mb.speciesId)}</div>
                <div className="small muted">{powerUpLine(mb)}</div>
              </div>
            </div>
          ))}

        {cost && build && !nothingToPay ? (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Cost to build</h3>
            {alreadyThere ? (
              <>
                <p>Already at level {sp.level.max}.</p>
                {cost.secondMoveUnlock ? (
                  <div className="small muted">Includes second move unlock.</div>
                ) : null}
              </>
            ) : (
              <div className="small muted">
                Level {sp.level.max} to {build.baseLevel}
                {cost.secondMoveUnlock ? ' · includes second move unlock' : ''}
                {cost.evolutionCandy > 0
                  ? ` · includes ${cost.evolutionCandy} candy to evolve`
                  : ''}
              </div>
            )}
            {tiles.length > 0 ? (
              <div className="stat3">
                {tiles.map(([label, value]) => (
                  <div className="stat" key={label}>
                    <b>{num(value)}</b>
                    <span className="meta">{label}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {cost.megaEnergy ? (
              <p className="small muted">
                {cost.megaEnergy === 'ready' ? 'Mega Energy (mega-evolved before)' : 'Mega Energy'}
              </p>
            ) : null}
            {cost.eliteTm > 0 ? <p className="small muted">Plus {cost.eliteTm} Elite TM.</p> : null}
          </div>
        ) : null}

        {known ? (
          <div className="stack" style={{ gap: 8 }}>
            <h3>Teams with this Pokémon</h3>
            {teams.length === 0 ? (
              <p className="small muted">Not in any recommended team right now.</p>
            ) : null}
            {teams.map((t) => (
              <a className="card sp-team" key={t.id} href={hashFor({ screen: 'team', id: t.id })}>
                <div className="token-stack">
                  {t.slots.map((sl) => (
                    <PokemonToken
                      key={sl.candidate.build.specimenId}
                      speciesId={sl.candidate.build.speciesId}
                      size={28}
                      showInitial={false}
                    />
                  ))}
                </div>
                <span style={{ flex: 1, fontSize: 14 }}>
                  {t.slots.map((sl) => name(sl.candidate.build.speciesId)).join(' · ')}
                </span>
                <span className="meta">{t.score.fit} &rsaquo;</span>
              </a>
            ))}
          </div>
        ) : null}

        <Yours
          speciesId={id}
          leagueTitle={leagueTitle}
          rows={rows}
          pinnedId={pinnedId}
          shownId={sp.id}
          onShow={show}
        />
      </>
    ) : viewPending ? (
      <Loading label="Loading your Pokémon" />
    ) : (
      <div className="stack" style={{ gap: 6 }}>
        <h3>Yours</h3>
        <div className="card" style={{ gap: 10 }}>
          <span className="small muted">Scan one in Poke Genie, or add it by hand.</span>
          {/* Build around it is the page's one filled button; this one is secondary. */}
          <Button href={hashFor({ screen: 'add', species: id })}>Add one</Button>
        </div>
      </div>
    );

  const sheets =
    ask && sp ? (
      ask === 'remove' ? (
        <ConfirmSheet
          tone="danger"
          title={`Remove this ${name(sp.speciesId)}?`}
          line="It leaves your collection on this phone. A new import will not bring it back."
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={() => {
            setAsk(null);
            const gone = sp.id;
            void removeSpecimen(gone).then(() => {
              // The address named the copy that is gone: the page shows its next pick.
              if (routeCopy === gone) {
                navigate({ screen: 'species', id }, { replace: true });
              }
            });
          }}
          onCancel={() => setAsk(null)}
        />
      ) : ask === 'pin' ? (
        <ConfirmSheet
          title={`Pin this ${name(sp.speciesId)} for ${leagueTitle}?`}
          line={
            pinnedRow
              ? `pick3 picks your best ${name(id)} for each league. This overrides that for ${leagueTitle} and unpins the CP ${pinnedRow.sp.cp} one, so teams use this one instead.`
              : `pick3 picks your best ${name(id)} for each league. This pins this one for ${leagueTitle}, so teams use it.`
          }
          confirmLabel="Pin this one"
          cancelLabel="Cancel"
          onConfirm={() => {
            setAsk(null);
            void setPin(id, sp.id);
          }}
          onCancel={() => setAsk(null)}
        />
      ) : (
        <ConfirmSheet
          title={`Unpin this ${name(sp.speciesId)} for ${leagueTitle}?`}
          line={`With no ${name(id)} pinned, pick3 treats ${name(id)} as one you do not have in ${leagueTitle}: it leaves your recommended teams, and Build and Counters use a typical one.`}
          confirmLabel="Unpin"
          cancelLabel="Cancel"
          onConfirm={() => {
            setAsk(null);
            void setPin(id, null);
          }}
          onCancel={() => setAsk(null)}
        />
      )
    ) : null;

  // A species the league does not allow, with a copy of yours: nothing of the meta, only the
  // copy and its actions, so it can still be edited or removed.
  if (!known) {
    return (
      <div className="screen">
        {header}
        <div className="scroll" style={{ gap: 22 }}>
          {hero}
          <p style={{ margin: 0 }}>
            {name(id)} is not allowed in {leagueTitle}.
          </p>
          {yours}
        </div>
        {sheets}
      </div>
    );
  }

  return (
    <div className="screen">
      {header}
      <div className="scroll" style={{ gap: 22 }}>
        {hero}

        {yours}

        {failed ? (
          <ErrorState line={FAILED} action={<Button onClick={retry}>Try again</Button>} />
        ) : settled ? (
          facts
        ) : (
          <Loading label="Loading the community meta" />
        )}

        {!shown && recommended ? (
          <div className="stack" style={{ gap: 6 }}>
            <h3>Recommended moves</h3>
            <div className="card" style={{ padding: '0 14px' }}>
              <MoveRows fast={recommended.fast} charged={recommended.charged} eliteOnly />
            </div>
            {shownPool?.source === 'fallback' ? (
              <p className="small muted" style={{ margin: 0 }}>
                PvPoke has no set for {name(id)} in {leagueTitle}; picked by move stats.
              </p>
            ) : null}
            {viewPending ? null : (
              <p className="small muted" style={{ margin: 0 }}>
                Teams and counters assume these moves until you add one.
              </p>
            )}
          </div>
        ) : null}

        {settled && d ? <MovesRan detail={d} pvSet={pvSet} moves={moves} /> : null}

        {settled &&
        d?.tournament &&
        !banned &&
        includesTournaments(SOURCE) &&
        d.tournament.movesets.length > 0 ? (
          <TournamentMoves block={d.tournament} pvSet={pvSet} moves={moves} />
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
      {sheets}
    </div>
  );
}
