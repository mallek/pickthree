import mark from '../../brand/mark.svg';
import { IconButton } from './IconButton.tsx';

const META_URL = 'https://meta.pick3.gg';
const PICK3_URL = 'https://pick3.gg';

/** Three ascending bars, suggesting rankings: the glyph for the meta.pick3.gg `IconButton` on
 * the tab headers. Not the pick3 mark. On pick3's own header the pick3 mark means "home", so
 * wearing it on a link that leaves would read backwards; a destination badge should depict the
 * destination, not the app it sits in. Drawn in `currentColor` at the same stroke weight and
 * size as the app's other head-row icons (ShareGlyph, HeadCog: 20px, 1.8 stroke, round caps and
 * joins), so it takes pick3's own ink rather than meta's violet and looks native here. */
export function MetaGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 18v-4" />
      <path d="M12 18V10" />
      <path d="M18 18V6" />
    </svg>
  );
}

/** The one cross-link button both sites wear: meta.pick3.gg's headers point back at pick3.gg
 * with the pick3 mark, pick3's own headers point out at meta.pick3.gg with `MetaGlyph`. Same
 * `IconButton` shell either way, so it takes the header's own spacing and sizing for free. */
export function SiteLink({ site }: { site: 'meta' | 'pick3' }) {
  if (site === 'pick3') {
    return (
      <IconButton label="pick3, the team builder" href={PICK3_URL}>
        <img src={mark} width={20} height={20} alt="" aria-hidden="true" />
      </IconButton>
    );
  }
  return (
    <IconButton label="meta.pick3.gg, the community meta" href={META_URL}>
      <MetaGlyph />
    </IconButton>
  );
}
