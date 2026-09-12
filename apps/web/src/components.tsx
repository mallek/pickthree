import type { MoveChoice, PokemonType, Structure, VerdictLabel } from '@pickthree/engine';
import { useState, type ReactNode } from 'react';
import { initialOf, speciesDisplayName, typeColor } from './format.ts';
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

export function MoveRows({ fast, charged }: { fast: MoveChoice; charged: MoveChoice[] }) {
  return (
    <div className="moves">
      <div className="move-row">
        <span className="move-kind">Fast</span>
        <span className="move-name">{fast.name}</span>
        <TmBadge tm={fast.tm} />
      </div>
      {charged.map((m) => (
        <div className="move-row" key={m.moveId}>
          <span className="move-kind">Charged</span>
          <span className="move-name">{m.name}</span>
          <TmBadge tm={m.tm} />
          {m.countFromFast !== null ? (
            <span className="move-count">
              {fast.name} x{m.countFromFast}
            </span>
          ) : null}
        </div>
      ))}
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
