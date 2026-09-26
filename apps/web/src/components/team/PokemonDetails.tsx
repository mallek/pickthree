import type { Cost, TeamRecommendation } from '@pickthree/engine';
import { ExpandRow, Tag, Term } from '@pickthree/ui';
import { useState } from 'react';
import {
  GLOSSARY,
  MetaTags,
  MoveRows,
  PokemonToken,
  ROLE_TEXT,
  TypeChip,
  TypeChips,
  useName,
} from '../../components.tsx';
import { costParts, ivLine, SEP, topPct } from '../../format.ts';

const ORDER = ['First', 'Second', 'Third'];

const MOVE_COUNT_NOTE = <Term term="Move counts">{GLOSSARY['Move counts']}</Term>;

/** Stardust, Candy, XL Candy and Elite TM, in that order, from the one shared `costParts` that
 * `costLine` also builds on, with the last two words wired to their glossary term right where
 * they are printed instead of in a shared paragraph. */
function CostBreakdown({ cost }: { cost: Cost }) {
  return (
    <>
      {costParts(cost).map((p, i) => (
        <span key={p.unit}>
          {i > 0 ? SEP : null}
          {p.term ? (
            <>
              {p.amount}
              {'\u00a0'}
              <Term term={p.term}>{GLOSSARY[p.term]}</Term>
            </>
          ) : (
            p.text
          )}
        </span>
      ))}
    </>
  );
}

/** One expandable row per Pokémon: the strategy card that used to sit inline on Team Analysis,
 * now behind a tap so the page reads as a list of three, not a wall of cards. */
export function PokemonDetails({
  team,
  hypothetical,
  open,
  onToggle,
}: {
  team: TeamRecommendation;
  hypothetical: string[];
  open: boolean[];
  onToggle: (i: number) => void;
}) {
  const name = useName();
  const [openSafe, setOpenSafe] = useState<Set<number>>(() => new Set());
  return (
    <div className="stack" style={{ gap: 12 }}>
      {team.slots.map((slot, i) => {
        const c = slot.candidate;
        const sp = c.build.specimen;
        const detail = team.explanation.slotDetail[i]!;
        const shadowFlag = c.build.shadow ? 'Shadow' : sp.lucky ? 'Lucky' : null;
        return (
          <div id={`pokemon-${i}`} className="pd-row" key={c.build.specimenId}>
            <ExpandRow
              open={open[i] ?? false}
              onToggle={() => onToggle(i)}
              summary={
                <span className="pd-summary">
                  <PokemonToken speciesId={c.build.speciesId} size={40} />
                  <span>
                    <span className="role">
                      {ORDER[i]}
                      {SEP}
                      {ROLE_TEXT[slot.role]}
                    </span>
                    <b className="pd-summary-name">{name(c.build.speciesId)}</b>
                  </span>
                </span>
              }
            >
              <div className="stack" style={{ gap: 8, paddingTop: 12 }}>
                <TypeChips types={detail.types} small />
                <MetaTags speciesId={c.build.speciesId} />
                <div className="small muted">{slot.roleWhy}</div>
                {detail.formNote ? <div className="small form-note">{detail.formNote}</div> : null}
                <MoveRows
                  fast={c.moveset.fast}
                  charged={c.moveset.charged}
                  reads={Object.fromEntries(detail.moveReads.map((r) => [r.moveId, r.line]))}
                  countNote={i === 0 ? MOVE_COUNT_NOTE : undefined}
                />
                <div className="strategy">
                  <span className="strategy-title">Opponent charged attack strategy</span>
                  <div className="strategy-row">
                    <span>Shield</span>
                    <span className="tchips">
                      {detail.weaknesses.map((t) => (
                        <TypeChip key={t} type={t} small />
                      ))}
                      {detail.weaknesses.length === 0 ? (
                        <span className="small muted">the biggest one you see</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="strategy-row">
                    <span>Safe</span>
                    <span className="safe-types">
                      <span className="tchips">
                        {(openSafe.has(i)
                          ? detail.resistances
                          : detail.resistances.slice(0, 6)
                        ).map((t) => (
                          <TypeChip key={t} type={t} small />
                        ))}
                        {detail.resistances.length === 0 ? (
                          <span className="small muted">
                            none, everything hits neutral or better
                          </span>
                        ) : null}
                      </span>
                      {detail.resistances.length > 6 ? (
                        <button
                          type="button"
                          className="more-chip"
                          aria-expanded={openSafe.has(i)}
                          onClick={() =>
                            setOpenSafe((cur) => {
                              const next = new Set(cur);
                              if (next.has(i)) {
                                next.delete(i);
                              } else {
                                next.add(i);
                              }
                              return next;
                            })
                          }
                        >
                          <span className="mtag">
                            {openSafe.has(i) ? 'fewer' : `+${detail.resistances.length - 6} more`}
                          </span>
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <span className="strategy-note">
                    * Low on health and close to your own charged move? Shielding a neutral hit can
                    be worth it.
                  </span>
                </div>
                {detail.keepShield ? (
                  <div className="small" style={{ color: 'var(--accent-text)' }}>
                    {detail.keepShield.line}
                  </div>
                ) : null}
                <div className="divider-top stack" style={{ gap: 4 }}>
                  {hypothetical.includes(c.build.speciesId) ? (
                    <div className="kv">
                      <span className="muted">Yours</span>
                      <span className="muted">
                        Not in your collection. The numbers assume a top-10% IV spread (
                        {ivLine(c.build.ivs)}) at level {c.build.level}.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="kv">
                        <span className="muted">
                          {c.build.stageOffset > 0 ? `From your ${name(sp.speciesId)}` : 'Yours'}
                        </span>
                        <span>
                          {ivLine(c.build.ivs)}
                          {SEP}Level {sp.level.max}
                          {SEP}
                          <Term term="IV rank">{GLOSSARY['IV rank']}</Term> top{' '}
                          {topPct(c.build.ivRank)}%
                          {shadowFlag ? (
                            <span style={{ marginLeft: 6 }}>
                              <Tag>{shadowFlag}</Tag>
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="kv">
                        <span className="muted">To build</span>
                        <span>
                          {c.build.level > sp.level.max
                            ? `Level ${sp.level.max} to ${c.build.level}${SEP}`
                            : `Already at level${SEP}`}
                          <CostBreakdown cost={c.cost} />
                          {c.cost.secondMoveUnlock ? `${SEP}second\u00a0move\u00a0unlock` : ''}
                          {c.cost.estimated ? ' (evolution candy estimated)' : ''}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </ExpandRow>
          </div>
        );
      })}
    </div>
  );
}
