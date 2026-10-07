import { PokemonToken } from '../../components.tsx';

/** pick3's own shiny mark: a four-point sparkle in the Electric type token, as the Mega glyph
 *  walks the type tokens. Decorative; the badge around it carries the name. */
export function ShinyGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M10 1.5 C10.9 7 13 9.1 18.5 10 C13 10.9 10.9 13 10 18.5 C9.1 13 7 10.9 1.5 10 C7 9.1 9.1 7 10 1.5 Z"
        fill="var(--type-electric)"
        stroke="var(--bg)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** An earned Pokemon's token, with the shiny badge on its top-right corner when it rolled shiny. */
export function RewardToken({
  species,
  shiny,
  size,
}: {
  species: string;
  shiny?: boolean | undefined;
  size: number;
}) {
  if (!shiny) {
    return <PokemonToken speciesId={species} size={size} showInitial={false} />;
  }
  return (
    <span className="token-shiny-wrap">
      <PokemonToken speciesId={species} size={size} showInitial={false} shiny />
      <span className="token-shiny-badge" role="img" aria-label="Shiny" data-audit-overhang>
        <ShinyGlyph size={Math.max(12, Math.round(size * 0.42))} />
      </span>
    </span>
  );
}

/** Not earned yet: a plain disc in the bar color, with the dex number or a question mark. */
export function BlankToken({ size, label }: { size: number; label: string }) {
  return (
    <span
      className="token ach-blank"
      role="img"
      aria-label="Not earned yet"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {label}
    </span>
  );
}

/** Not earned yet, in the dex: the Pokemon's own sprite as a shape in the silhouette tokens. */
export function SilhouetteSlot({ species, size }: { species: string; size: number }) {
  return (
    <span
      className="ach-sil"
      role="img"
      aria-label="Not earned yet"
      style={{
        width: size,
        height: size,
        ['--sprite' as string]: `url(/data/sprites/${species}.webp)`,
      }}
    />
  );
}
