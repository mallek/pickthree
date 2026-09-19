import { useEffect, useState, type ReactElement } from 'react';
import { PokemonToken, useName } from '../components.tsx';
import { COUNTER_ORIGIN } from '../counter.ts';

/**
 * A compact read of what has actually been logged lately, so a first-time visitor sees real
 * output before deciding whether to hand over a collection. The whole card opens meta.pick3.gg.
 *
 * The wording is deliberately "recently logged" rather than anything about what is strongest or
 * most played: this is a count of battles people chose to share, which is what the number can
 * honestly support, and it stays true as more sources feed the same API.
 *
 * Share is sightings over battles, the same denominator meta.pick3.gg uses, so the two surfaces
 * cannot disagree about the same window.
 */
const META_SITE = 'https://meta.pick3.gg';
const WINDOW_DAYS = 30;
const SHOWN = 3;

interface MetaSpecies {
  speciesId: string;
  sightings: number;
}

interface MetaResponse {
  battles?: number;
  species?: MetaSpecies[];
}

type Row = { id: string; pct: number };
type Status = 'loading' | 'ready' | 'empty' | 'unavailable';

export function MetaPreview() {
  const [status, setStatus] = useState<Status>('loading');
  const [rows, setRows] = useState<Row[]>([]);
  const name = useName();

  useEffect(() => {
    const ctrl = new AbortController();
    const until = new Date();
    const since = new Date(until.getTime() - WINDOW_DAYS * 86_400_000);
    const q = new URLSearchParams({
      league: 'great',
      since: since.toISOString(),
      until: until.toISOString(),
    });
    fetch(`${COUNTER_ORIGIN}/api/v1/meta?${q.toString()}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) {
          throw new Error(String(r.status));
        }
        return r.json() as Promise<MetaResponse>;
      })
      .then((data) => {
        const battles = data.battles ?? 0;
        const top = [...(data.species ?? [])]
          .filter((s) => s.sightings > 0)
          .sort((a, b) => b.sightings - a.sightings)
          .slice(0, SHOWN)
          .map((s) => ({ id: s.speciesId, pct: battles > 0 ? (s.sightings / battles) * 100 : 0 }));
        setRows(top);
        setStatus(top.length > 0 ? 'ready' : 'empty');
      })
      .catch((e: unknown) => {
        // An aborted fetch is this component unmounting, not a failure worth showing.
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }
        setStatus('unavailable');
      });
    return () => ctrl.abort();
  }, []);

  // The tallest row wins the reserved height, so the card never resizes between states and the
  // actions under it do not move once the network answers.
  const body = (): ReactElement => {
    if (status === 'loading') {
      return (
        <div className="mp-rows" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="mp-row" key={i}>
              <span className="mp-skel mp-skel-disc" />
              <span className="mp-mid">
                <span className="mp-skel mp-skel-name" />
                <span className="mp-bar" />
              </span>
            </div>
          ))}
        </div>
      );
    }
    if (status === 'ready') {
      return (
        <div className="mp-rows">
          {rows.map((r) => (
            <div className="mp-row" key={r.id}>
              <PokemonToken speciesId={r.id} size={32} showInitial={false} />
              <span className="mp-mid">
                <span className="mp-name">{name(r.id)}</span>
                <span className="mp-bar">
                  <span style={{ width: `${Math.max(2, Math.round(r.pct))}%` }} />
                </span>
              </span>
              <span className="mp-pct">{Math.round(r.pct)}%</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="mp-rows mp-rows-note">
        <p className="small muted" style={{ margin: 0 }}>
          {status === 'empty'
            ? 'No battles logged in this window yet. The meta site has the full picture.'
            : 'Could not load the latest numbers. The meta site has them.'}
        </p>
      </div>
    );
  };

  return (
    <a
      className="mp-card"
      href={META_SITE}
      aria-label="Recently logged battles in Great League, on the pick3 meta site"
    >
      <span className="mp-head">
        <span className="mp-kicker">Recently logged</span>
        <span className="mp-league">Great League</span>
      </span>
      {body()}
      <span className="mp-cta">Explore the live meta &rsaquo;</span>
    </a>
  );
}
