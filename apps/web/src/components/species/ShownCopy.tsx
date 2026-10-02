import type { Specimen, Verdict } from '@pickthree/engine';
import { Chevron, IconButton } from '@pickthree/ui';
import {
  HundoTag,
  PencilGlyph,
  PinGlyph,
  TrashGlyph,
  VerdictTag,
  useName,
  useSpecies,
} from '../../components.tsx';
import { ivLine, levelLabel, ownSpeciesId, rankLabel, scanAge } from '../../format.ts';
import { hashFor } from '../../state/store.tsx';

/** Joins names the way a sentence would: "A", "A and B", "A, B and C". */
function joinAnd(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/** One copy's row text: "Eevee · CP 412 · Top 2% · Level 14 · Lucky". */
export function copyLine(
  sp: Specimen,
  verdict: Verdict | undefined,
  speciesId: string,
  name: (id: string) => string,
): string {
  const own = ownSpeciesId(sp);
  return [
    ...(own !== speciesId ? [name(sp.speciesId)] : []),
    `CP ${sp.cp}`,
    rankLabel(sp, verdict),
    `Level ${levelLabel(sp.level)}`,
    ...(sp.lucky ? ['Lucky'] : []),
    ...(sp.purified ? ['Purified'] : []),
  ].join(' · ');
}

/**
 * The copy a species page is showing: its heading with pin, edit and remove beside it, then the
 * Pokémon page's facts card, judged as the page's species. A lower form reads "Your Eevee to
 * evolve" and the card still ranks it as the page's species.
 */
export function ShownCopy({
  speciesId,
  leagueTitle,
  sp,
  verdict,
  alsoPickFor,
  pinned,
  unpinned,
  bestAs,
  onPin,
  onRemove,
}: {
  /** The page's species. */
  speciesId: string;
  leagueTitle: string;
  sp: Specimen;
  verdict: Verdict;
  alsoPickFor: readonly string[];
  /** This copy is the one teams field for the species. */
  pinned: boolean;
  /** The player unpinned the species: none of their copies is fielded. */
  unpinned: boolean;
  /** Another species this copy builds better as, or null. */
  bestAs: string | null;
  onPin: () => void;
  onRemove: () => void;
}) {
  const name = useName();
  const species = useSpecies();
  const own = ownSpeciesId(sp);
  const page = name(speciesId);
  // A Mega's page shows the base Pokémon itself: nothing to evolve.
  const lower = own !== speciesId && !species(speciesId)?.megaOf;
  const build = verdict.build;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <h3 style={{ flex: 1 }}>
          {lower ? `Your ${name(sp.speciesId)} to evolve` : `Your ${page}`}
        </h3>
        {/* A copy with no build of this species cannot be the one teams field. */}
        {build ? (
          <IconButton
            label={pinned ? `Pinned for ${leagueTitle}` : `Pin for ${leagueTitle}`}
            onClick={onPin}
          >
            <PinGlyph on={pinned} />
          </IconButton>
        ) : null}
        <IconButton label="Edit" href={hashFor({ screen: 'add', edit: sp.id })}>
          <PencilGlyph />
        </IconButton>
        <IconButton label="Remove from collection" onClick={onRemove}>
          <TrashGlyph />
        </IconButton>
      </div>
      <div className="card" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="meta" style={{ flex: 1 }}>
            {copyLine(sp, verdict, speciesId, name)}
          </span>
          <VerdictTag label={verdict.label} />
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="meta">{scanAge(sp.scannedAt)}</span>
          <HundoTag delta={verdict.perfectDelta} />
        </div>
        <div className="kv" style={{ alignItems: 'baseline' }}>
          <span className="muted">IVs · Attack / Defense / HP</span>
          <span style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {ivLine(sp.ivs)}
          </span>
        </div>
        <div className="kv" style={{ alignItems: 'baseline' }}>
          <span className="muted">{page} IV rank</span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            {build
              ? `${build.ivRank.rank} of ${build.ivRank.total}`
              : sp.ivs
                ? 'Not eligible'
                : 'Unknown'}
          </span>
        </div>
        {verdict.line ? <p style={{ marginTop: 4 }}>{verdict.line}</p> : null}
        {verdict.perfectLine ? <p className="small muted">{verdict.perfectLine}</p> : null}
        {alsoPickFor.length > 0 ? (
          <p className="small muted">
            Also your pick for {joinAnd(alsoPickFor.map(name))}. It can only evolve once.
          </p>
        ) : null}
        {unpinned ? (
          <p className="small muted">
            No {page} is pinned for {leagueTitle}, so pick3 treats it as one you do not have.
          </p>
        ) : null}
      </div>
      {bestAs ? (
        <a className="action-row" href={hashFor({ screen: 'species', id: bestAs, copy: sp.id })}>
          <span>
            <b>
              Best as {name(bestAs)} in {leagueTitle}
            </b>
          </span>
          <span className="chev">
            <Chevron />
          </span>
        </a>
      ) : null}
    </div>
  );
}
