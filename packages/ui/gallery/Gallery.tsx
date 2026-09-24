import { useState, type ReactNode } from 'react';
import {
  Button,
  Chip,
  ConfirmSheet,
  Empty,
  ErrorState,
  ExpandRow,
  FilterButton,
  Header,
  IconButton,
  LeagueSwitcher,
  Loading,
  MeasuredLine,
  MeasuredValue,
  ProgressCard,
  Select,
  Sheet,
  Tag,
  Term,
  Toast,
  TypeChips,
  type SheetPage,
} from '../src/index.ts';

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="g-section" data-gallery={name}>
      <h2>{name}</h2>
      {children}
    </section>
  );
}

const COG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
  </svg>
);

const TOKENS = [
  'bg',
  'surface',
  'surface2',
  'accent',
  'measured',
  'win',
  'loss',
  'tanked',
  'warn',
  'danger',
];

const LEAGUES = [
  { value: 'great', label: 'Great' },
  { value: 'ultra', label: 'Ultra' },
  { value: 'master', label: 'Master' },
];

const LEAGUES_FOUR = [...LEAGUES, { value: 'championshipseries', label: 'Tournament' }];

const ABOUT: SheetPage = {
  id: 'about',
  title: 'About',
  render: () => <p className="g-note">PvPoke data, updated Sep 10, 2026.</p>,
};
const SETTINGS: SheetPage = {
  id: 'settings',
  title: 'Settings',
  render: (nav) => (
    <Button variant="secondary" onClick={() => nav.push(ABOUT)}>
      About
    </Button>
  ),
};

export function Gallery() {
  const [chips, setChips] = useState({ all: true, own: false, radar: false });
  const [league, setLeague] = useState('great');
  const [windowPick, setWindowPick] = useState('meta');
  const [openRow, setOpenRow] = useState(true);
  return (
    <main className="g-page">
      <Section name="Tokens">
        <div className="g-swatches">
          {TOKENS.map((t) => (
            <div
              key={t}
              className="g-swatch"
              style={{ boxShadow: `inset 0 28px 0 var(--${t})` }}
            >
              --{t}
            </div>
          ))}
        </div>
      </Section>

      <Section name="Button">
        <Button variant="primary">Analyze this team</Button>
        <Button variant="secondary">Change team</Button>
        <Button variant="text">View analysis</Button>
        <Button variant="danger">Forget my collection and log</Button>
        <Button variant="primary" disabled>
          Analyze when complete
        </Button>
        <Button variant="secondary">
          Build from your Rookidee and see what it beats in Great League
        </Button>
      </Section>

      <Section name="IconButton">
        <div className="g-row">
          <IconButton label="Settings" onClick={() => undefined}>
            {COG}
          </IconButton>
          <IconButton label="Filters on" onClick={() => undefined} active>
            {COG}
          </IconButton>
          <IconButton label="Open meta.pick3.gg" href="#meta">
            {COG}
          </IconButton>
        </div>
      </Section>

      <Section name="Chip">
        <div className="g-row">
          <Chip on={chips.all} onClick={() => setChips((c) => ({ ...c, all: !c.all }))}>
            All
          </Chip>
          <Chip on={chips.own} onClick={() => setChips((c) => ({ ...c, own: !c.own }))}>
            You own
          </Chip>
          <Chip on={chips.radar} onClick={() => setChips((c) => ({ ...c, radar: !c.radar }))}>
            Under the radar
          </Chip>
          <Chip onClick={() => undefined}>Build from your Rookidee</Chip>
        </div>
      </Section>

      <Section name="Tag">
        <div className="g-row">
          <Tag tone="accent">Strong fit</Tag>
          <Tag>Balanced ABC</Tag>
          <Tag tone="win">Worth building</Tag>
          <Tag tone="warn">Wait for better IVs</Tag>
          <Tag tone="loss">Not eligible</Tag>
          <Tag tone="tanked">Tanked</Tag>
          <Tag>yours</Tag>
          <Tag>Outside PvPoke&apos;s 48</Tag>
        </div>
      </Section>

      <Section name="TypeChip">
        <TypeChips types={['fairy', 'steel', 'psychic', 'ice', 'ghost', 'dragon']} />
        <TypeChips types={['fighting', 'water']} small />
      </Section>

      <Section name="LeagueSwitcher">
        <LeagueSwitcher label="League" value={league} onChange={setLeague} options={LEAGUES} />
        <LeagueSwitcher
          label="League, with more"
          value={league}
          onChange={setLeague}
          options={LEAGUES}
          more={{ label: 'More leagues and cups', onClick: () => undefined }}
        />
        <LeagueSwitcher
          label="League, four and more"
          value={league}
          onChange={setLeague}
          options={LEAGUES_FOUR}
          more={{ label: 'More leagues and cups', onClick: () => undefined }}
        />
        <LeagueSwitcher label="League, compact" value={league} onChange={setLeague} options={LEAGUES} compact />
      </Section>

      <Section name="Select">
        <div className="g-row">
          <Select
            label="Window"
            value={windowPick}
            onChange={setWindowPick}
            options={[
              { value: 'meta', label: 'This meta' },
              { value: '30', label: '30 days' },
              { value: '7', label: '7 days' },
            ]}
          />
          <Select
            label="Source"
            value="all"
            onChange={() => undefined}
            options={[
              { value: 'all', label: 'All' },
              { value: 'prior', label: 'PvPoke' },
              { value: 'ladder', label: 'GBL' },
              { value: 'tournament', label: 'Tournaments' },
            ]}
          />
        </div>
      </Section>

      <Section name="FilterButton">
        <div className="g-row">
          <FilterButton count={0} onClick={() => undefined} />
          <FilterButton count={3} onClick={() => undefined} />
        </div>
      </Section>

      <Section name="Measured">
        <div className="g-row">
          <MeasuredValue value="13%" unit="of battles" />
          <MeasuredValue value="4%" />
        </div>
        <MeasuredLine>27 anonymous battles you shared also counted</MeasuredLine>
      </Section>

      <Section name="ProgressCard">
        <ProgressCard
          title="Make these teams personal"
          done={12}
          goal={15}
          line="Log 3 more battles to weight teams by what you actually face."
          contribution="Anonymous logs also improve the live meta."
        />
        <ProgressCard title="Your log is active" done={27} goal={15} line="Recommendations reflect what you face." />
      </Section>

      <Section name="ExpandRow">
        <ExpandRow summary="Araquanid, Melmetal" open={openRow} onToggle={() => setOpenRow((o) => !o)}>
          <p className="g-note">Seen with Mimikyu, Dunsparce and Thievul.</p>
          <Button variant="text">Open in pick3</Button>
        </ExpandRow>
        <ExpandRow summary="Clodsire, Sableye with a much longer name line" open={false} onToggle={() => undefined}>
          <p className="g-note">Closed.</p>
        </ExpandRow>
      </Section>

      <Section name="Term">
        <p className="g-note">
          A balanced team, or an <Term term="ABB line">A team built so the back line beats what counters the lead.</Term>.
        </p>
      </Section>

      <Section name="Header">
        <Header
          variant="top"
          title="Your Teams"
          actions={
            <IconButton label="Settings" onClick={() => undefined}>
              {COG}
            </IconButton>
          }
        />
        <Header variant="top" title="Teams" mark={<Tag tone="accent">meta</Tag>} />
        <Header
          variant="sub"
          title="Team Analysis"
          back={{ label: 'Teams', onClick: () => undefined }}
          actions={
            <IconButton label="Share this team" onClick={() => undefined}>
              {COG}
            </IconButton>
          }
        />
      </Section>

      <Section name="Sheet">
        <div className="g-frame">
          <Sheet root={SETTINGS} onClose={() => undefined} />
        </div>
      </Section>

      <Section name="ConfirmSheet">
        <div className="g-frame">
          <ConfirmSheet
            title="Start fresh in Great League?"
            line="Your current battles move to Earlier seasons. Nothing is deleted."
            confirmLabel="Start fresh"
            cancelLabel="Keep this season"
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </div>
        <div className="g-frame">
          <ConfirmSheet
            title="Forget my collection and log?"
            line="This removes your collection, battle log and settings from this device."
            confirmLabel="Forget"
            cancelLabel="Keep everything"
            tone="danger"
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </div>
      </Section>

      <Section name="Toast">
        <div className="g-frame" style={{ minHeight: 120 }}>
          <Toast
            message="Win logged. 13 with this team."
            actionLabel="Undo"
            onAction={() => undefined}
            onDismiss={() => undefined}
            duration={0}
          />
        </div>
      </Section>

      <Section name="States">
        <Loading label="Simulating battles with your exact Pokémon" done={3} total={4} />
        <Loading label="Checking which Pokémon fit the league" />
        <Empty
          line="No team fits these filters. Loosen one to see recommendations again."
          action={<FilterButton count={3} onClick={() => undefined} />}
        />
        <ErrorState line="Could not load the shared teams. Try again in a moment." />
      </Section>
    </main>
  );
}
