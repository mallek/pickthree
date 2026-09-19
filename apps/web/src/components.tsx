import {
  countedBattles,
  DEFAULT_PROFILE_OPTIONS,
  type MetaRank,
  type MoveChoice,
  type MoveEffect,
  type PokemonType,
  type Structure,
  type VerdictLabel,
} from '@pickthree/engine';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { metaTags, shortName, speciesDisplayName } from './format.ts';
import type { SpeciesLite } from './host/protocol.ts';
import { matchesQuery, parseQuery } from './search.ts';
import { familyContext, speciesRecord } from './searchRecords.ts';
import { useActions, useAppState } from './state/store.tsx';
import { yourMetaFrom } from './state/yourMeta.ts';
import { Chevron, HeaderShell, SpeciesToken, TypeChip } from '@pickthree/ui';

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

/**
 * useState that survives leaving and returning to a screen within the session, so filters and
 * sort on the Collection do not reset when you tap into a Pokémon and come back.
 */
export function useSticky<T>(key: string, initial: T): [T, (next: T | ((cur: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (sticky.has(key) ? (sticky.get(key) as T) : initial));
  const set = (next: T | ((cur: T) => T)): void => {
    setValue((cur) => {
      const v = typeof next === 'function' ? (next as (cur: T) => T)(cur) : next;
      sticky.set(key, v);
      return v;
    });
  };
  return [value, set];
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

/** Species ids matching the query (see `search.ts` for the grammar: name/type words, cp/hp/star
 * filters, flags, `@move` and `+family`), league-legal ones first, capped. `allSpecies` excludes
 * megas but includes shadow ids, so "dra" lists Dragonite, Shadow Dragonite and Dragonair. */
/** The share icon, a box with an arrow out of the top, as an icon button. */
export function ShareButton({ onClick, label = 'Share' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="head-cog" aria-label={label} title={label} onClick={onClick}>
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
    </button>
  );
}

export function useSpeciesSearch(query: string, limit = 30): string[] {
  const s = useAppState();
  const name = useName();
  const species = useSpecies();
  const parsed = useMemo(() => parseQuery(query), [query]);
  if (parsed.length === 0) {
    return [];
  }
  const legal = new Set(s.leagueInfo?.analyzable ?? []);
  const all = s.data?.allSpecies ?? [];
  const ctx = familyContext(all, name, species);
  const hits = all.filter((id) =>
    matchesQuery(parsed, speciesRecord(id, name(id), species(id)), ctx),
  );
  // Most likely first: league-legal species by meta rank, then legal but unranked by name,
  // then everything else by name.
  const ranks = s.leagueInfo?.metaRanks ?? {};
  const rankOf = (id: string): number => ranks[id]?.overall ?? Number.MAX_SAFE_INTEGER;
  hits.sort(
    (a, b) =>
      Number(legal.has(b)) - Number(legal.has(a)) ||
      rankOf(a) - rankOf(b) ||
      name(a).localeCompare(name(b)),
  );
  return hits.slice(0, limit);
}

/** "#18 overall" and "#5 closer" pills for a species, nothing outside the top 50. */
export function MetaTags({ speciesId }: { speciesId: string }) {
  const rank = useMetaRank()(speciesId);
  const tags = metaTags(rank);
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
}: {
  speciesId: string;
  size?: number;
  showInitial?: boolean;
  title?: string;
}) {
  const sp = useSpecies()(speciesId);
  const name = useName()(speciesId);
  const spritesOn = useAppState().settings.sprites !== false;
  const types = sp ? sp.types.filter((t) => t !== 'none') : ['normal'];
  const src = spritesOn ? `/data/sprites/${speciesId.replace(/_shadow$/, '')}.webp` : undefined;
  const shadow = speciesId.endsWith('_shadow');
  return (
    <span
      className={shadow ? 'token-shadow-wrap' : undefined}
      style={shadow ? { width: size, height: size } : undefined}
    >
      <SpeciesToken
        name={title ?? name}
        types={types}
        size={size}
        showInitial={showInitial}
        {...(src !== undefined ? { src } : {})}
      />
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

const META = 'https://meta.pick3.gg';

/** Three ascending bars, suggesting rankings: the glyph for the `MetaButton` below. Not the pick3
 * mark. On pick3's own header the pick3 mark means "home", so wearing it on a link that leaves
 * would read backwards; a destination badge should depict the destination, not the app it sits
 * in. Drawn in `currentColor` at the same stroke weight and size as this app's other head-row
 * icons (ShareButton, HeadCog: 20px, 1.8 stroke, round caps and joins), so it takes pick3's own
 * ink rather than meta's violet and looks native here. */
function MetaGlyph() {
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
      <path d="M6 18v-4" />
      <path d="M12 18V10" />
      <path d="M18 18V6" />
    </svg>
  );
}

/** The round icon button linking to the sister site, meta.pick3.gg: pick3's own `.head-cog`
 * shape (36px circle) sitting to the left of the settings cog, on all four tab-root screens
 * (Teams, Counters, Collection, Your Meta). It used to be a bordered pill with a visible "meta"
 * label, which read as a second control family next to the cog and, on Teams and Collection,
 * fought the Pokemon count already in that row; an icon in the cog's own shape reads as one
 * control family instead. It does not live in the shared `Header` used by the back-button
 * screens, which route to it a different way (Your Meta's own contextual card).
 *
 * There is no visible label, so the accessible name is the whole story: "meta, the community
 * meta", since a bare "meta" read aloud would name nothing. The glyph carries its own
 * aria-hidden. */
export function MetaButton() {
  return (
    <a
      className="head-cog meta-button"
      href={META}
      aria-label="meta, the community meta"
      title="meta, the community meta"
    >
      <MetaGlyph />
    </a>
  );
}

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
}: {
  fast: MoveChoice;
  charged: MoveChoice[];
  /** Optional per-charged-move line, e.g. "extra damage on 31 of 48". */
  reads?: Record<string, string>;
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
            <TmBadge tm={fast.tm} />
          </span>
        </span>
      </div>
      {charged.map((m) => {
        const count = countsText(fast.name, m.counts);
        const read = reads?.[m.moveId];
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
                <TmBadge tm={m.tm} />
              </span>
              {count || read ? (
                <span className="move-sub">
                  {count ? <span>{count}</span> : null}
                  {read ? <span>{read}</span> : null}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FitTag({ fit }: { fit: 'Strong' | 'Solid' | 'Situational' | 'Weak' }) {
  return <span className={`fit fit-${fit.toLowerCase()}`}>{fit} fit</span>;
}

export function StructureTag({ structure }: { structure: Structure }) {
  return <span className="structure">{structure === 'ABB' ? 'ABB line' : 'Balanced ABC'}</span>;
}

export function VerdictChip({ label }: { label: VerdictLabel }) {
  const cls: Record<VerdictLabel, string> = {
    'Ready to use': 'v-ready',
    'Worth building': 'v-worth',
    'Wait for better IVs': 'v-wait',
    'Not eligible': 'v-no',
    'Needs rescan': 'v-rescan',
  };
  return <span className={`verdict ${cls[label]}`}>{label}</span>;
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
  line: 'A team built so the back line beats whatever counters the lead.',
  'back line': 'Your Safe Switch and Closer together.',
};

export function Progress({ stage, done, total }: { stage: string; done: number; total: number }) {
  const labels: Record<string, string> = {
    eligibility: 'Checking which Pokémon fit the league',
    candidates: 'Picking the strongest candidates',
    trios: 'Trying team combinations',
    simulate: 'Simulating battles with your exact Pokémon',
    score: 'Scoring and explaining',
    verdicts: 'Judging each Pokémon',
    counters: 'Scoring every species against the meta',
    'counters-sim': 'Simulating the top 300 species against it on this phone',
    'simulate-picks': 'Simulating an unranked pick against the meta on this phone',
  };
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress" role="status">
      <div className="progress-label">{labels[stage] ?? stage}</div>
      <div className="progress-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Counted battles (not tanked, this season, after any fresh mark) for the league in play. */
export function useLogCount(): number {
  const s = useAppState();
  const m = yourMetaFrom(s.sets, s.data?.seasons ?? [], s.settings, s.settings.league ?? 'great');
  return countedBattles(m.battles, DEFAULT_PROFILE_OPTIONS.window).length;
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
  navigate: (r: { screen: 'welcome' | 'add' | 'build' }) => void;
}) {
  return (
    <div className="boot choices">
      <p>No collection yet. Pick a way in.</p>
      <div className="choice-card">
        <b>Add Pokémon by hand</b>
        <span className="small muted">
          Species, IVs from the appraisal screen, and CP. Three or more and pick3 builds teams.
        </span>
        <button type="button" className="btn" onClick={() => navigate({ screen: 'add' })}>
          Add a Pokémon
        </button>
      </div>
      <div className="choice-card">
        <b>Build a team from any Pokémon</b>
        <span className="small muted">
          Pick any three and get the full breakdown at realistic top-10% IVs. Nothing to enter.
        </span>
        <button type="button" className="btn" onClick={() => navigate({ screen: 'build' })}>
          Build a team
        </button>
      </div>
      <div className="choice-card">
        <b>Import your collection</b>
        <span className="small muted">
          A CSV from whatever IV checker you use, or a sheet of your own. Every Pokémon comes in at
          once.
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate({ screen: 'welcome' })}
        >
          Import a CSV
        </button>
      </div>
    </div>
  );
}
