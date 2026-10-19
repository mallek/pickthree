/**
 * One tournament (`#/meta/events/<id>`): the facts, a Watch row per broadcast day, then every
 * player seen on stream, ordered by finish. One card opens at a time, and the open player rides
 * in the route (`?p=<screen name>`, replacing the entry rather than adding one per tap), so Back
 * from Build lands on the same open card with the scroll where it was.
 */
import { useMemo } from 'react';
import {
  eventPlayers,
  recentSince,
  shortEventName,
  vodUrl,
  type EventDetailV1,
} from '@pickthree/engine/meta';
import { Button, Chevron, ErrorState, Header, IconButton, Loading } from '@pickthree/ui';
import { CogGlyph, useScrollMemory } from '../components.tsx';
import { battlesText, count } from '../components/meta/boardView.ts';
import { PlayerCard } from '../components/meta/PlayerCard.tsx';
import { eventDates } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';
import { useEventDetail } from '../state/useMeta.ts';

/** Whether an event's broadcasts are still up: its end date is inside the recent window. ISO
 *  dates compare as text. */
function watchable(endDate: string): boolean {
  return endDate.slice(0, 10) >= recentSince(new Date()).slice(0, 10);
}

function EventBody({
  detail,
  id,
  p,
}: {
  detail: EventDetailV1;
  id: string;
  p: string | undefined;
}) {
  const s = useAppState();
  const { navigate } = useActions();
  const players = useMemo(() => eventPlayers(detail), [detail]);
  // Twitch keeps a broadcast about 60 days, so an event older than the recent window (a bookmark,
  // an old link) gets no Watch links at all: with no VODs, vodUrl answers null everywhere.
  const event = useMemo(
    () => (watchable(detail.event.endDate) ? detail.event : { ...detail.event, vods: [] }),
    [detail],
  );
  const battles = detail.matches.reduce((n, m) => n + m.games.length, 0);
  const league =
    s.data?.leagues.find((l) => l.id === event.league)?.title ??
    (event.league === 'great' ? 'Great League' : event.league);
  const days = [...event.vods]
    .sort((a, b) => a.day - b.day)
    .flatMap((v) => {
      const url = vodUrl(event, v.day);
      return url === null ? [] : [{ day: v.day, url }];
    });
  const wanted = p?.toLowerCase();
  const openName = players.find((pl) => pl.name.toLowerCase() === wanted)?.name ?? null;
  const toggle = (name: string): void => {
    const next = openName === name ? null : name;
    navigate(next === null ? { screen: 'meta-event', id } : { screen: 'meta-event', id, p: next }, {
      replace: true,
    });
  };
  return (
    <>
      <p className="tb-fine">
        {eventDates(event.startDate, event.endDate)} · {battlesText(battles)} from{' '}
        {count(players.length)} {players.length === 1 ? 'player' : 'players'} on stream · {league}
      </p>
      {days.length > 0 ? (
        <div className="stack">
          {days.map((v) => (
            <a key={v.day} className="action-row" href={v.url} target="_blank" rel="noreferrer">
              <span>
                <b>Watch day {v.day}</b>
                <span className="small muted">The Twitch broadcast</span>
              </span>
              <span className="chev">
                <Chevron />
              </span>
            </a>
          ))}
        </div>
      ) : null}
      <b>Players</b>
      <div className="tb-team-rows">
        {players.map((pl) => (
          <PlayerCard
            key={pl.name}
            player={pl}
            event={event}
            open={openName === pl.name}
            onToggle={() => toggle(pl.name)}
          />
        ))}
      </div>
    </>
  );
}

export function EventPage({ id, p }: { id: string; p?: string }) {
  const { openSheet, back } = useActions();
  const detail = useEventDetail(id);
  useScrollMemory(`event:${id}`, detail.data !== null);
  let body;
  if (detail.state === 'error') {
    body = (
      <ErrorState
        line="Could not load the tournament."
        action={<Button onClick={detail.retry}>Try again</Button>}
      />
    );
  } else if (!detail.data) {
    body = <Loading label="Loading the tournament" />;
  } else {
    body = <EventBody detail={detail.data} id={id} p={p} />;
  }
  return (
    <div className="screen" data-event={id}>
      <div className="sub-head">
        <Header
          variant="sub"
          title={detail.data ? shortEventName(detail.data.event.name) : 'Tournament'}
          back={{ label: 'Back', onClick: () => back({ screen: 'meta-events' }) }}
          actions={
            <IconButton label="Settings" onClick={openSheet}>
              <CogGlyph />
            </IconButton>
          }
        />
      </div>
      <div className="scroll tb-board">{body}</div>
    </div>
  );
}
