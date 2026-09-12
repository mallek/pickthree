import { Collection } from './screens/Collection.tsx';
import { Counters } from './screens/Counters.tsx';
import { Report } from './screens/Report.tsx';
import { Sheet } from './screens/Sheet.tsx';
import { SpecimenScreen } from './screens/Specimen.tsx';
import { TeamDetail } from './screens/TeamDetail.tsx';
import { Teams } from './screens/Teams.tsx';
import { Welcome } from './screens/Welcome.tsx';
import { useActions, useAppState, type Route } from './state/store.tsx';

function TabBar() {
  const { route, sheetOpen } = useAppState();
  const { navigate, openSheet } = useActions();
  const onTeams = route.screen === 'teams' || route.screen === 'team';
  const onCollection = route.screen === 'collection' || route.screen === 'specimen';
  return (
    <nav className="tabs" aria-label="Sections">
      <button
        type="button"
        className={`tab${onTeams && !sheetOpen ? ' on' : ''}`}
        onClick={() => navigate({ screen: 'teams' })}
      >
        <i />
        Teams
      </button>
      <button
        type="button"
        className={`tab diamond${route.screen === 'counters' && !sheetOpen ? ' on' : ''}`}
        onClick={() => navigate({ screen: 'counters' })}
      >
        <i />
        Counters
      </button>
      <button
        type="button"
        className={`tab round${onCollection && !sheetOpen ? ' on' : ''}`}
        onClick={() => navigate({ screen: 'collection' })}
      >
        <i />
        Collection
      </button>
      <button type="button" className={`tab square${sheetOpen ? ' on' : ''}`} onClick={openSheet}>
        <i />
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
    default:
      return <Welcome />;
  }
}

export function App() {
  const s = useAppState();
  const r = s.route;
  const showTabs = r.screen !== 'welcome' && r.screen !== 'report';
  const screen = renderScreen(r);
  return (
    <div className="app">
      {screen}
      {showTabs ? <TabBar /> : null}
      {s.sheetOpen ? <Sheet /> : null}
    </div>
  );
}
