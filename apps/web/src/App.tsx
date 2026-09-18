import { useLayoutEffect } from 'react';
import { AddPokemon } from './screens/AddPokemon.tsx';
import { Build } from './screens/Build.tsx';
import { Collection } from './screens/Collection.tsx';
import { Counters } from './screens/Counters.tsx';
import { LogBattle } from './screens/LogBattle.tsx';
import { SharedTeam } from './screens/SharedTeam.tsx';
import { NewSet } from './screens/NewSet.tsx';
import { Report } from './screens/Report.tsx';
import { Sheet } from './screens/Sheet.tsx';
import { SpecimenScreen } from './screens/Specimen.tsx';
import { TeamDetail } from './screens/TeamDetail.tsx';
import { Teams } from './screens/Teams.tsx';
import { Welcome } from './screens/Welcome.tsx';
import { YourMeta } from './screens/YourMeta.tsx';
import { useActions, useAppState, type Route } from './state/store.tsx';
import { NoticeToast } from './components/NoticeToast.tsx';
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
  meta: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect className="f" x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
};

function TabBar() {
  const { route, sheetOpen } = useAppState();
  const { navigate } = useActions();
  const onTeams =
    route.screen === 'teams' ||
    route.screen === 'team' ||
    route.screen === 'build' ||
    route.screen === 'custom';
  const onCollection =
    route.screen === 'collection' || route.screen === 'specimen' || route.screen === 'add';
  const onMeta =
    route.screen === 'meta' || route.screen === 'meta-new' || route.screen === 'meta-log';
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
      <button
        type="button"
        className={`tab${onMeta && !sheetOpen ? ' on' : ''}`}
        onClick={() => navigate({ screen: 'meta' })}
      >
        {ICONS.meta}
        Your meta
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
    case 'meta':
      return <YourMeta />;
    case 'meta-new':
      return <NewSet />;
    case 'meta-log':
      return <LogBattle />;
    case 'shared':
      return <SharedTeam league={r.league} members={r.members} />;
    default:
      return <Welcome />;
  }
}

export function App() {
  const s = useAppState();
  const r = s.route;
  // Each screen opens at the top. A screen that remembers its place (the Collection) scrolls
  // back after this runs.
  const routeKey = JSON.stringify(r);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);
  const showTabs = !['welcome', 'report', 'add', 'meta-new', 'meta-log', 'shared'].includes(
    r.screen,
  );
  const screen = renderScreen(r);
  return (
    <div className="app">
      {screen}
      {showTabs ? <TabBar /> : null}
      {s.sheetOpen ? <Sheet /> : null}
      <UpdateToast />
      <NoticeToast />
    </div>
  );
}
