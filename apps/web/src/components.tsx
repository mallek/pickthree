import {
  countedBattles,
  DEFAULT_PROFILE_OPTIONS,
  type MetaRank,
  type MoveChoice,
  type MoveEffect,
  type PokemonType,
  type VerdictLabel,
} from '@pickthree/engine';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { metaTags, SEP, shortName, speciesDisplayName } from './format.ts';
import type { SpeciesLite } from './host/protocol.ts';
import { matchesQuery, parseQuery } from './search.ts';
import { familyContext, speciesRecord } from './searchRecords.ts';
import { seasonsFor } from './state/seasonsFor.ts';
import { useLeague } from './components/LeagueSwitcher.tsx';
import { useActions, useAppState } from './state/store.tsx';
import { logBattles } from './state/facing.ts';
import {
  Button,
  Chevron,
  HeaderShell,
  Loading,
  SpeciesToken,
  Tag,
  TypeChip,
  type TagTone,
} from '@pickthree/ui';

export { Chip, Seg, Term, TypeChip } from '@pickthree/ui';

export function useSpecies(): (id: string) => SpeciesLite | undefined {
  const { data } = useAppState();
  return (id: string) => data?.species[id];
}

export function useName(): (id: string) => string {
  const sp = useSpecies();
  return (id: string) => {
    const s = sp(id);
    return speciesDisplayName(id, s ? ({ speciesName: s.name } as never) : undefined);
  };
}

/** "Shadow Dragonite" -> "S. Dragonite", for tight spaces like the recent-battles row. */
export function useShortName(): (id: string) => string {
  const sp = useSpecies();
  return (id: string) => {
    const s = sp(id);
    return shortName(id, s ? ({ speciesName: s.name } as never) : undefined);
  };
}

const sticky = new Map<string, unknown>();
/** Every mounted useSticky, per key, so two components reading one key (Collection's list and
 * its Filters sheet) see one value: a write from either re-renders both. */
const stickyListeners = new Map<string, Set<() => void>>();

/**
 * useState that survives leaving and returning to a screen within the session, so filters and
 * sort on the Collection do not reset when you tap into a Pokémon and come back. Every component
 * reading the same key shares its value.
 */
export function useSticky<T>(key: string, initial: T): [T, (next: T | ((cur: T) => T)) => void] {
  // The first initial only: a caller passing a fresh object on each render (new Set()) must not
  // hand useSyncExternalStore a new snapshot every time it asks.
  const first = useRef(initial);
  const subscribe = useCallback(
    (onChange: () => void) => {
      let listeners = stickyListeners.get(key);
      if (!listeners) {
        listeners = new Set();
        stickyListeners.set(key, listeners);
      }
      const mine = listeners;
      mine.add(onChange);
      return () => {
        mine.delete(onChange);
      };
    },
    [key],
  );
  const read = (): T => (sticky.has(key) ? (sticky.get(key) as T) : first.current);
  const value = useSyncExternalStore(subscribe, read);
  const set = useCallback(
    (next: T | ((cur: T) => T)): void => {
      const cur = sticky.has(key) ? (sticky.get(key) as T) : first.current;
      const v = typeof next === 'function' ? (next as (cur: T) => T)(cur) : next;
      sticky.set(key, v);
      for (const onChange of stickyListeners.get(key) ?? []) {
        onChange();
      }
    },
    [key],
  );
  return [value, set];
}

/** Forgets every sticky value, so one test's sort or dismissal does not carry into the next. */
export function resetStickyForTests(): void {
  sticky.clear();
}

/**
 * Remembers how far a screen was scrolled and puts it back on return, once `ready` says the
 * list is rendered. Tapping into a Pokemon and coming back lands where you left off.
 */
export function useScrollMemory(key: string, ready: boolean): void {
  const restored = useRef(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = (): void => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sticky.set(key, window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [key]);
  // A passive effect so it runs after the router's scroll-to-top on route change.
  useEffect(() => {
    if (restored.current || !ready) {
      return;
    }
    restored.current = true;
    const y = sticky.get(key);
    if (typeof y === 'number' && y > 0) {
      window.scrollTo(0, y);
    }
  }, [key, ready]);
}

export function useMetaRank(): (id: string) => MetaRank | undefined {
  const { leagueInfo } = useAppState();
  return (id: string) => leagueInfo?.metaRanks[id];
}

/** The share icon, a box with an arrow out of the top: a bare glyph for an IconButton. */
export function ShareGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/** How many illegal species the "Not allowed" line names. */
const BLOCKED_NAMES = 3;

/** Matching species ids, most likely first: league-legal by meta rank, then legal but unranked
 * by name, then everything else by name. With `legalOnly`, only `leagueInfo.legal` species
 * count, and none do until the league info has loaded. Returns the sorted matches and, for
 * `legalOnly`, the ones filtered out (also sorted). */
function useSpeciesMatches(
  query: string,
  legalOnly: boolean,
  megas = true,
): { hits: string[]; blocked: string[] } {
  const s = useAppState();
  const name = useName();
  const species = useSpecies();
  const parsed = useMemo(() => parseQuery(query), [query]);
  return useMemo(() => {
    if (parsed.length === 0) {
      return { hits: [], blocked: [] };
    }
    const info = s.leagueInfo;
    const analyzable = new Set(info?.analyzable ?? []);
    const every = s.data?.allSpecies ?? [];
    const all = megas ? every : every.filter((id) => !species(id)?.megaOf);
    const ctx = familyContext(all, name, species);
    const matched = all.filter((id) =>
      matchesQuery(parsed, speciesRecord(id, name(id), species(id)), ctx),
    );
    const ranks = info?.metaRanks ?? {};
    const rankOf = (id: string): number => ranks[id]?.overall ?? Number.MAX_SAFE_INTEGER;
    const order = (a: string, b: string): number =>
      Number(analyzable.has(b)) - Number(analyzable.has(a)) ||
      rankOf(a) - rankOf(b) ||
      name(a).localeCompare(name(b));
    if (!legalOnly) {
      return { hits: matched.sort(order), blocked: [] };
    }
    if (!info) {
      return { hits: [], blocked: [] };
    }
    const legal = new Set(info.legal);
    return {
      hits: matched.filter((id) => legal.has(id)).sort(order),
      blocked: matched.filter((id) => !legal.has(id)).sort(order),
    };
  }, [parsed, s.leagueInfo, s.data, name, species, legalOnly, megas]);
}

/** Species ids matching the query (see `search.ts` for the grammar: name/type words, cp/hp/star
 * filters, flags, `@move` and `+family`), league-legal ones first, capped. `allSpecies` includes
 * shadow and Mega ids (`megas: false` drops the Megas), so "dra" lists Dragonite, Shadow Dragonite and Dragonair.
 * `legalOnly` keeps only species the league in play admits (the screens where a pick must be
 * playable in it); pair it with `NothingMatches` for the empty state. */
export function useSpeciesSearch(
  query: string,
  limit = 30,
  opts: { legalOnly?: boolean | undefined; megas?: boolean | undefined } = {},
): string[] {
  const { hits } = useSpeciesMatches(query, opts.legalOnly === true, opts.megas !== false);
  return hits.slice(0, limit);
}

/** The empty state under a search grid: "Nothing matches.", or, when `legalOnly` filtered out
 * every match, which banned species the query found ("Not allowed in Retro Cup: Azumarill"). */
export function NothingMatches({
  query,
  legalOnly,
  className = 'muted small',
  style,
}: {
  query: string;
  legalOnly?: boolean | undefined;
  className?: string;
  style?: CSSProperties | undefined;
}) {
  const { blocked } = useSpeciesMatches(query, legalOnly === true);
  const name = useName();
  const league = useLeague();
  const text =
    blocked.length > 0
      ? `Not allowed in ${league.title}: ${blocked.slice(0, BLOCKED_NAMES).map(name).join(', ')}`
      : 'Nothing matches.';
  return (
    <p className={className} style={style}>
      {text}
    </p>
  );
}

/** "#18 overall" and "#5 closer" pills for a species, nothing outside the top 50. `overall`
 * false leaves out the overall-rank pill, for a row whose own line already states that rank. */
export function MetaTags({ speciesId, overall = true }: { speciesId: string; overall?: boolean }) {
  const rank = useMetaRank()(speciesId);
  const tags = metaTags(rank).filter((t) => overall || !t.endsWith(' overall'));
  if (tags.length === 0) {
    return null;
  }
  return (
    <span className="mtags">
      {tags.map((t) => (
        <span className="mtag" key={t}>
          {t}
        </span>
      ))}
    </span>
  );
}

/** The trend's arrow: an up or down triangle in the tag's own color. Decorative; the tag carries
 * the words. */
function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d={up ? 'M5 1 L9 7 L1 7 Z' : 'M5 9 L9 3 L1 3 Z'} fill="currentColor" />
    </svg>
  );
}

/** Places moved in the blended order: a win tag with an up arrow, or a loss tag with a down
 * arrow, the number alone as text and "up 3 places" as its name. Nothing for no move. */
export function TrendTag({ delta }: { delta: number | null | undefined }) {
  if (!delta) {
    return null;
  }
  const n = Math.abs(delta);
  const label = `${delta > 0 ? 'up' : 'down'} ${n} ${n === 1 ? 'place' : 'places'}`;
  return (
    <Tag tone={delta > 0 ? 'win' : 'loss'}>
      <span className="trend" role="img" aria-label={label}>
        <TrendArrow up={delta > 0} />
        {n}
      </span>
    </Tag>
  );
}

/**
 * A row's tag line: "#N meta" (the blended rank), its trend, then PvPoke's role tag ("#2 lead")
 * inside the same cutoff as `metaTags`. A species outside the blended order has no rank tag.
 * Renders bare pills, for the row's own `.mtags` span.
 */
export function MetaRankTags({
  rank,
  delta,
  role,
}: {
  rank: number | null;
  delta: number | null | undefined;
  role: MetaRank | undefined;
}) {
  const roleTags = metaTags(role).filter((t) => !t.endsWith(' overall'));
  return (
    <>
      {rank !== null ? <span className="mtag">#{rank} meta</span> : null}
      {rank !== null ? <TrendTag delta={delta} /> : null}
      {roleTags.map((t) => (
        <span className="mtag" key={t}>
          {t}
        </span>
      ))}
    </>
  );
}

/** A whole percent, but a share that is not zero never reads "0%". */
export function sharePct(share: number): string {
  if (share <= 0) {
    return '0%';
  }
  const whole = Math.round(share * 100);
  return whole === 0 ? '<1%' : `${whole}%`;
}

/** A measured share inline in a row: pink text led by the bar mark, never a pill. */
export function Share({ value }: { value: string }) {
  return (
    <span className="ui-measured-num mh-share">
      <svg className="ui-measured-bars" width={9} height={9} viewBox="0 0 11 11" aria-hidden="true">
        <rect x="0" y="6" width="3" height="5" rx="1" />
        <rect x="4" y="0" width="3" height="11" rx="1" />
        <rect x="8" y="3" width="3" height="8" rx="1" />
      </svg>
      {value}
    </span>
  );
}

/** "Same wins as best IVs" when the rank-1 IV twin would win no more meta matchups. */
export function HundoTag({ delta }: { delta: number | null }) {
  if (delta === null || delta > 0) {
    return null;
  }
  return <span className="mtag good">Same wins as best IVs</span>;
}

/** One pill for an opponent's overall rank, so you know how often you will meet it. */
export function RankTag({ rank }: { rank: number | null }) {
  if (rank === null) {
    return null;
  }
  return <span className="mtag">#{rank} overall</span>;
}

export function PokemonToken({
  speciesId,
  size = 44,
  showInitial = true,
  title,
  markedMega = false,
}: {
  speciesId: string;
  size?: number;
  showInitial?: boolean;
  title?: string;
  /** The Pokémon is marked as a Mega in the player's collection: the pill shows on its base form. */
  markedMega?: boolean;
}) {
  const sp = useSpecies()(speciesId);
  const name = useName()(speciesId);
  const spritesOn = useAppState().settings.sprites !== false;
  const types = sp ? sp.types.filter((t) => t !== 'none') : ['normal'];
  const src = spritesOn ? `/data/sprites/${speciesId.replace(/_shadow$/, '')}.webp` : undefined;
  const shadow = speciesId.endsWith('_shadow');
  // The pill needs room; a tiny token's name sits in the text beside it.
  const mega = (Boolean(sp?.megaOf) || markedMega) && size >= 32;
  // axe cannot see past the wrapper's ::before glow, so a Shadow letter's contrast is checked by
  // test/shadowToken.test.tsx for every type instead of by the page audit.
  // The Mega pill overlaps the sprite, which axe also cannot see past: its pair is checked by
  // test/contrast.test.ts.
  const audit = shadow || mega ? { 'data-audit-contrast': 'static' } : {};
  return (
    <span
      className={
        shadow ? 'token-wrap token-shadow-wrap' : mega ? 'token-wrap token-mega-wrap' : 'token-wrap'
      }
      style={shadow ? { width: size, height: size } : undefined}
      {...audit}
    >
      <SpeciesToken
        name={title ?? name}
        types={types}
        size={size}
        showInitial={showInitial}
        {...(src !== undefined ? { src } : {})}
      />
      {mega ? (
        <span className="token-mega-pill" data-audit-overhang>
          Mega
        </span>
      ) : null}
    </span>
  );
}

/** The pick3 mark: a 3 drawn in Fairy pink and Dragon violet with Fighting red terminals. */
export function Mark({ height = 22 }: { height?: number }) {
  const width = Math.round(height * (152 / 172));
  return (
    <svg width={width} height={height} viewBox="60 56 152 172" aria-hidden="true" focusable="false">
      <path
        d="M92 78 H156 a32 32 0 0 1 0 64 H136"
        fill="none"
        stroke="#D685AD"
        strokeWidth="30"
        strokeLinecap="round"
      />
      <path
        d="M136 142 H156 a32 32 0 0 1 0 64 H92"
        fill="none"
        stroke="#6F35FC"
        strokeWidth="30"
        strokeLinecap="round"
      />
      <circle cx="92" cy="78" r="15" fill="#C22E28" />
      <circle cx="92" cy="206" r="15" fill="#C22E28" />
    </svg>
  );
}

/** The community meta site: still used for the action-row link on Your Meta (the header's own
 * icon link is `SiteLink` from `@pickthree/ui` now). */
export const META_URL = 'https://meta.pick3.gg';

/** Web's `types` tuple carries a literal `'none'` for a single-typed species' absent second slot
 * (`[PokemonType, PokemonType | 'none']`, see `packages/engine/src/gamedata/types.ts`), unlike
 * meta's plain `string[]` with no such sentinel. The shared `TypeChips` has no filter for that,
 * so this thin wrapper strips `'none'` before handing the rest to the shared `TypeChip`, keeping
 * every one of web's own call sites (which pass the tuple straight through) unchanged. */
export function TypeChips({
  types,
  small,
}: {
  types: readonly (PokemonType | 'none')[];
  small?: boolean;
}) {
  return (
    <span className="tchips">
      {types
        .filter((t): t is PokemonType => t !== 'none')
        .map((t) => (
          <TypeChip key={t} type={t} small={small} />
        ))}
    </span>
  );
}

const STAT = { atk: 'Atk', def: 'Def' } as const;

function effectText(e: MoveEffect): string {
  const who = e.who === 'self' ? 'your' : "the opponent's";
  const stat = e.stat === 'atk' ? 'attack' : 'defense';
  const dir = e.stages > 0 ? 'raises' : 'lowers';
  const chance = e.chance < 1 ? ` (${Math.round(e.chance * 100)}% chance)` : '';
  return `${dir} ${who} ${stat} by ${Math.abs(e.stages)} stage${Math.abs(e.stages) === 1 ? '' : 's'}${chance}`;
}

/** Buff and debuff icons: an arrow with the stat letter. Tinted green when it helps you, amber when it hurts. */
export function EffectIcons({ effects }: { effects: MoveEffect[] }) {
  if (effects.length === 0) {
    return null;
  }
  return (
    <span className="fx" role="img" aria-label={effects.map(effectText).join('; ')}>
      {effects.map((e, i) => {
        const good = (e.who === 'self') === e.stages > 0;
        const up = e.stages > 0;
        return (
          <span key={i} className={`fx-icon ${good ? 'fx-good' : 'fx-bad'}`} title={effectText(e)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              {up ? (
                <path d="M7 1.5 L11.5 7 H8.5 V12.5 H5.5 V7 H2.5 Z" fill="currentColor" />
              ) : (
                <path d="M7 12.5 L2.5 7 H5.5 V1.5 H8.5 V7 H11.5 Z" fill="currentColor" />
              )}
            </svg>
            <b>
              {STAT[e.stat]} {up ? 'up' : 'down'}
            </b>
            {e.who === 'opponent' ? <i>opp</i> : null}
          </span>
        );
      })}
    </span>
  );
}

/** PvPoke-style move count: "4-4-3" means four fast moves, then four, then three. */
export function countsText(fastName: string, counts: number[] | null): string | null {
  if (!counts || counts.length === 0) {
    return null;
  }
  return `${counts.join('-')} ${fastName}`;
}

export const ROLE_TEXT = { lead: 'Lead', switch: 'Safe Switch', closer: 'Closer' } as const;

/** Shorter than ROLE_TEXT, for tight spots like the hero card's strip and TeamDetail's own rows. */
export const ROLE_SHORT = { lead: 'Lead', switch: 'Switch', closer: 'Closer' } as const;

export function RoleLabel({ role }: { role: 'lead' | 'switch' | 'closer' }) {
  return <span className="role">{ROLE_TEXT[role]}</span>;
}

export function TmBadge({ tm }: { tm: MoveChoice['tm'] }) {
  if (tm === 'have') {
    return <span className="tm tm-have">Has it</span>;
  }
  if (tm === 'elite') {
    return <span className="tm tm-elite">Elite TM</span>;
  }
  return <span className="tm">TM</span>;
}

export function MoveRows({
  fast,
  charged,
  reads,
  countNote,
}: {
  fast: MoveChoice;
  charged: MoveChoice[];
  /** Optional per-charged-move line, e.g. "extra damage on 31 of 48". */
  reads?: Record<string, string>;
  /** Rendered once, after the first charged move's move-count text, set off by a separator. */
  countNote?: ReactNode;
}) {
  return (
    <div className="moves">
      <div className="move-row">
        <span className="move-kind">Fast</span>
        <span className="move-main">
          <span className="move-line">
            <span className="move-name">{fast.name}</span>
            <span className="move-tags">
              <TypeChip type={fast.type} small />
              <EffectIcons effects={fast.effects} />
            </span>
          </span>
        </span>
        <TmBadge tm={fast.tm} />
      </div>
      {charged.map((m, mi) => {
        const count = countsText(fast.name, m.counts);
        const read = reads?.[m.moveId];
        const note = mi === 0 ? countNote : null;
        return (
          <div className="move-row" key={m.moveId}>
            <span className="move-kind">Charged</span>
            <span className="move-main">
              <span className="move-line">
                <span className="move-name">{m.name}</span>
                <span className="move-tags">
                  <TypeChip type={m.type} small />
                  {m.altType ? <TypeChip type={m.altType} small /> : null}
                  <EffectIcons effects={m.effects} />
                </span>
              </span>
            </span>
            <TmBadge tm={m.tm} />
            {count || read || note ? (
              <span className="move-sub">
                {count ? (
                  <span>
                    {count}
                    {note ? (
                      <>
                        {SEP}
                        {note}
                      </>
                    ) : null}
                  </span>
                ) : (
                  note
                )}
                {read ? <span>{read}</span> : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function FitTag({ fit }: { fit: 'Strong' | 'Solid' | 'Situational' | 'Weak' }) {
  return <span className={`fit fit-${fit.toLowerCase()}`}>{fit} fit</span>;
}

/** Ruling 3: Built wins, Worth building is the accent, Wait for better IVs and Not eligible are
 * neutral, Needs rescan warns. Read-only, never tapped. */
export function VerdictTag({ label }: { label: VerdictLabel }) {
  const tone: Record<VerdictLabel, TagTone> = {
    Built: 'win',
    'Worth building': 'accent',
    'Wait for better IVs': 'neutral',
    'Not eligible': 'neutral',
    'Needs rescan': 'warn',
  };
  return (
    <span className="verdict-tag" data-verdict={label}>
      <Tag tone={tone[label]}>{label}</Tag>
    </span>
  );
}

export const GLOSSARY: Record<string, string> = {
  lead: "Your first Pokémon. It fights the opponent's lead and usually decides the first shield exchange.",
  'safe switch':
    'The Pokémon you bring in when the lead matchup goes badly. It should rarely have a hard loss.',
  closer:
    'The Pokémon that finishes the battle after shields are gone, so it has to win without protection.',
  shield: 'You get two Protect Shields per battle. A shield blocks one charged move completely.',
  bait: 'Firing a cheap charged move to draw out a shield before using the expensive one.',
  'Elite TM': 'A rare item that teaches a move the Pokémon can no longer learn with a regular TM.',
  'XL Candy': 'Candy needed to power up past level 40. You collect it from catches and trades.',
  'IV rank':
    "How your Pokémon's hidden stats compare with every possible spread of that species at the league's CP cap.",
  'Move counts':
    'A move count like “4-4-3” is how many fast moves reach the charged move on its first, second and third use.',
  'back line': 'Your Safe Switch and Closer together.',
  'ABB line': 'A team built so the back line beats whatever counters the lead.',
  'Balanced ABC':
    'Three Pokémon that each cover different threats, so no single opponent beats the whole team.',
};

export function Progress({ stage, done, total }: { stage: string; done: number; total: number }) {
  const labels: Record<string, string> = {
    boot: 'Loading game data',
    eligibility: 'Checking which Pokémon fit the league',
    candidates: 'Picking the strongest candidates',
    trios: 'Trying team combinations',
    simulate: 'Simulating battles with your exact Pokémon',
    score: 'Scoring and explaining',
    verdicts: 'Judging each Pokémon',
    counters: 'Scoring every species against the meta',
    'counters-sim': 'Simulating the top 300 species against it on this phone',
    'counters-grid': 'Playing every shield pairing on this phone',
    'simulate-picks': 'Simulating an unranked pick against the meta on this phone',
  };
  return <Loading label={labels[stage] ?? stage} done={done} total={total} />;
}

/** Counted battles (not tanked, this season, after any fresh mark) for the league in play. */
export function useLogCount(): number {
  const s = useAppState();
  const battles = logBattles(
    s.sets,
    seasonsFor(s.data, s.settings.league ?? 'great'),
    s.settings,
    s.settings.league ?? 'great',
  );
  return countedBattles(battles, DEFAULT_PROFILE_OPTIONS.window).length;
}

const COG_PATH =
  'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z';

/** The settings cog every screen header carries. Opens the sheet. */
export function HeadCog() {
  const { openSheet } = useActions();
  return (
    <button type="button" className="cog head-cog" aria-label="Settings" onClick={openSheet}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d={COG_PATH} />
      </svg>
    </button>
  );
}

/** The settings gear, as a bare decorative glyph for an IconButton. */
export function CogGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d={COG_PATH} />
    </svg>
  );
}

/** A pencil over a line, the Edit glyph for an IconButton: 20px, drawn like ShareGlyph. */
export function PencilGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 21h8" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function Header({
  title,
  sub,
  onBack,
  backLabel,
  cog = true,
  extra,
  action,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  backLabel?: string;
  cog?: boolean;
  /** A row under the title that scrolls with the header, such as the set's team. */
  extra?: ReactNode;
  /** An icon button on the right, before the cog, such as Share. */
  action?: ReactNode;
}) {
  return (
    <HeaderShell
      back={
        onBack ? (
          <button type="button" className="back" onClick={onBack}>
            <Chevron dir="left" /> {backLabel ?? 'Back'}
          </button>
        ) : undefined
      }
      title={title}
      sub={sub}
      actions={
        action || cog ? (
          <>
            {action}
            {cog ? <HeadCog /> : null}
          </>
        ) : undefined
      }
      extra={extra}
    />
  );
}

/** Empty state for Teams, Collection and Counters: three full-width ways in, none paid. */
export function NoCollection({
  navigate,
}: {
  navigate: (r: { screen: 'import' | 'add' | 'build' }) => void;
}) {
  return (
    <div className="boot choices">
      <p>No collection yet. Pick a way in.</p>
      <div className="choice-card">
        <b>Add Pokémon by hand</b>
        <span className="small muted">
          Species, IVs from the appraisal screen, and CP. Three or more and pick3 builds teams.
        </span>
        <Button variant="secondary" onClick={() => navigate({ screen: 'add' })}>
          Add a Pokémon
        </Button>
      </div>
      <div className="choice-card">
        <b>Build a team from any Pokémon</b>
        <span className="small muted">
          Pick any three and get the full breakdown at realistic top-10% IVs. Nothing to enter.
        </span>
        <Button variant="secondary" onClick={() => navigate({ screen: 'build' })}>
          Build a team
        </Button>
      </div>
      <div className="choice-card">
        <b>Import your collection</b>
        <span className="small muted">
          A CSV from whatever IV checker you use, or a sheet of your own. Every Pokémon comes in at
          once.
        </span>
        <Button variant="primary" onClick={() => navigate({ screen: 'import' })}>
          Import a CSV
        </Button>
      </div>
    </div>
  );
}
