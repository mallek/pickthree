// THROWAWAY: species page as collection manager mockups. Never merged.
// Built only from markup the signed pages already use (species page, Pokemon page, Edit values).
import type { MoveChoice } from '@pickthree/engine';
import {
  Button,
  ConfirmSheet,
  Header,
  IconButton,
  Select,
  Sheet,
  Switch,
  Tag,
  Term,
} from '@pickthree/ui';
import type { ReactNode } from 'react';
import {
  CogGlyph,
  countsText,
  MoveRows,
  PencilGlyph,
  TmBadge,
  TypeChip,
  PokemonToken,
  TypeChips,
  VerdictTag,
  useName,
  useSpecies,
} from '../components.tsx';

const STROKE = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** A map pin: filled when this copy is the pin. Drawn like ShareGlyph. */
function PinGlyph({ on }: { on: boolean }) {
  return (
    <svg {...STROKE} fill={on ? 'currentColor' : 'none'}>
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
      <path d="M12 14v7" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg {...STROKE}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg {...STROKE}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

type Verdict = 'Built' | 'Worth building' | 'Wait for better IVs';

function mv(
  moveId: string,
  name: string,
  type: string,
  tm: MoveChoice['tm'],
  counts: number[] | null,
): MoveChoice {
  return {
    moveId,
    name,
    type: type as MoveChoice['type'],
    tm,
    energy: 0,
    energyGain: 0,
    turns: 0,
    countFromFast: null,
    counts,
    effects: [],
    altType: null,
  };
}

interface Copy {
  key: string;
  /** Set when the copy is a lower form of the page's species. */
  stage?: string;
  cp: number;
  rank: string;
  level: string;
  ivs: string;
  ivRank: string;
  verdict: Verdict;
  line: string;
  extra?: string;
}

const UMBREONS: Copy[] = [
  {
    key: 'u1',
    cp: 1492,
    rank: 'Rank 12',
    level: '27.5',
    ivs: '0 / 14 / 15',
    ivRank: '12 of 4096',
    verdict: 'Built',
    line: 'Top 1% for Great League. Ready to battle.',
  },
  {
    key: 'u2',
    cp: 1466,
    rank: 'Top 9%',
    level: '26',
    ivs: '4 / 12 / 13',
    ivRank: '361 of 4096',
    verdict: 'Worth building',
    line: 'Top 9% for Great League. A better one would win a little more.',
    extra: 'Lucky',
  },
];

const EEVEES: Copy[] = [
  {
    key: 'e1',
    stage: 'eevee',
    cp: 412,
    rank: 'Top 2%',
    level: '14',
    ivs: '1 / 15 / 13',
    ivRank: '74 of 4096',
    verdict: 'Worth building',
    line: 'Top 2% for Great League as Umbreon. A better one would barely change results.',
  },
  {
    key: 'e2',
    stage: 'eevee',
    cp: 655,
    rank: 'Top 21%',
    level: '22',
    ivs: '7 / 10 / 14',
    ivRank: '860 of 4096',
    verdict: 'Wait for better IVs',
    line: 'Top 21% for Great League as Umbreon.',
  },
  {
    key: 'e3',
    stage: 'eevee',
    cp: 310,
    rank: 'Top 44%',
    level: '10.5',
    ivs: '12 / 11 / 9',
    ivRank: '1802 of 4096',
    verdict: 'Wait for better IVs',
    line: 'Top 44% for Great League as Umbreon.',
  },
];

/** Best IV rank for the league first, whatever the stage. */
const BY_RANK: Copy[] = [UMBREONS[0]!, EEVEES[0]!, UMBREONS[1]!, EEVEES[1]!, EEVEES[2]!];

const SNARL = mv('SNARL', 'Snarl', 'dark', 'have', null);
const FOUL_PLAY = mv('FOUL_PLAY', 'Foul Play', 'dark', 'have', [4, 3, 4]);
const PSYCHIC = mv('PSYCHIC', 'Psychic', 'psychic', 'have', [5, 4, 4]);
const LAST_RESORT = mv('LAST_RESORT', 'Last Resort', 'normal', 'elite', [5, 4, 4]);

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="screen">
      <div className="page-head">
        <Header
          variant="sub"
          back={{ label: 'Back', onClick: () => undefined }}
          actions={
            <IconButton label="Settings" onClick={() => undefined}>
              <CogGlyph />
            </IconButton>
          }
        />
      </div>
      <div className="scroll" style={{ gap: 22 }}>
        {children}
      </div>
    </div>
  );
}

function Hero({ id, meta, pvpoke, have }: { id: string; meta: number; pvpoke: number; have: string }) {
  const name = useName();
  const species = useSpecies();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 16, alignItems: 'center' }}>
      <PokemonToken speciesId={id} size={64} />
      <div>
        <h2>{name(id)}</h2>
        <div
          className="small muted"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
        >
          <TypeChips types={species(id)?.types ?? []} small />
          <span className="mtags" style={{ marginTop: 0 }}>
            <span className="mtag">#{meta} meta</span>
            <span className="mtag">#{pvpoke} PvPoke</span>
          </span>
        </div>
        <div className="meta">{have}</div>
      </div>
    </div>
  );
}

function copyLine(c: Copy, name: (id: string) => string): string {
  return `${c.stage ? `${name(c.stage)} · ` : ''}CP ${c.cp} · ${c.rank} · Level ${c.level}${c.extra ? ` · ${c.extra}` : ''}`;
}

/** The copy the page is showing: the Pokemon page's facts card, moves and actions. */
function Loaded({
  title,
  copy,
  pinned,
  note,
  moves,
  movesTitle,
  movesNote,
  cost,
}: {
  title: string;
  copy: Copy;
  pinned: boolean;
  note?: string;
  moves: { fast: MoveChoice; charged: MoveChoice[] };
  movesTitle: string;
  movesNote: string;
  cost: ReactNode;
}) {
  const name = useName();
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h3>{title}</h3>
        <div className="card" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="meta" style={{ display: 'block' }}>
                {copyLine(copy, name)}
              </span>
              <span className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {pinned ? <Tag tone="neutral">Pinned</Tag> : null}
                <VerdictTag label={copy.verdict} />
              </span>
            </div>
            <IconButton
              label={pinned ? 'Pinned for Great League' : 'Pin for Great League'}
              onClick={() => undefined}
            >
              <PinGlyph on={pinned} />
            </IconButton>
            <IconButton label="Edit" onClick={() => undefined}>
              <PencilGlyph />
            </IconButton>
            <IconButton label="Remove from collection" onClick={() => undefined}>
              <TrashGlyph />
            </IconButton>
          </div>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">IVs · Attack / Defense / HP</span>
            <span style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {copy.ivs}
            </span>
          </div>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">IV rank for Great League</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{copy.ivRank}</span>
          </div>
          <p style={{ marginTop: 4 }}>{copy.line}</p>
          {note ? <p className="small muted">{note}</p> : null}
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <h3>{movesTitle}</h3>
        <div className="card" style={{ padding: '0 14px' }}>
          <MoveRows fast={moves.fast} charged={moves.charged} />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {movesNote}
        </p>
      </div>

      {cost}

    </>
  );
}

function Cost({ line, tiles, after }: { line: string; tiles: [string, string][]; after?: string }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3>Cost to build</h3>
      <div className="small muted">{line}</div>
      {tiles.length > 0 ? (
        <div className="stat3">
          {tiles.map(([label, value]) => (
            <div className="stat" key={label}>
              <b>{value}</b>
              <span className="meta">{label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {after ? <p className="small muted">{after}</p> : null}
    </div>
  );
}

function Yours({
  copies,
  pinned,
  shown,
  foot,
}: {
  copies: Copy[];
  pinned: string;
  shown: string;
  foot?: string;
}) {
  const name = useName();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <h3>Yours</h3>
        <IconButton label="Add one" onClick={() => undefined}>
          <PlusGlyph />
        </IconButton>
      </div>
      <div className="card sp-yours" style={{ padding: '0 14px', gap: 0 }}>
        {copies.slice(0, 3).map((c) => (
          <a
            className="spec-row sub"
            key={c.key}
            href="#/mock"
            style={{ gridTemplateColumns: '1fr auto' }}
          >
            <span className="meta" style={{ display: 'block' }}>
              {copyLine(c, name)}
            </span>
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              {c.key === pinned ? <Tag tone="neutral">Pinned</Tag> : null}
              {c.key === shown && c.key !== pinned ? <Tag tone="neutral">Shown</Tag> : null}
              <VerdictTag label={c.verdict} />
            </span>
          </a>
        ))}
      </div>
      {copies.length > 3 ? (
        <div style={{ display: 'flex', marginLeft: -8 }}>
          <Button variant="text" ariaExpanded={false}>
            Show all {copies.length}
          </Button>
        </div>
      ) : null}
      {foot ? (
        <p className="small muted" style={{ margin: 0 }}>
          {foot}
        </p>
      ) : null}
    </div>
  );
}

function MetaFacts({ share }: { share: string }) {
  return (
    <div className="card" style={{ gap: 8 }}>
      <div className="kv" style={{ alignItems: 'baseline' }}>
        <span className="muted">Share of battles</span>
        <span className="muted">{share}</span>
      </div>
      <div className="kv" style={{ alignItems: 'baseline' }}>
        <span className="muted">At tournaments</span>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Not picked</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        This meta · 1,240 GBL battles from 18 players and 212 tournament battles
      </p>
    </div>
  );
}

function Recommended({ fast, charged }: { fast: MoveChoice; charged: MoveChoice[] }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3>Recommended moves</h3>
      <div className="card" style={{ padding: '0 14px' }}>
        <MoveRows fast={fast} charged={charged} eliteOnly />
      </div>
    </div>
  );
}

function Foot({ id, covers }: { id: string; covers?: string }) {
  const name = useName();
  return (
    <>
      <div className="card">
        <Switch
          label={`Use ${name(id)} in team recommendations`}
          {...(covers ? { line: covers } : {})}
          checked
          onChange={() => undefined}
        />
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <Button variant="primary">Build around it</Button>
        <Button>Who beats it</Button>
      </div>
    </>
  );
}

/** Umbreon, holding two Umbreon and three Eevee; the best Umbreon is the pin. */
function UmbreonPinned() {
  return (
    <Shell>
      <Hero id="umbreon" meta={14} pvpoke={22} have="You have 2, and 3 Eevee that evolve into it" />
      <Loaded
        title="Your Umbreon for Great League"
        copy={UMBREONS[0]!}
        pinned
        moves={{ fast: SNARL, charged: [FOUL_PLAY, PSYCHIC] }}
        movesTitle="Its moves"
        movesNote="Teams use these moves. PvPoke runs Last Resort over Psychic: 1 Elite TM to switch."
        cost={<Cost line="Already at level 27.5." tiles={[]} />}
      />
      <Yours
        copies={BY_RANK}
        pinned="u1"
        shown="u1"
        foot="Best IV rank for Great League first. Tap one to show it."
      />
      <MetaFacts share="Not faced in this window" />
      <Recommended fast={SNARL} charged={[FOUL_PLAY, LAST_RESORT]} />
      <Foot id="umbreon" covers="Covers your 2 Umbreon and 3 Eevee." />
    </Shell>
  );
}

/** Umbreon, with the second Umbreon tapped: shown, not pinned. */
function UmbreonOther() {
  return (
    <Shell>
      <Hero id="umbreon" meta={14} pvpoke={22} have="You have 2, and 3 Eevee that evolve into it" />
      <Loaded
        title="Your Umbreon"
        copy={UMBREONS[1]!}
        pinned={false}
        moves={{
          fast: { ...SNARL, tm: 'tm' },
          charged: [
            { ...FOUL_PLAY, tm: 'tm' },
            { ...LAST_RESORT, tm: 'elite' },
          ],
        }}
        movesTitle="Recommended moves"
        movesNote="Its moves are not entered, so teams would use the recommended set. Edit to enter them."
        cost={
          <Cost
            line="Level 26 to 27.5 · includes second move unlock"
            tiles={[
              ['Stardust', '19,500'],
              ['Candy', '81'],
              ['XL Candy', '0'],
            ]}
            after="Plus 1 Elite TM."
          />
        }
      />
      <Yours
        copies={BY_RANK}
        pinned="u1"
        shown="u2"
        foot="Best IV rank for Great League first. Tap one to show it."
      />
      <MetaFacts share="Not faced in this window" />
      <Foot id="umbreon" covers="Covers your 2 Umbreon and 3 Eevee." />
    </Shell>
  );
}

/** Umbreon with no Umbreon held: the best Eevee is the pin, and it is also the pick elsewhere. */
function UmbreonFromEevee() {
  return (
    <Shell>
      <Hero id="umbreon" meta={14} pvpoke={22} have="You have 3 Eevee that evolve into it" />
      <Loaded
        title="Your Umbreon for Great League"
        copy={EEVEES[0]!}
        pinned
        note="Also your pick for Vaporeon and Sylveon. It can only evolve once."
        moves={{
          fast: { ...SNARL, tm: 'tm' },
          charged: [
            { ...FOUL_PLAY, tm: 'tm' },
            { ...LAST_RESORT, tm: 'elite' },
          ],
        }}
        movesTitle="Recommended moves"
        movesNote="An Eevee's moves change when it evolves, so teams use the recommended set."
        cost={
          <Cost
            line="Level 14 to 27 · includes second move unlock · includes 25 candy to evolve"
            tiles={[
              ['Stardust', '96,400'],
              ['Candy', '171'],
              ['XL Candy', '0'],
            ]}
            after="Plus 1 Elite TM."
          />
        }
      />
      <Yours
        copies={EEVEES}
        pinned="e1"
        shown="e1"
        foot="Best IV rank for Great League first. Tap one to show it."
      />
      <MetaFacts share="Not faced in this window" />
      <Foot id="umbreon" covers="Covers your 3 Eevee." />
    </Shell>
  );
}

const QUICK = mv('QUICK_ATTACK', 'Quick Attack', 'normal', 'have', null);
const SWIFT = mv('SWIFT', 'Swift', 'normal', 'have', [5, 5, 5]);
const BODY_SLAM = mv('BODY_SLAM', 'Body Slam', 'normal', 'elite', [5, 5, 5]);
const EEVEE_LAST_RESORT = mv('LAST_RESORT', 'Last Resort', 'normal', 'elite', [8, 8, 7]);

/** Eevee's own page: Eevee only, none of its evolutions. */
function EeveePage() {
  const asEevee = (c: Copy, rank: string, ivRank: string, verdict: Verdict, line: string): Copy => {
    const { stage: _stage, ...rest } = c;
    return { ...rest, rank, ivRank, verdict, line };
  };
  const copies = [
    asEevee(
      EEVEES[1]!,
      'Top 6%',
      '231 of 4096',
      'Worth building',
      'Top 6% for Great League. Eevee tops out at CP 1210, under the 1500 cap.',
    ),
    asEevee(EEVEES[0]!, 'Top 30%', '1240 of 4096', 'Wait for better IVs', ''),
    asEevee(EEVEES[2]!, 'Top 52%', '2133 of 4096', 'Wait for better IVs', ''),
  ];
  return (
    <Shell>
      <Hero id="eevee" meta={412} pvpoke={655} have="You have 3" />
      <Loaded
        title="Your Eevee for Great League"
        copy={copies[0]!}
        pinned
        moves={{ fast: QUICK, charged: [SWIFT] }}
        movesTitle="Its moves"
        movesNote="Teams use these moves. PvPoke runs Body Slam and Last Resort: second move unlock and 2 Elite TM to switch."
        cost={
          <Cost
            line="Level 22 to 50"
            tiles={[
              ['Stardust', '418,000'],
              ['Candy', '254'],
              ['XL Candy', '296'],
            ]}
          />
        }
      />
      <Yours
        copies={copies}
        pinned="e2"
        shown="e2"
        foot="Each Eevee is also on the page of every Pokemon it evolves into."
      />
      <MetaFacts share="Not faced in this window" />
      <Recommended fast={QUICK} charged={[BODY_SLAM, EEVEE_LAST_RESORT]} />
      <Foot id="eevee" covers="Covers your 3 Eevee." />
    </Shell>
  );
}

/** Not collected: Add one and the recommended moves, as today. */
function NotCollected() {
  return (
    <Shell>
      <Hero id="glaceon" meta={188} pvpoke={301} have="Not in your collection" />
      <div className="stack" style={{ gap: 6 }}>
        <h3>Yours</h3>
        <div className="card" style={{ gap: 10 }}>
          <span className="small muted">Scan one in Poke Genie, or add it by hand.</span>
          <Button>Add one</Button>
        </div>
      </div>
      <MetaFacts share="Not faced in this window" />
      <Recommended
        fast={mv('ICE_SHARD', 'Ice Shard', 'ice', 'tm', null)}
        charged={[
          mv('AVALANCHE', 'Avalanche', 'ice', 'tm', [4, 4, 4]),
          mv('LAST_RESORT', 'Last Resort', 'normal', 'elite', [5, 5, 4]),
        ]}
      />
      <p className="small muted" style={{ margin: '-16px 0 0' }}>
        Teams and counters assume these moves until you add one.
      </p>
      <Foot id="glaceon" />
    </Shell>
  );
}

/** Umbreon with the second copy shown and the pin being changed. */
function PinConfirm() {
  return (
    <>
      <UmbreonOther />
      <ConfirmSheet
        title="Pin this Umbreon for Great League?"
        line="pick3 pins your best Umbreon for each league. This overrides that pick for Great League and unpins the CP 1492 one, so teams use this one instead."
        confirmLabel="Pin this one"
        cancelLabel="Keep the current pin"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    </>
  );
}

const MUD_SHOT = mv('MUD_SHOT', 'Mud Shot', 'ground', 'have', null);
const WATER_GUN = mv('WATER_GUN', 'Water Gun', 'water', 'tm', null);
const HYDRO_CANNON = mv('HYDRO_CANNON', 'Hydro Cannon', 'water', 'elite', [5, 4, 5]);
const EARTHQUAKE = mv('EARTHQUAKE', 'Earthquake', 'ground', 'tm', [8, 7, 7]);
const MUDDY_WATER = mv('MUDDY_WATER', 'Muddy Water', 'water', 'tm', [4, 4, 4]);
const SLUDGE_WAVE = mv('SLUDGE_WAVE', 'Sludge Wave', 'poison', 'have', [8, 7, 7]);
const SURF = mv('SURF', 'Surf', 'water', 'tm', [5, 4, 5]);
const RECOMMENDED = new Set(['MUD_SHOT', 'HYDRO_CANNON', 'EARTHQUAKE']);
const KNOWN = new Set(['MUD_SHOT', 'HYDRO_CANNON', 'SLUDGE_WAVE']);

/** The team move picker's own option row, with a Recommended tag on PvPoke's set. */
function Option({
  move,
  role,
  disabled,
  fastName,
}: {
  move: MoveChoice;
  role: 'radio' | 'checkbox';
  disabled: boolean;
  fastName: string | null;
}) {
  const checked = KNOWN.has(move.moveId);
  const count = fastName ? countsText(fastName, move.counts) : null;
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      disabled={disabled}
      className={`move-opt${checked ? ' on' : ''}`}
    >
      <span className="move-opt-mark" aria-hidden="true" />
      <span className="move-main">
        <span className="move-line">
          <span className="move-name">{move.name}</span>
          <span className="move-tags">
            <TypeChip type={move.type} small />
            {RECOMMENDED.has(move.moveId) ? <Tag tone="accent">Recommended</Tag> : null}
          </span>
          {move.tm === 'elite' ? <TmBadge tm="elite" /> : null}
        </span>
        {count ? <span className="move-sub">{count}</span> : null}
      </span>
    </button>
  );
}

function KnownMovesPicker() {
  return (
    <div className="move-picker">
      <p className="meta move-picker-rec">Tick the moves this Swampert knows now.</p>
      <span className="move-picker-kind">Fast move</span>
      <div className="move-opts">
        {[MUD_SHOT, WATER_GUN].map((m) => (
          <Option key={m.moveId} move={m} role="radio" disabled={false} fastName={null} />
        ))}
      </div>
      <span className="move-picker-kind">Charged moves: one, or two if unlocked</span>
      <Term term="How move counts work">
        The numbers after a charged move, like 4-4-3, are how many fast moves it takes to reach that
        charged move the first, second and third time.
      </Term>
      <p className="meta">Untick one to pick another</p>
      <div className="move-opts">
        {[HYDRO_CANNON, EARTHQUAKE, MUDDY_WATER, SLUDGE_WAVE, SURF].map((m) => (
          <Option
            key={m.moveId}
            move={m}
            role="checkbox"
            disabled={!KNOWN.has(m.moveId)}
            fastName="Mud Shot"
          />
        ))}
      </div>
      <Button variant="text">Not entered</Button>
    </div>
  );
}

/** Edit: everything about one Pokemon, on the Edit values form's own parts. */
function Edit({ id, sheet }: { id: 'swampert' | 'eevee'; sheet?: boolean }) {
  const name = useName();
  const species = useSpecies();
  const eevee = id === 'eevee';
  const field = (label: string, value: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" defaultValue={value} />
    </label>
  );
  const check = (label: string, checked: boolean) => (
    <label className="row small check-row" style={{ gap: 8, alignItems: 'center' }}>
      <input type="checkbox" defaultChecked={checked} />
      {label}
    </label>
  );
  const pick = (label: string, value: string, options: string[]) => (
    <Select
      label={label}
      value={value}
      options={options.map((o) => ({ value: o, label: o }))}
      onChange={() => undefined}
    />
  );
  return (
    <div className="screen">
      <Header
        variant="sub"
        title="Edit"
        sub="Type in what the game shows you now."
        back={{ label: 'Back', onClick: () => undefined }}
        actions={
          <IconButton label="Settings" onClick={() => undefined}>
            <CogGlyph />
          </IconButton>
        }
      />
      <div className="scroll" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 8 }}>
          <b>Which Pokémon</b>
          <div className="pick-slot open" data-locked="">
            <span className="pick-body">
              <PokemonToken speciesId={id} size={40} />
              <span style={{ minWidth: 0 }}>
                <span className="spec-name">
                  {name(id)}
                  <TypeChips types={species(id)?.types ?? []} small />
                </span>
              </span>
            </span>
          </div>
          {eevee ? (
            <>
              {pick('Evolved it? Pick what it is now', 'Umbreon', [
                'Still an Eevee',
                'Vaporeon',
                'Jolteon',
                'Flareon',
                'Espeon',
                'Umbreon',
                'Leafeon',
                'Glaceon',
                'Sylveon',
              ])}
              <span className="small muted">
                It keeps its level and IVs. As an Umbreon its CP becomes 831 and its moves go back
                to not entered.
              </span>
            </>
          ) : null}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>CP</b>
          <span className="small muted">The number on the Pokémon right now.</span>
          {field('CP', eevee ? '831' : '1487')}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>IVs</b>
          <span className="small muted">
            From the appraisal screen: each bar is 0 to 15. Three full bars is 15 15 15.
          </span>
          <div className="iv-grid">
            {field('Attack', eevee ? '1' : '2')}
            {field('Defense', eevee ? '15' : '14')}
            {field('HP', '13')}
          </div>
          <div className="card" style={{ gap: 8 }}>
            <div className="kv" style={{ alignItems: 'baseline' }}>
              <span className="muted">Level, from CP and IVs</span>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{eevee ? '14' : '19.5'}</span>
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>Moves</b>
          {eevee ? (
            <>
              <span className="small muted">Not entered, so teams use the recommended moves.</span>
              <div style={{ display: 'flex', marginLeft: -8 }}>
                <Button variant="text">Enter moves</Button>
              </div>
            </>
          ) : (
            <>
              <span className="small muted">The moves it knows now. Teams use exactly these.</span>
              <div className="card" style={{ padding: '0 14px' }}>
                <MoveRows fast={MUD_SHOT} charged={[HYDRO_CANNON, SLUDGE_WAVE]} eliteOnly />
              </div>
              <div style={{ display: 'flex', marginLeft: -8 }}>
                <Button variant="text">Change moves</Button>
              </div>
            </>
          )}
        </div>

        {eevee ? null : (
          <div className="stack" style={{ gap: 8 }}>
            <b>Mega</b>
            {check('Mega-evolved before', true)}
            {pick('Mega level', 'High (level 2)', [
              'Base (level 1)',
              'High (level 2)',
              'Max (level 3)',
            ])}
          </div>
        )}

        <div className="stack" style={{ gap: 8 }}>
          <b>Other</b>
          {check('Lucky (half price to power up)', false)}
          {check('Purified', false)}
          {check('Best Buddy (one level higher in battle)', false)}
        </div>

        <button type="button" className="btn">
          Save changes
        </button>
        <p className="meta faint" style={{ margin: 0 }}>
          pick3 judges this Pokémon again when you save. A new Poke Genie import keeps what you
          enter here.
        </p>
      </div>
      {sheet ? (
        <Sheet
          root={{ id: 'moves', title: 'Swampert', render: () => <KnownMovesPicker /> }}
          onClose={() => undefined}
        />
      ) : null}
    </div>
  );
}

export function MockSpecies({ variant }: { variant: string }) {
  switch (variant) {
    case 'other':
      return <UmbreonOther />;
    case 'pin-confirm':
      return <PinConfirm />;
    case 'from-eevee':
      return <UmbreonFromEevee />;
    case 'eevee':
      return <EeveePage />;
    case 'not-collected':
      return <NotCollected />;
    case 'edit':
      return <Edit id="swampert" />;
    case 'edit-moves':
      return <Edit id="swampert" sheet />;
    case 'edit-eevee':
      return <Edit id="eevee" />;
    default:
      return <UmbreonPinned />;
  }
}
