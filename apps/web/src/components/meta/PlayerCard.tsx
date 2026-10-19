/**
 * One player on an event page: a large `tb-team-row` whose head is their name, finish, streamed
 * games, record and six (each with how many of their games it was picked in), opening in place
 * onto the threes to build, their RK9 movesets and every game they played on stream, by match.
 */
import type { CSSProperties } from 'react';
import { useState } from 'react';
import type {
  EventDetailV1,
  EventPlayer,
  EventPlayerGame,
  EventTrio,
} from '@pickthree/engine/meta';
import { vodUrl } from '@pickthree/engine/meta';
import { Button, Chevron, Tag, TypeChip, typeColor } from '@pickthree/ui';
import {
  PlayGlyph,
  PokemonToken,
  TeamsGlyph,
  TypeChips,
  useName,
  useSpecies,
} from '../../components.tsx';
import { useActions, useAppState } from '../../state/store.tsx';
import { count } from './boardView.ts';
import { SixRow } from './SixRow.tsx';

/** The threes that show before "Show N more". */
const TOP_TRIOS = 3;

function gamesWord(n: number): string {
  return `${count(n)} ${n === 1 ? 'game' : 'games'}`;
}

/** StreamScanner's labels arrive in capitals ("GRAND FINALS"); show them in title case. */
function roundText(label: string | null): string {
  if (label === null || label.trim() === '') {
    return '';
  }
  return label.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The player's games grouped by match, matches in the order played, games by game number. */
function byMatch(played: EventPlayerGame[]): EventPlayerGame[][] {
  const groups = new Map<string, EventPlayerGame[]>();
  for (const g of played) {
    const list = groups.get(g.match.match);
    if (list) {
      list.push(g);
    } else {
      groups.set(g.match.match, [g]);
    }
  }
  return [...groups.values()].map((games) => [...games].sort((a, b) => a.game.game - b.game.game));
}

/** The threes they ran: each a Most logged teams row that opens Build with that three. */
function BuildTheseTeams({ player }: { player: EventPlayer }) {
  const name = useName();
  const { navigate, setPick } = useActions();
  const [all, setAll] = useState(false);
  // Only complete threes can be built; partial scans still count in picks and in the games below.
  const trios = player.trios.filter((t) => t.ids.length === 3);
  if (trios.length === 0) {
    return null;
  }
  const shown = all ? trios : trios.slice(0, TOP_TRIOS);
  const openInBuild = (t: EventTrio): void => {
    t.ids.forEach((id, i) => {
      const moves = player.moves[id];
      setPick(
        i,
        moves
          ? {
              kind: 'species',
              id,
              preferOwned: true,
              moves: { fast: moves.fast, charged: [...moves.charged] },
            }
          : { kind: 'species', id, preferOwned: true },
      );
    });
    navigate({ screen: 'build' });
  };
  return (
    <div className="row-part">
      <p className="row-label row-label-glyph">
        <TeamsGlyph />
        Build these teams
      </p>
      <p className="small muted">Tap a team to open it in Build.</p>
      <div className="stack">
        {shown.map((t) => {
          const rec = `${t.wins}-${t.losses}`;
          return (
            <button
              type="button"
              className="team-row team-row-go"
              key={t.ids.join('+')}
              aria-label={`${t.ids.map(name).join(', ')}: ${gamesWord(t.games)}, ${rec}`}
              onClick={() => openInBuild(t)}
            >
              <span className="row" style={{ gap: 4 }}>
                {t.ids.map((id) => (
                  <PokemonToken speciesId={id} size={32} showInitial={false} key={id} />
                ))}
              </span>
              <span className="meta">{gamesWord(t.games)}</span>
              <b>{rec}</b>
              <span className="chev">
                <Chevron />
              </span>
            </button>
          );
        })}
        {!all && trios.length > TOP_TRIOS ? (
          <Button variant="text" onClick={() => setAll(true)}>
            Show {trios.length - TOP_TRIOS} more
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Build's lineup card, read-only: the role pill says how many of their games it was picked in. */
function Movesets({ player }: { player: EventPlayer }) {
  const name = useName();
  const species = useSpecies();
  const s = useAppState();
  const moveInfo = s.data?.moves;
  const line = (id: string, kind: 'F' | 'C', key: string) => {
    const m = moveInfo?.[id];
    return (
      <span className="pick-move" key={key}>
        <i className="pick-move-k">{kind}</i>
        <span className="pick-move-name">{m?.name ?? id}</span>
        {m ? <TypeChip type={m.type} small /> : null}
      </span>
    );
  };
  return (
    <div className="row-part">
      <p className="row-label">Movesets (RK9 team list)</p>
      <div className="pick-cards">
        {player.six.map((id, i) => {
          if (id === null) {
            return null;
          }
          const types = species(id)?.types ?? ['normal', 'none'];
          const moves = player.moves[id] ?? null;
          return (
            <div
              // Slots are positional, as in the six row.
              key={i}
              className="pick-card filled pick-card-static"
              style={{ '--c1': typeColor(types[0]) } as CSSProperties}
            >
              <span className="pick-token">
                <PokemonToken speciesId={id} size={56} />
                <span className="pick-role-pill">{`${player.picks[id] ?? 0} of ${player.games}`}</span>
              </span>
              <span className="pick-card-body">
                <span className="pick-head">
                  <b className="pick-name">{name(id)}</b>
                  <TypeChips types={types} small />
                </span>
                {moves ? (
                  <span className="pick-moves">
                    {line(moves.fast, 'F', 'f')}
                    {moves.charged.map((c, j) => line(c, 'C', `c${j}`))}
                  </span>
                ) : (
                  <span className="meta">Moves not listed</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Every game they played on stream: one heading per match, then a row per game (G and its number,
 * their three, the result, the opponent's three, Watch). A scanned three carries no lead order.
 */
function GameByGame({ player, event }: { player: EventPlayer; event: EventDetailV1['event'] }) {
  const name = useName();
  return (
    <div className="row-part">
      <p className="row-label">Picks, game by game</p>
      <div className="builds">
        {byMatch(player.played).map((games) => {
          const first = games[0] as EventPlayerGame;
          const m = first.match;
          const opponent = first.side === 'left' ? m.right : m.left;
          const round = roundText(m.roundLabel);
          return (
            <div className="stack game-match" key={m.match}>
              <span className="tb-fine game-match-head">
                <b>vs {opponent}</b>
                {round ? ` · ${round}` : ''}
              </span>
              {games.map((g) => {
                const watch = vodUrl(event, m.day, g.game.at);
                const word = g.result === 'W' ? 'Win' : g.result === 'L' ? 'Loss' : null;
                return (
                  <div className="build-line" key={g.game.game}>
                    <span className="game-label">{`G${g.game.game}`}</span>
                    <span className="build-sprites" aria-label={g.mine.map(name).join(', ')}>
                      {/* A scanned three may repeat a species; position is identity. */}
                      {g.mine.map((id, i) => (
                        <PokemonToken key={i} speciesId={id} size={24} showInitial={false} />
                      ))}
                    </span>
                    {word ? (
                      <span
                        className={`result-chip result-chip-static ${word.toLowerCase()}`}
                        role="img"
                        aria-label={word}
                        // One letter is too short for axe to judge; test/contrast.test.ts checks it.
                        data-audit-contrast="static"
                      >
                        <span aria-hidden="true">{word[0]}</span>
                      </span>
                    ) : null}
                    <span
                      className="build-sprites"
                      aria-label={`against ${g.theirs.map(name).join(', ')}`}
                    >
                      {g.theirs.map((id, i) => (
                        <PokemonToken key={i} speciesId={id} size={20} showInitial={false} />
                      ))}
                    </span>
                    {watch ? (
                      <a
                        className="tb-fine game-watch"
                        href={watch}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Watch game ${g.game.game} against ${opponent}`}
                      >
                        <PlayGlyph />
                        Watch
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlayerCard({
  player,
  event,
  open,
  onToggle,
}: {
  player: EventPlayer;
  event: EventDetailV1['event'];
  open: boolean;
  onToggle: () => void;
}) {
  const counts = player.six.map((id) =>
    id === null ? null : `${player.picks[id] ?? 0}/${player.games}`,
  );
  return (
    <div className={`tb-team-row event-card player-card${open ? ' open' : ''}`}>
      <button type="button" className="row-head" onClick={onToggle} aria-expanded={open}>
        <span className="event-card-top">
          <span className="row-text">
            <span className="row-title">{player.name}</span>
            <span className="row-sub">
              {player.finish !== null ? (
                <>
                  <Tag>{player.finish}</Tag>
                  {' · '}
                </>
              ) : null}
              {count(player.games)} streamed {player.games === 1 ? 'game' : 'games'}
              {player.fromRoster ? '' : ` · ${player.seen} of 6 seen`}
            </span>
          </span>
          <span className="player-card-end">
            <span className="row-score player-record">{`${player.wins}-${player.losses}`}</span>
            <Chevron dir={open ? 'up' : 'down'} />
          </span>
        </span>
        <SixRow six={player.six} counts={counts} />
      </button>
      {open ? (
        <div className="row-body">
          {player.fromRoster ? null : (
            <p className="tb-fine">
              No team list yet: these are the Pokémon picked on stream. A ? is a Pokémon never
              picked on stream, not a missing one.
            </p>
          )}
          <BuildTheseTeams player={player} />
          {player.fromRoster ? <Movesets player={player} /> : null}
          <GameByGame player={player} event={event} />
        </div>
      ) : null}
    </div>
  );
}
