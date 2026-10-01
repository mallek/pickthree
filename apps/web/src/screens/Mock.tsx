// THROWAWAY: design mockups for the meta-in-pick3 brainstorm. Never merged.
// Built only from markup the signed pages already use (Your Meta, Collection, Specimen).
import {
  Button,
  Chevron,
  Chip,
  FilterButton,
  Header,
  IconButton,
  InlineSelect,
  MeasuredLine,
  MeasuredValue,
  Seg,
  Switch,
  Tag,
  TypeChip,
  TypeChips,
} from '@pickthree/ui';
import { CogGlyph, PokemonToken, VerdictTag, useName, useSpecies } from '../components.tsx';
import { LeagueSwitcher } from '../components/LeagueSwitcher.tsx';
import { CollectionFilters } from './CollectionFilters.tsx';
import '../mock.css';

/** The measured mark inline, for a share inside a meta line. */
function Pink({ children }: { children: string }) {
  return (
    <span className="ui-measured-num" style={{ display: 'inline-flex', gap: 4 }}>
      <svg className="ui-measured-bars" width={9} height={9} viewBox="0 0 11 11" aria-hidden="true">
        <rect x="0" y="6" width="3" height="5" rx="1" />
        <rect x="4" y="0" width="3" height="11" rx="1" />
        <rect x="8" y="3" width="3" height="8" rx="1" />
      </svg>
      {children}
    </span>
  );
}

const FACED: { id: string; faced: number; rec: string; everyone: string }[] = [
  { id: 'cramorant', faced: 4, rec: '1-3', everyone: '13%' },
  { id: 'tinkaton', faced: 3, rec: '2-1', everyone: '12%' },
  { id: 'clodsire', faced: 2, rec: '2-0', everyone: '8%' },
  { id: 'melmetal', faced: 1, rec: '0-1', everyone: '9%' },
  { id: 'azumarill', faced: 1, rec: '1-0', everyone: '6%' },
];

const YOUR_TEAMS: { ids: string[]; battles: string; rec: string }[] = [
  { ids: ['feraligatr', 'dunsparce', 'stunfisk_galarian'], battles: '11 battles', rec: '7-4' },
];

const TOP_TEAMS: { ids: string[]; battles: string; rec: string }[] = [
  { ids: ['araquanid', 'melmetal', 'mimikyu'], battles: '60 battles', rec: '41-19' },
  { ids: ['araquanid', 'clodsire', 'umbreon'], battles: '25 battles', rec: '16-9' },
  { ids: ['clodsire', 'florges', 'sableye_shadow'], battles: 'seen 17 times', rec: '13-2' },
];

function TeamRow({ ids, battles, rec }: { ids: string[]; battles: string; rec: string }) {
  return (
    <button type="button" className="team-row">
      <span className="row" style={{ gap: 4 }}>
        {ids.map((id) => (
          <PokemonToken speciesId={id} size={32} showInitial={false} key={id} />
        ))}
      </span>
      <span className="meta">{battles}</span>
      <b>{rec}</b>
    </button>
  );
}

const SEEN: { id: string; pct: number }[] = [
  { id: 'cramorant', pct: 13 },
  { id: 'tinkaton', pct: 12 },
  { id: 'melmetal', pct: 9 },
  { id: 'clodsire', pct: 8 },
  { id: 'azumarill', pct: 6 },
];

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function MockMeta({ log }: { log: boolean }) {
  const name = useName();
  return (
    <div className="screen">
      <div className="page-head">
        <Header
          variant="top"
          title="Meta"
          actions={
            <IconButton label="Settings" onClick={() => undefined}>
              <CogGlyph />
            </IconButton>
          }
        />
        <LeagueSwitcher />
      </div>
      <div className="scroll" style={{ gap: 14 }}>
        <div>
          <h2 className="m3-title">What trainers are facing</h2>
          <p className="meta m3-sub">A community snapshot, built from shared battle logs.</p>
          <Chip onClick={() => undefined}>Great League · This meta</Chip>
        </div>

        <div className="m3-card">
          <div className="m3-card-head">
            <b>Most seen Pokémon</b>
            <span className="meta">Share of reported battles</span>
          </div>
          <div>
            {SEEN.map((r) => (
              <a className="m3-seen" key={r.id} href={`#/mock/species/${r.id}`}>
                <PokemonToken speciesId={r.id} size={36} showInitial={false} />
                <span className="m3-seen-name">
                  <span>{name(r.id)}</span>
                  <span className="m3-bar">
                    <span style={{ width: `${(r.pct / 13) * 100}%` }} />
                  </span>
                </span>
                <Pink>{`${r.pct}%`}</Pink>
                <span className="m3-go">
                  <Chevron />
                </span>
              </a>
            ))}
          </div>
          <a className="m3-more" href="#/mock/notcollected">
            Explore Pokémon <Arrow />
          </a>
        </div>

        {!log ? (
          <>
            <div className="m3-card">
              <div className="m3-card-head">
                <b>Most logged teams</b>
              </div>
              {TOP_TEAMS.slice(0, 2).map((t) => (
                <TeamRow key={t.ids.join()} {...t} />
              ))}
              <span className="meta">Results from trainers logging their own teams.</span>
              <a className="m3-more" href="#/mock/meta">
                Explore teams <Arrow />
              </a>
            </div>

            <div className="m3-card m3-accent">
              <div className="m3-card-head">
                <b>Help build the meta</b>
                <span className="meta">
                  Log your team, opponents and result to add to the community picture.
                </span>
              </div>
              <Switch label="Share battles anonymously" checked onChange={() => undefined} />
              <Button variant="primary">Log a battle</Button>
              <span className="meta" style={{ textAlign: 'center' }}>
                No collection import needed.
              </span>
            </div>

            <div className="m3-card">
              <div className="m3-card-head">
                <b>Your meta</b>
              </div>
              <p className="meta m3-empty">Your battle history will appear here.</p>
            </div>
          </>
        ) : (
          <>
            <div className="m3-card m3-accent">
              <div className="m3-card-head">
                <b>Your contribution</b>
              </div>
              <MeasuredLine>9 of your battles are in the community meta</MeasuredLine>
              <Switch label="Share battles anonymously" checked onChange={() => undefined} />
              <div className="between">
                <b>Current team</b>
                <b>7-4</b>
              </div>
              <div className="m3-team3">
                {['feraligatr', 'dunsparce', 'stunfisk_galarian'].map((id) => (
                  <span key={id}>
                    <PokemonToken speciesId={id} size={52} showInitial={false} />
                    <span className="small">{name(id)}</span>
                  </span>
                ))}
              </div>
              <Button variant="primary">Log a battle</Button>
              <div className="ym-team-actions">
                <Button variant="text">Change team</Button>
                <Button variant="text">Share team</Button>
              </div>
            </div>

            <div className="m3-card">
              <div className="between">
                <b style={{ fontSize: 17 }}>Your meta</b>
                <span className="meta">11 battles this run</span>
              </div>
              <div className="m3-progress">
                <span className="small">11 / 15 battles</span>
                <div className="ui-progress-bar" role="progressbar" aria-valuenow={73}>
                  <span style={{ width: '73%' }} />
                </div>
                <span className="meta">
                  4 more unlock personal weighting for Teams, Counters and Build.
                </span>
              </div>
              <Seg
                value="faced"
                onChange={() => undefined}
                options={[
                  { value: 'faced', label: 'Most faced' },
                  { value: 'losses', label: 'Worst record' },
                ]}
              />
              <div className="stack" style={{ gap: 6 }}>
                {FACED.slice(0, 2).map((r) => (
                  <a className="faced-row" key={r.id} href={`#/mock/species/${r.id}`}>
                    <PokemonToken speciesId={r.id} size={36} />
                    <span className="faced-name">
                      <span className="faced-title">
                        <span className="spec-name">{name(r.id)}</span>
                      </span>
                      <span className="meta">Faced {r.faced} times</span>
                    </span>
                    <b className="faced-rec">{r.rec}</b>
                    <span className="faced-go">
                      <Chevron />
                    </span>
                  </a>
                ))}
              </div>
              <a className="m3-more" href="#/mock/metalog">
                View your battle history <Arrow />
              </a>
            </div>

            <div className="m3-card">
              <div className="m3-card-head">
                <b>Most logged teams</b>
              </div>
              {TOP_TEAMS.slice(0, 2).map((t) => (
                <TeamRow key={t.ids.join()} {...t} />
              ))}
              <a className="m3-more" href="#/mock/metalog">
                Explore teams <Arrow />
              </a>
            </div>
          </>
        )}

        <p className="meta" style={{ textAlign: 'center' }}>
          Community data reflects shared logs.
        </p>
      </div>
    </div>
  );
}

function CollectionHead({ view }: { view: 'have' | 'not' }) {
  return (
    <>
      <div className="page-head flow">
        <Header
          variant="top"
          title="Collection"
          actions={
            <IconButton label="Settings" onClick={() => undefined}>
              <CogGlyph />
            </IconButton>
          }
        />
        <LeagueSwitcher />
      </div>
      <div className="sticky-bar">
        <div className="search-row">
          <div className="search-wrap">
            <input
              className="search"
              type="search"
              placeholder={view === 'have' ? 'Search your Pokémon' : 'Search every Pokémon'}
            />
          </div>
          <FilterButton iconOnly count={0} onClick={() => undefined} />
        </div>
      </div>
    </>
  );
}

function CollectionSwitch({ view }: { view: 'have' | 'not' }) {
  return (
    <Seg
      value={view}
      options={[
        { value: 'have', label: 'Collected' },
        { value: 'not', label: 'Not collected' },
      ]}
      onChange={(v) => {
        window.location.hash = v === 'have' ? '#/mock/collection' : '#/mock/notcollected';
      }}
    />
  );
}

const HAVE: {
  id: string;
  cp: number;
  rank: string;
  verdict: 'Built' | 'Worth building' | 'Wait for better IVs';
  tags: string[];
  more?: string;
}[] = [
  {
    id: 'azumarill',
    cp: 1491,
    rank: 'Top 1%',
    verdict: 'Built',
    tags: ['#4 overall', '#2 lead'],
    more: '2 more, next Top 4%',
  },
  { id: 'feraligatr', cp: 1498, rank: 'Top 2%', verdict: 'Built', tags: ['#19 overall'] },
  { id: 'stunfisk_galarian', cp: 1477, rank: 'Top 3%', verdict: 'Built', tags: ['#9 overall'] },
  { id: 'dunsparce', cp: 1500, rank: 'Top 4%', verdict: 'Worth building', tags: ['#12 overall'] },
  { id: 'medicham', cp: 1446, rank: 'Top 9%', verdict: 'Worth building', tags: ['#21 overall'] },
  { id: 'registeel', cp: 1493, rank: 'Top 5%', verdict: 'Worth building', tags: [] },
  {
    id: 'lanturn',
    cp: 1103,
    rank: 'Top 12%',
    verdict: 'Wait for better IVs',
    tags: ['#30 overall'],
  },
];

type Row = {
  id: string;
  rank: number;
  delta: number;
  owned?: { cp: number; top: string; verdict: 'Built' | 'Worth building' | 'Wait for better IVs'; more?: string };
};

const ROWS: Row[] = [
  { id: 'azumarill', rank: 6, delta: 2, owned: { cp: 1491, top: 'Top 1%', verdict: 'Built', more: '2 more, next Top 4%' } },
  { id: 'feraligatr', rank: 14, delta: -3, owned: { cp: 1498, top: 'Top 2%', verdict: 'Built' } },
  { id: 'stunfisk_galarian', rank: 9, delta: 0, owned: { cp: 1477, top: 'Top 3%', verdict: 'Built' } },
  { id: 'dunsparce', rank: 10, delta: 4, owned: { cp: 1500, top: 'Top 4%', verdict: 'Worth building' } },
  { id: 'medicham', rank: 22, delta: 0, owned: { cp: 1446, top: 'Top 9%', verdict: 'Worth building' } },
  { id: 'registeel', rank: 25, delta: -1, owned: { cp: 1493, top: 'Top 5%', verdict: 'Worth building' } },
  { id: 'lanturn', rank: 31, delta: 0, owned: { cp: 1103, top: 'Top 12%', verdict: 'Wait for better IVs' } },
  { id: 'cramorant', rank: 1, delta: 3 },
  { id: 'tinkaton', rank: 2, delta: 11 },
  { id: 'melmetal', rank: 3, delta: -1 },
  { id: 'mimikyu', rank: 4, delta: 6 },
  { id: 'clodsire', rank: 5, delta: -3 },
  { id: 'corsola_galarian', rank: 7, delta: 0 },
  { id: 'quagsire_shadow', rank: 8, delta: -5 },
  { id: 'skeledirge', rank: 11, delta: 9 },
  { id: 'araquanid', rank: 12, delta: 0 },
];

function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ marginRight: 3 }}>
      <path d={up ? 'M5 1 L9 7 L1 7 Z' : 'M5 9 L9 3 L1 3 Z'} fill="currentColor" />
    </svg>
  );
}

function Trend({ delta }: { delta: number }) {
  if (delta === 0) {
    return null;
  }
  return (
    <Tag tone={delta > 0 ? 'win' : 'loss'}>
      <span aria-label={`${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} places`} style={{ display: 'inline-flex', alignItems: 'center' }}>
        <TrendArrow up={delta > 0} />
        {Math.abs(delta)}
      </span>
    </Tag>
  );
}

export function MockCollection({ fresh, filters, bymeta }: { fresh: boolean; filters: boolean; bymeta: boolean }) {
  const name = useName();
  const rows = fresh
    ? ROWS.filter((r) => !r.owned).sort((a, b) => a.rank - b.rank)
    : bymeta
      ? [...ROWS].sort((a, b) => a.rank - b.rank)
      : ROWS;
  return (
    <div className="screen">
      <div className="page-head flow">
        <Header
          variant="top"
          title="Collection"
          actions={
            <IconButton label="Settings" onClick={() => undefined}>
              <CogGlyph />
            </IconButton>
          }
        />
        <LeagueSwitcher />
      </div>
      <div className="sticky-bar">
        <div className="search-row">
          <div className="search-wrap">
            <input className="search" type="search" placeholder="Search Pokémon" />
          </div>
          <FilterButton iconOnly count={0} onClick={() => undefined} />
        </div>
      </div>
      <div className="page-head flow under">
        {fresh ? null : (
          <div className="chips tight">
            {['Built', 'Worth it', 'Wait for IVs', 'Rescan'].map((c) => (
              <Chip key={c} onClick={() => undefined}>
                {c}
              </Chip>
            ))}
          </div>
        )}
        <div className="sort-row">
          <span className="meta">
            {fresh ? '142 Pokémon in Great League' : '212 Pokémon · 96 kinds · 142 not collected'}
          </span>
          <InlineSelect
            label="Sort"
            value="v"
            options={[{ value: 'v', label: fresh || bymeta ? 'Meta' : 'Verdict' }]}
            onChange={() => undefined}
          />
        </div>
      </div>
      <div className="scroll" style={{ gap: 0, paddingTop: 4 }}>
        {rows.map((r) => (
          <div className="spec-group" key={r.id}>
            <a className="spec-row" href={`#/mock/species/${r.id}`}>
              <PokemonToken speciesId={r.id} size={44} />
              <span style={{ minWidth: 0 }}>
                <span className="spec-name">
                  {name(r.id).replace(/^Shadow /, '')}
                  {r.id.endsWith('_shadow') ? <span className="shadow-flag">Shadow</span> : null}
                </span>
                {r.owned ? (
                  <span className="meta" style={{ display: 'block' }}>
                    CP {r.owned.cp} · {r.owned.top}
                  </span>
                ) : null}
                <span className="mtags">
                  <span className="mtag">#{r.rank} meta</span>
                  <Trend delta={r.delta} />
                </span>
              </span>
              {r.owned ? (
                <VerdictTag label={r.owned.verdict} />
              ) : fresh ? (
                <span />
              ) : (
                <Tag tone="neutral">Not collected</Tag>
              )}
            </a>
            {r.owned?.more ? (
              <button type="button" className="more-btn">
                {r.owned.more}
                <Chevron dir="down" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {filters ? <CollectionFilters onClose={() => (window.location.hash = '#/mock/collection')} /> : null}
    </div>
  );
}

const NOT: { id: string; pvp: string; share: string; of: string }[] = [
  { id: 'cramorant', pvp: '#4 PvPoke', share: '13%', of: '14 of 109 battles' },
  { id: 'tinkaton', pvp: '#19 PvPoke', share: '12%', of: '13 of 109 battles' },
  { id: 'melmetal', pvp: '#7 PvPoke', share: '9%', of: '10 of 109 battles' },
  { id: 'mimikyu', pvp: '#28 PvPoke', share: '9%', of: '10 of 109 battles' },
  { id: 'clodsire', pvp: '#2 PvPoke', share: '8%', of: '9 of 109 battles' },
  { id: 'corsola_galarian', pvp: '#11 PvPoke', share: '7%', of: '8 of 109 battles' },
  { id: 'quagsire_shadow', pvp: '#3 PvPoke', share: '6%', of: '7 of 109 battles' },
  { id: 'skeledirge', pvp: '#41 PvPoke', share: '5%', of: '5 of 109 battles' },
  { id: 'araquanid', pvp: '#16 PvPoke', share: '4%', of: '4 of 109 battles' },
];

export function MockNotCollected() {
  const name = useName();
  const species = useSpecies();
  return (
    <div className="screen">
      <CollectionHead view="not" />
      <div className="page-head flow under">
        <div className="sort-row">
          <CollectionSwitch view="not" />
          <InlineSelect
            label="Sort"
            value="meta"
            options={[{ value: 'meta', label: 'Meta' }]}
            onChange={() => undefined}
          />
        </div>
      </div>
      <div className="scroll" style={{ gap: 0, paddingTop: 4 }}>
        <p className="meta" style={{ margin: '4px 0 0' }}>
          142 legal here, not in your collection · PvPoke 36% · Tournaments 37% · GBL 27%
        </p>
        {NOT.map((n) => (
          <div className="spec-group" key={n.id}>
            <a className="spec-row" href={`#/mock/species/${n.id}`}>
              <PokemonToken speciesId={n.id} size={44} />
              <span style={{ minWidth: 0 }}>
                <span className="spec-name">
                  {name(n.id).replace(/^Shadow /, '')}
                  {n.id.endsWith('_shadow') ? <span className="shadow-flag">Shadow</span> : null}
                </span>
                <span className="meta" style={{ display: 'block' }}>
                  {n.pvp} · {n.of}
                </span>
                <span className="mtags">
                  <TypeChips
                    types={(species(n.id)?.types ?? []).filter((t) => t !== 'none')}
                    small
                  />
                </span>
              </span>
              <MeasuredValue value={n.share} />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

const MOVES: Record<string, { fast: [string, string]; charged: [string, string][]; pvp: string }> =
  {
    azumarill: {
      fast: ['Bubble', 'water'],
      charged: [
        ['Ice Beam', 'ice'],
        ['Play Rough', 'fairy'],
      ],
      pvp: 'Same as PvPoke recommends',
    },
    cramorant: {
      fast: ['Water Gun', 'water'],
      charged: [
        ['Aerial Ace', 'flying'],
        ['Ice Beam', 'ice'],
      ],
      pvp: 'PvPoke runs Surf over Ice Beam',
    },
  };

export function MockSpecies({ id }: { id: string }) {
  const name = useName();
  const species = useSpecies();
  const owned = id === 'azumarill';
  const types = (species(id)?.types ?? []).filter((t) => t !== 'none');
  const moves = MOVES[id] ?? MOVES.cramorant!;
  return (
    <div className="screen">
      <div className="page-head">
        <Header
          variant="sub"
          back={{ label: 'Back', onClick: () => history.back() }}
          actions={
            <IconButton label="Settings" onClick={() => undefined}>
              <CogGlyph />
            </IconButton>
          }
        />
      </div>
      <div className="scroll" style={{ gap: 22 }}>
        <div
          style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 16, alignItems: 'center' }}
        >
          <PokemonToken speciesId={id} size={64} />
          <div>
            <h2>{name(id)}</h2>
            <div
              className="small muted"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
            >
              <TypeChips types={types} small />
              <span>{owned ? '#12 in the meta · #4 PvPoke' : '#1 in the meta · #4 PvPoke'}</span>
            </div>
            <div className="meta">{owned ? 'You have 3' : 'Not in your collection'}</div>
          </div>
        </div>

        <div className="card" style={{ gap: 8 }}>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">Share of battles</span>
            <Pink>{owned ? '6%' : '13%'}</Pink>
          </div>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">Players went against it</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{owned ? '5-1' : '3-11'}</span>
          </div>
          <div className="kv" style={{ alignItems: 'baseline' }}>
            <span className="muted">At tournaments</span>
            <span style={{ fontSize: 15, fontWeight: 500 }}>
              {owned ? '4% of picks' : '11% of picks'}
            </span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            This meta · 109 GBL battles from 18 players and 206 tournament battles
          </p>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <h3>Yours</h3>
          {owned ? (
            <div className="card" style={{ padding: '0 14px', gap: 0 }}>
              {[
                { cp: 1491, line: 'Top 1% · Level 40', v: 'Built' as const },
                { cp: 1500, line: 'Top 4% · Level 47', v: 'Worth building' as const },
                { cp: 1384, line: 'Top 30% · Level 31', v: 'Wait for better IVs' as const },
              ].map((s) => (
                <a
                  className="spec-row sub"
                  key={s.cp}
                  href="#/mock/species/azumarill"
                  style={{ gridTemplateColumns: '1fr auto' }}
                >
                  <span className="meta" style={{ display: 'block' }}>
                    CP {s.cp} · {s.line}
                  </span>
                  <VerdictTag label={s.v} />
                </a>
              ))}
            </div>
          ) : (
            <div className="card" style={{ gap: 10 }}>
              <span className="small muted">Scan one in Poke Genie, or add it by hand.</span>
              <Button variant="primary">Add one</Button>
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <h3>Moves players ran</h3>
          <div className="card" style={{ padding: '0 14px' }}>
            <div className="moves">
              <div className="move-row">
                <span className="move-kind">Fast</span>
                <span className="move-main">
                  <span className="move-line">
                    <span className="move-name">{moves.fast[0]}</span>
                    <span className="move-tags">
                      <TypeChip type={moves.fast[1]} small />
                    </span>
                  </span>
                </span>
              </div>
              {moves.charged.map(([n, t]) => (
                <div className="move-row" key={n}>
                  <span className="move-kind">Charged</span>
                  <span className="move-main">
                    <span className="move-line">
                      <span className="move-name">{n}</span>
                      <span className="move-tags">
                        <TypeChip type={t} small />
                      </span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Seen in 14 of 16 battles with known moves. {moves.pvp}.
          </p>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <h3>Seen next to</h3>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {(owned ? ['mimikyu', 'melmetal', 'clodsire'] : ['tinkaton', 'clodsire', 'snorlax']).map(
              (t) => (
                <span className="row" key={t} style={{ gap: 6 }}>
                  <PokemonToken speciesId={t} size={28} showInitial={false} />
                  <span className="small">{name(t)}</span>
                </span>
              ),
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <Button variant="primary">Build around it</Button>
          <Button>Who beats it</Button>
        </div>
      </div>
    </div>
  );
}
