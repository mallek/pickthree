# Brand sources

`Inter-600.ttf` and `Inter-700.ttf` are Inter by Rasmus Andersson, SIL Open Font License 1.1
(https://github.com/rsms/inter). They are used only by `apps/web/scripts/lockup.mjs` to outline the
"pick" wordmark so the lockup SVGs render identically everywhere. Regenerate with
`npm run brand:lockup` (set `PICK3_WEIGHT=600` for the lighter cut).

Generated outputs: `lockup.svg` and `lockup-light.svg` live here in `packages/ui/brand/`, imported
through Vite by both apps. `banner-dark.svg` and `banner-light.svg` (social media / README headers,
not referenced by either app at runtime) still live in `apps/web/public/`. The mark itself is
`mark.svg`; the app icon is `icon.svg` / `favicon.svg`.
