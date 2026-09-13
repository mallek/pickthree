import type {
  MetaRank,
  MoveChoice,
  MoveEffect,
  PokemonType,
  Structure,
  VerdictLabel,
} from '@pickthree/engine';
import { useState, type ReactNode } from 'react';
import { initialOf, metaTags, speciesDisplayName, typeColor, typeLabel } from './format.ts';
import type { SpeciesLite } from './host/protocol.ts';
import { useAppState } from './state/store.tsx';

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

export function useMetaRank(): (id: string) => MetaRank | undefined {
  const { data } = useAppState();
  return (id: string) => data?.metaRanks[id];
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

/** "Same wins as a hundo" when the perfect-IV twin would win no more meta matchups. */
export function HundoTag({ delta }: { delta: number | null }) {
  if (delta === null || delta > 0) {
    return null;
  }
  return <span className="mtag good">Same wins as a hundo</span>;
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
  const types: [PokemonType, PokemonType | 'none'] = sp?.types ?? ['normal', 'none'];
  const a = typeColor(types[0]);
  const b = types[1] === 'none' ? a : typeColor(types[1]);
  const background = types[1] === 'none' ? a : `linear-gradient(135deg, ${a} 50%, ${b} 50%)`;
  return (
    <span
      className="token"
      title={title ?? name}
      aria-label={name}
      style={{ width: size, height: size, background, fontSize: Math.round(size * 0.36) }}
    >
      {showInitial ? initialOf(name) : ''}
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

/** The one way a type is shown anywhere in the app: a small chip in the type's color. */
export function TypeChip({ type, small }: { type: PokemonType; small?: boolean | undefined }) {
  return (
    <span className={`tchip${small ? ' tchip-sm' : ''}`} style={{ background: typeColor(type) }}>
      {typeLabel(type)}
    </span>
  );
}

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

const STAT = { atk: 'A', def: 'D' } as const;

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
            <b>{STAT[e.stat]}</b>
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

export function FitTag({ fit }: { fit: 'Strong' | 'Solid' | 'Situational' }) {
  return <span className={`fit fit-${fit.toLowerCase()}`}>{fit} fit</span>;
}

export function StructureTag({ structure }: { structure: Structure }) {
  return <span className="structure">{structure === 'ABB' ? 'ABB line' : 'Balanced ABC'}</span>;
}

export function VerdictChip({ label }: { label: VerdictLabel }) {
  const cls: Record<VerdictLabel, string> = {
    'Great League ready': 'v-ready',
    'Worth building': 'v-worth',
    'Wait for better IVs': 'v-wait',
    'Not eligible': 'v-no',
    'Needs rescan': 'v-rescan',
  };
  return <span className={`verdict ${cls[label]}`}>{label}</span>;
}

export function Chip({
  on,
  onClick,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Term({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="term-wrap">
      <button
        type="button"
        className="term"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {term}
      </button>
      {open ? <span className="term-tip">{children}</span> : null}
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
    "How your Pokémon's hidden stats compare with every possible spread of that species for Great League.",
  line: 'A team built so the back line beats whatever counters the lead.',
  'back line': 'Your Safe Switch and Closer together.',
};

export function Progress({ stage, done, total }: { stage: string; done: number; total: number }) {
  const labels: Record<string, string> = {
    eligibility: 'Checking which Pokémon fit Great League',
    candidates: 'Picking the strongest candidates',
    trios: 'Trying team combinations',
    simulate: 'Simulating battles with your exact Pokémon',
    score: 'Scoring and explaining',
    verdicts: 'Judging each Pokémon',
    counters: 'Scoring every species against the meta',
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

export function Header({
  title,
  sub,
  onBack,
  backLabel,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <header className="hdr">
      {onBack ? (
        <button type="button" className="back" onClick={onBack}>
          &lsaquo; {backLabel ?? 'Back'}
        </button>
      ) : (
        <span className="back-spacer" />
      )}
      <span className="hdr-title">
        <span>{title}</span>
        {sub ? <span className="hdr-sub">{sub}</span> : null}
      </span>
      <span className="back-spacer" />
    </header>
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
        <b>Import a Poke Genie export</b>
        <span className="small muted">
          If you have the CSV, upload it and every scan comes in at once.
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
