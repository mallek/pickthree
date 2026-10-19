/**
 * Tournaments (`#/meta/events`): one card per recent event, newest first. The list route carries
 * no champion, so each card reads its own event's detail (cached for the session) and fills in
 * the champion and their six when it lands; until then it shows the list row alone.
 */
import { champion, RECENT_DAYS, shortEventName, type EventListRowV1 } from '@pickthree/engine/meta';
import {
  Button,
  Chevron,
  Empty,
  ErrorState,
  Header,
  IconButton,
  Loading,
  Tag,
} from '@pickthree/ui';
import { CogGlyph } from '../components.tsx';
import { battlesText } from '../components/meta/boardView.ts';
import { SixRow } from '../components/meta/SixRow.tsx';
import { eventDates } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';
import { EVENT_LEAGUES, useEventDetail, useRecentEvents } from '../state/useMeta.ts';

/** One event: its own component, so each card makes its own detail read. */
function EventCard({ event }: { event: EventListRowV1 }) {
  const { navigate } = useActions();
  const detail = useEventDetail(event.id);
  const champ = detail.data ? champion(detail.data) : null;
  return (
    <div className="tb-team-row event-card">
      <button
        type="button"
        className="row-head"
        onClick={() => navigate({ screen: 'meta-event', id: event.id })}
      >
        <span className="event-card-top">
          <span className="row-text">
            <span className="row-title">{shortEventName(event.name)}</span>
            <span className="row-sub">
              {eventDates(event.startDate, event.endDate)} · {battlesText(event.battles)} on stream
            </span>
          </span>
          <Chevron dir="right" />
        </span>
        {champ ? (
          <>
            <span className="tb-fine">
              <Tag>Champion</Tag> {champ.name}
            </span>
            <SixRow six={champ.six} />
          </>
        ) : null}
      </button>
    </div>
  );
}

function EventList({ league }: { league: string }) {
  const events = useRecentEvents(league);
  if (!EVENT_LEAGUES.has(league)) {
    return <Empty line="Tournaments are Great League events. Switch to Great League to see them." />;
  }
  if (events.state === 'error') {
    return (
      <ErrorState
        line="Could not load tournaments."
        action={<Button onClick={events.retry}>Try again</Button>}
      />
    );
  }
  if (!events.data) {
    return <Loading label="Loading tournaments" />;
  }
  if (events.data.events.length === 0) {
    return <Empty line={`No tournaments in the last ${RECENT_DAYS} days`} />;
  }
  // ISO dates sort as text; a tie keeps the worker's order.
  const newest = [...events.data.events].sort((a, b) =>
    b.startDate < a.startDate ? -1 : b.startDate > a.startDate ? 1 : 0,
  );
  return (
    <div className="tb-team-rows">
      {newest.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

export function Tournaments() {
  const s = useAppState();
  const { openSheet, back } = useActions();
  return (
    <div className="screen">
      <div className="sub-head">
        <Header
          variant="sub"
          title="Tournaments"
          back={{ label: 'Back', onClick: () => back({ screen: 'meta' }) }}
          actions={
            <IconButton label="Settings" onClick={openSheet}>
              <CogGlyph />
            </IconButton>
          }
        />
      </div>
      <div className="scroll tb-board">
        <p className="tb-fine">
          Official Play! Pokémon broadcasts, read off the stream and joined to the published team
          lists.
        </p>
        {s.settingsLoaded ? (
          <EventList league={s.settings.league ?? 'great'} />
        ) : (
          <Loading label="Loading tournaments" />
        )}
      </div>
    </div>
  );
}
