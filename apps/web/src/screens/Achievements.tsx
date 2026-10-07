import { KANTO, type AchievementStatus, type AchievementTier } from '@pickthree/engine';
import { Header, IconButton, ProgressCard } from '@pickthree/ui';
import { useEffect, useRef } from 'react';
import { useAchievements } from '../achievements/AchievementsProvider.tsx';
import { shareDex } from '../achievements/shareImage.ts';
import { ShareGlyph, useName } from '../components.tsx';
import { BlankToken, RewardToken, SilhouetteSlot } from '../components/achievements/tokens.tsx';
import { achievementsLine, shortDate } from '../format.ts';
import { useActions, useAppState } from '../state/store.tsx';

const TIER_ORDER: readonly AchievementTier[] = ['easy', 'mid', 'hard', 'elite', 'top'];

const TIER_LABEL: Record<AchievementTier, string> = {
  easy: 'Easy',
  mid: 'Mid',
  hard: 'Hard',
  elite: 'Elite',
  top: 'Top',
};

const TIER_LINE: Record<AchievementTier, string> = {
  easy: 'Rewards a first-stage Pokemon',
  mid: 'Rewards an evolved Pokemon',
  hard: 'Rewards a fully evolved Pokemon',
  elite: 'Rewards a legendary bird',
  top: 'Rewards Mewtwo or Mew',
};

function DexCard() {
  const a = useAchievements();
  const spritesOn = useAppState().settings.sprites !== false;
  // A record whose id is no longer in the list still lights its Pokemon here.
  // Two records may share a species; a shiny one is the one shown.
  const lit = new Map<string, (typeof a.record.earned)[number]>();
  for (const e of a.record.earned) {
    if (!lit.get(e.species)?.shiny) {
      lit.set(e.species, e);
    }
  }
  const litCount = KANTO.filter((k) => lit.has(k.id)).length;
  return (
    <div className="mh-card">
      <div className="between mh-card-head">
        <b>Your Kanto dex</b>
        <span className="meta">{litCount} of 151</span>
      </div>
      <div className="ach-dex">
        {KANTO.map((k) => {
          const e = lit.get(k.id);
          if (e) {
            return <RewardToken key={k.dex} species={k.id} shiny={e.shiny} size={28} />;
          }
          return spritesOn ? (
            <SilhouetteSlot key={k.dex} species={k.id} size={28} />
          ) : (
            <BlankToken key={k.dex} size={28} label={String(k.dex)} />
          );
        })}
      </div>
    </div>
  );
}

function AchievementRow({ status }: { status: AchievementStatus }) {
  const a = useAchievements();
  const name = useName();
  const { def } = status;
  const earned = a.record.earned.find((e) => e.id === def.id);
  if (earned) {
    return (
      <div className="faced-row" id={`ach-${def.id}`}>
        <RewardToken species={earned.species} shiny={earned.shiny} size={36} />
        <span className="faced-name">
          <span className="faced-title">
            <span className="spec-name">{def.name}</span>
          </span>
          <span className="meta">
            {earned.shiny ? 'Shiny ' : ''}
            {name(earned.species)} · {shortDate(earned.earnedAt)}
          </span>
        </span>
        <span />
        <span />
      </div>
    );
  }
  return (
    <div className="faced-row" id={`ach-${def.id}`}>
      <BlankToken size={36} label="?" />
      <span className="faced-name">
        <span className="faced-title">
          <span className="spec-name">{def.name}</span>
        </span>
        <span className="meta">{def.howTo}</span>
      </span>
      <b className="faced-rec">
        {status.have} of {status.need}
      </b>
      <span />
      <span
        className="faced-bar"
        aria-hidden="true"
        style={{ width: `${Math.min(100, (status.have / Math.max(1, status.need)) * 100)}%` }}
      />
    </div>
  );
}

function TierGroup({ tier, rows }: { tier: AchievementTier; rows: AchievementStatus[] }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="between ym-list-head">
        <b>{TIER_LABEL[tier]}</b>
        <span className="meta">{TIER_LINE[tier]}</span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {rows.map((s) => (
          <AchievementRow key={s.def.id} status={s} />
        ))}
      </div>
    </div>
  );
}

/** `#/achievements`: progress, the Kanto dex and every achievement by tier. */
export function Achievements() {
  const { back, notify } = useActions();
  const a = useAchievements();
  const { route, data, settings } = useAppState();
  const row = route.screen === 'achievements' ? route.row : undefined;
  const line = [a.shinyCount > 0 ? `${a.shinyCount} shiny` : null, achievementsLine(a)]
    .filter(Boolean)
    .join(' · ');

  // Scroll to the linked row once per link. The rows only exist after the log is read, so a
  // fresh load waits for them; a later change of the list must not pull the page back.
  const scrolledTo = useRef<string | null>(null);
  const hasRows = a.statuses.length > 0;
  useEffect(() => {
    if (!row || !hasRows || scrolledTo.current === row) {
      return;
    }
    scrolledTo.current = row;
    document.getElementById(`ach-${row}`)?.scrollIntoView({ block: 'center' });
  }, [row, hasRows]);

  // Ignore taps while a picture is being made or the share sheet is open.
  const sharing = useRef(false);
  const share = async (): Promise<void> => {
    if (sharing.current) {
      return;
    }
    sharing.current = true;
    try {
      const result = await shareDex({
        record: a.record,
        types: (id) => (data?.species[id]?.types ?? ['normal']).filter((t) => t !== 'none'),
        spritesOn: settings.sprites !== false,
      });
      if (result === 'failed') {
        notify('Could not make the picture.', 'warn');
      }
    } finally {
      sharing.current = false;
    }
  };

  return (
    <div className="screen">
      <div className="sub-head">
        <Header
          variant="sub"
          title="Achievements"
          back={{ label: 'Back', onClick: () => back({ screen: 'meta' }) }}
          actions={
            <IconButton label="Share" onClick={() => void share()}>
              <ShareGlyph />
            </IconButton>
          }
        />
      </div>
      <div className="scroll" style={{ gap: 18 }}>
        <ProgressCard title="Earned" done={a.earnedCount} goal={a.total} line={line} />
        <DexCard />
        {TIER_ORDER.map((tier) => {
          const rows = a.statuses.filter((s) => s.def.tier === tier);
          return rows.length > 0 ? <TierGroup key={tier} tier={tier} rows={rows} /> : null;
        })}
        <p className="meta ym-foot">
          Each one gives you a Kanto Pokemon, picked at random when you earn it. Everything here
          stays on this phone.
        </p>
      </div>
    </div>
  );
}
