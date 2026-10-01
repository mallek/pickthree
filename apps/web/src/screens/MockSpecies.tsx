// THROWAWAY: species page as collection manager mockups. Never merged.
// Built only from markup the signed pages already use (species page, Pokemon page, Edit values).
import type { MoveChoice } from '@pickthree/engine';
import { Button, Header, IconButton, Seg, Select, Switch, Tag } from '@pickthree/ui';
import type { ReactNode } from 'react';
import {
  CogGlyph,
  MoveRows,
  PokemonToken,
  TypeChips,
  VerdictTag,
  useName,
  useSpecies,
} from '../components.tsx';

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
  evolveTo,
}: {
  title: string;
  copy: Copy;
  pinned: boolean;
  note?: string;
  moves: { fast: MoveChoice; charged: MoveChoice[] };
  movesTitle: string;
  movesNote: string;
  cost: ReactNode;
  evolveTo?: string;
}) {
  const name = useName();
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h3>{title}</h3>
        <div className="card" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="meta" style={{ flex: 1 }}>
              {copyLine(copy, name)}
            </span>
            {pinned ? <Tag tone="neutral">Pinned</Tag> : null}
            <VerdictTag label={copy.verdict} />
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

      <div className="card">
        {pinned ? null : <Button>Pin for Great League</Button>}
        {evolveTo ? <Button>Evolve to {name(evolveTo)}</Button> : null}
        <Button>Edit</Button>
        <Button variant="danger">Remove from collection</Button>
      </div>
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
      <h3>Yours</h3>
      <div className="card sp-yours" style={{ padding: '0 14px', gap: 0 }}>
        {copies.map((c) => (
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
      {foot ? (
        <p className="small muted" style={{ margin: 0 }}>
          {foot}
        </p>
      ) : null}
      <div style={{ display: 'flex', marginLeft: -8 }}>
        <Button variant="text">Add one</Button>
      </div>
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
        copies={[...UMBREONS, ...EEVEES]}
        pinned="u1"
        shown="u1"
        foot="Tap one to show it. Teams use the pinned one."
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
        copies={[...UMBREONS, ...EEVEES]}
        pinned="u1"
        shown="u2"
        foot="Tap one to show it. Teams use the pinned one."
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
        evolveTo="umbreon"
      />
      <Yours
        copies={EEVEES}
        pinned="e1"
        shown="e1"
        foot="Tap one to show it. Teams use the pinned one."
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

/** Edit: everything about one Pokemon, on the Edit values form's own parts. */
function Edit() {
  const name = useName();
  const species = useSpecies();
  const id = 'swampert';
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
          <Seg
            value="normal"
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'shadow', label: 'Shadow' },
              { value: 'purified', label: 'Purified' },
            ]}
            onChange={() => undefined}
          />
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>CP</b>
          <span className="small muted">
            The number on the Pokémon right now. pick3 works out the level from CP and IVs.
          </span>
          {field('CP', '1487')}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>IVs</b>
          <span className="small muted">
            From the appraisal screen: each bar is 0 to 15. Three full bars is 15 15 15.
          </span>
          <div className="iv-grid">
            {field('Attack', '2')}
            {field('Defense', '14')}
            {field('HP', '13')}
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>Moves</b>
          <span className="small muted">
            The moves it knows now. Leave them as Not entered and teams use the recommended set.
          </span>
          {pick('Fast move', 'Mud Shot', ['Not entered', 'Mud Shot', 'Water Gun'])}
          {pick('Charged move', 'Hydro Cannon (Elite TM)', [
            'Not entered',
            'Hydro Cannon (Elite TM)',
            'Earthquake',
            'Muddy Water',
            'Sludge Wave',
            'Surf',
          ])}
          {check('Second charged move unlocked', true)}
          {pick('Second charged move', 'Earthquake', [
            'Not entered',
            'Hydro Cannon (Elite TM)',
            'Earthquake',
            'Muddy Water',
            'Sludge Wave',
            'Surf',
          ])}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>Mega</b>
          {check('Mega-evolved before', true)}
          {pick('Mega level', 'High (level 2)', [
            'Base (level 1)',
            'High (level 2)',
            'Max (level 3)',
          ])}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <b>Other</b>
          {check('Lucky (half price to power up)', false)}
          {check('Best Buddy (one level higher in battle)', false)}
          {check('Shiny (looks only)', false)}
        </div>

        <button type="button" className="btn">
          Save changes
        </button>
        <p className="meta faint" style={{ margin: 0 }}>
          pick3 works out the level from CP and IVs, then judges this Pokémon again. A new Poke
          Genie import keeps what you enter here.
        </p>
      </div>
    </div>
  );
}

export function MockSpecies({ variant }: { variant: string }) {
  switch (variant) {
    case 'other':
      return <UmbreonOther />;
    case 'from-eevee':
      return <UmbreonFromEevee />;
    case 'eevee':
      return <EeveePage />;
    case 'not-collected':
      return <NotCollected />;
    case 'edit':
      return <Edit />;
    default:
      return <UmbreonPinned />;
  }
}
