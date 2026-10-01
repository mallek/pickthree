import {
  HALF_SAY_BATTLES,
  HALF_SAY_DEVICES,
  HALF_SAY_EVENTS,
  HALF_SAY_TOURNAMENT_BATTLES,
} from '@pickthree/engine/meta';
import { battleWord, count, plural } from '../../components/meta/boardView.ts';

/**
 * How the meta is ranked: the blend behind the Meta tab and the Source picker, said in plain
 * words. Ported from meta.pick3.gg's About page; every number here is read from the engine's
 * constants, so this page cannot drift from the blend it describes. No controls, only text.
 */
export function MetaRanked() {
  return (
    <div className="settings-page">
      <section className="settings-block">
        <h4 className="settings-head">Three sources, one number</h4>
        <p className="settings-line">
          Every number in the Meta tab comes from one of three places. PvPoke keeps a curated list
          of what a league&apos;s meta looks like, made by people who play it. Official tournament
          broadcasts show what competitive players actually pick. And pick3 players share their GO
          Battle League battles. None of the three is the answer on its own, so every number is a
          blend of all three, unless you pick one source on Top teams.
        </p>
        <p className="settings-line">
          A percentage always means real battles. A projection is shown as a matchup score out of
          100, never a percentage.
        </p>
      </section>
      <section className="settings-block">
        <h4 className="settings-head">How much each source counts</h4>
        <p className="settings-line">
          How much the measured side counts depends on two things: how many battles have been
          shared, and how many different devices shared them. At {count(HALF_SAY_BATTLES)} counted{' '}
          {battleWord(HALF_SAY_BATTLES)} the measured side has half the say. At{' '}
          {count(HALF_SAY_DEVICES)} {plural(HALF_SAY_DEVICES, 'device', 'devices')} it also has half
          the say, and the smaller of the two wins. One person sharing {count(HALF_SAY_BATTLES * 3)}{' '}
          {battleWord(HALF_SAY_BATTLES * 3)} is one person&apos;s matchmaking queue, so they are
          held to a small share of the say until other people show up.
        </p>
        <p className="settings-line">
          Tournament pick share works the same way, on its own curve: at{' '}
          {count(HALF_SAY_TOURNAMENT_BATTLES)} tournament {battleWord(HALF_SAY_TOURNAMENT_BATTLES)}{' '}
          it has half the say, and at {count(HALF_SAY_EVENTS)}{' '}
          {plural(HALF_SAY_EVENTS, 'event', 'events')} it also has half the say. Tournament results
          are read off official Play! Pokémon broadcasts and joined to the published rosters. They
          are a different crowd from ladder play, so they blend into PvPoke&apos;s side first and
          recede as shared ladder battles arrive. Tournament win rates are never part of the
          ranking, only pick share.
        </p>
        <p className="settings-line">
          Nothing flips. There is no point where the list suddenly becomes measured. Every battle
          shared moves it a little, and the line under each list says how far along it is right now.
          A small count is still shown, never hidden.
        </p>
      </section>
      <section className="settings-block">
        <h4 className="settings-head">Reading the numbers</h4>
        <p className="settings-line">
          A Pokémon&apos;s &quot;#N meta&quot; tag is its place in the blended order, and the arrow
          beside it is how many places it has moved. While the season, or a cup&apos;s run, is under
          a week old, that move is counted against PvPoke&apos;s order; after that, against the
          league&apos;s own order a week earlier. There is no minimum number of battles: a quiet
          league simply moves less.
        </p>
        <p className="settings-line">
          A record is a raw win-loss count. Tanked battles are counted separately and never touch a
          record.
        </p>
      </section>
      <section className="settings-block">
        <h4 className="settings-head">What projected means</h4>
        <p className="settings-line">
          A team nobody has shared yet still gets a number, worked out on this phone from
          PvPoke&apos;s matchup data and weighted by how often each opponent is faced. No battle
          result feeds it, only which opponents matter. That is a projection, not a measurement.
          Projections cover the top few hundred Pokémon by PvPoke rank, so someone outside that list
          is counted in the measured numbers and left out of the projections.
        </p>
        <p className="settings-line">
          A move rebalance or a season turn can make older battles stop describing what you face
          now. When that happens the default window moves forward to the new starting point. Nothing
          is deleted, and the 30 day and 7 day windows still count every battle in them.
        </p>
      </section>
    </div>
  );
}
