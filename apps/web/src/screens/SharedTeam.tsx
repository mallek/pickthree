import { useEffect, useMemo, useRef } from 'react';
import { Header, Progress, useName } from '../components.tsx';
import { useActions, useAppState } from '../state/store.tsx';
import { parseTeamPath, toTeamPicks } from '../teamLink.ts';

/**
 * Landing for a team link: switches league if needed, fills Build with the three as species
 * picks, runs the analysis and hands over to the team overview. Stays only to show progress
 * or what was wrong with the link.
 */
export function SharedTeam({ league, members }: { league: string; members: string }) {
  const s = useAppState();
  const { navigate, setLeague, setPicks, analyze } = useActions();
  const name = useName();
  const parsed = useMemo(() => parseTeamPath(league, members), [league, members]);
  const started = useRef(false);

  const knownLeague = s.data?.leagues.some((l) => l.id === league) ?? false;
  const unknownSpecies =
    'team' in parsed && s.data
      ? parsed.team.picks.filter((p) => !s.data!.allSpecies.includes(p.speciesId))
      : [];
  const problem =
    'error' in parsed
      ? parsed.error
      : !s.data
        ? null
        : !knownLeague
          ? `pick3 has no league called "${league}".`
          : unknownSpecies.length > 0
            ? `pick3 does not know ${unknownSpecies.map((p) => p.speciesId).join(', ')}.`
            : null;

  useEffect(() => {
    if (problem || !('team' in parsed) || s.boot !== 'ready' || !s.data || started.current) {
      return;
    }
    if ((s.settings.league ?? 'great') !== league) {
      setLeague(league);
      return;
    }
    if (s.leagueInfo?.id !== league) {
      return;
    }
    started.current = true;
    setPicks(toTeamPicks(parsed.team), true);
  }, [
    problem,
    parsed,
    s.boot,
    s.data,
    s.settings.league,
    s.leagueInfo,
    league,
    setLeague,
    setPicks,
    analyze,
  ]);

  // The picks land in state a render later than the dispatch; only then can the analysis run.
  const launched = useRef(false);
  useEffect(() => {
    if (!started.current || launched.current || !s.sharedTeam || !s.picks.every(Boolean)) {
      return;
    }
    launched.current = true;
    void analyze();
  }, [s.sharedTeam, s.picks, analyze]);

  const teamNames =
    'team' in parsed ? parsed.team.picks.map((p) => name(p.speciesId)).join(', ') : '';

  return (
    <div className="screen">
      <Header
        title="Shared Team"
        sub={teamNames}
        onBack={() => navigate({ screen: 'build' })}
        backLabel="Build"
      />
      <div className="scroll" style={{ gap: 16 }}>
        {problem ? (
          <>
            <div className="error">{problem}</div>
            <button type="button" className="btn" onClick={() => navigate({ screen: 'build' })}>
              Build a team
            </button>
          </>
        ) : s.analyzeError ? (
          <>
            <div className="error">{s.analyzeError}</div>
            <button type="button" className="btn" onClick={() => navigate({ screen: 'build' })}>
              Open in Build
            </button>
          </>
        ) : (
          <Progress
            stage={s.progress?.stage ?? 'eligibility'}
            done={s.progress?.done ?? 0}
            total={s.progress?.total ?? 0}
          />
        )}
      </div>
    </div>
  );
}
