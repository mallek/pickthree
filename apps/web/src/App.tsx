import { AddPokemon } from './screens/AddPokemon.tsx';
import { Build } from './screens/Build.tsx';
import { Collection } from './screens/Collection.tsx';
import { Counters } from './screens/Counters.tsx';
import { Report } from './screens/Report.tsx';
import { Sheet } from './screens/Sheet.tsx';
import { SpecimenScreen } from './screens/Specimen.tsx';
import { TeamDetail } from './screens/TeamDetail.tsx';
import { Teams } from './screens/Teams.tsx';
import { Welcome } from './screens/Welcome.tsx';
import { useActions, useAppState, type Route } from './state/store.tsx';
import { UpdateToast } from './components/UpdateToast.tsx';

const ICONS = {
  teams: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle className="f" cx="8" cy="9" r="3.2" />
      <circle className="f" cx="16" cy="9" r="3.2" />
      <circle className="f" cx="12" cy="15.5" r="3.2" />
    </svg>
  ),
  counters: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path className="f" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  collection: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle className="f" cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h5.5M15 12h5.5" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  filters: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle className="f" cx="9" cy="7" r="2" />
      <circle className="f" cx="15" cy="12" r="2" />
      <circle className="f" cx="7" cy="17" r="2" />
    </svg>
  ),
};

function TabBar() {
  const { route, sheetOpen } = useAppState();
  const { navigate, openSheet } = useActions();
  const onTeams =
    route.screen === 'teams' ||
    route.screen === 'team' ||
    route.screen === 'build' ||
    route.screen === 'custom';
  const onCollection =
    route.screen === 'collection' || route.screen === 'specimen' || route.screen === 'add';
  return (
    <nav className="tabs" aria-label="Sections">
      <button
        type="button"
        className={`tab${onTeams && !sheetOpen ? ' on' : ''}`}
        onClick={() => navigate({ screen: 'teams' })}
      >
        {ICONS.teams}
        Teams
      </button>
      <button
        type="button"
        className={`tab${route.screen === 'counters' && !sheetOpen ? ' on' : ''}`}
        onClick={() => navigate({ screen: 'counters' })}
      >
        {ICONS.counters}
        Counters
      </button>
      <button
        type="button"
        className={`tab${onCollection && !sheetOpen ? ' on' : ''}`}
        onClick={() => navigate({ screen: 'collection' })}
      >
        {ICONS.collection}
        Collection
      </button>
      <button type="button" className={`tab${sheetOpen ? ' on' : ''}`} onClick={openSheet}>
        {ICONS.filters}
        Filters
      </button>
    </nav>
  );
}

function renderScreen(r: Route) {
  switch (r.screen) {
    case 'welcome':
      return <Welcome />;
    case 'report':
      return <Report />;
    case 'teams':
      return <Teams />;
    case 'team':
      return <TeamDetail id={r.id} />;
    case 'collection':
      return <Collection />;
    case 'specimen':
      return <SpecimenScreen id={r.id} />;
    case 'counters':
      return <Counters />;
    case 'build':
      return <Build />;
    case 'custom':
      return <TeamDetail id="custom" />;
    case 'add':
      return <AddPokemon />;
    default:
      return <Welcome />;
  }
}

export function App() {
  const s = useAppState();
  const r = s.route;
  const showTabs = r.screen !== 'welcome' && r.screen !== 'report' && r.screen !== 'add';
  const screen = renderScreen(r);
  return (
    <div className="app">
      {screen}
      {showTabs ? <TabBar /> : null}
      {s.sheetOpen ? <Sheet /> : null}
      <UpdateToast />
    </div>
  );
}
