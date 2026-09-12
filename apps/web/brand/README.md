# Brand sources

`Inter-600.ttf` and `Inter-700.ttf` are Inter by Rasmus Andersson, SIL Open Font License 1.1
(https://github.com/rsms/inter). They are used only by `apps/web/scripts/lockup.mjs` to outline the
"pick" wordmark so the lockup SVGs render identically everywhere. Regenerate with
`npm run brand:lockup` (set `PICK3_WEIGHT=600` for the lighter cut).

Generated outputs live in `apps/web/public/`: `lockup.svg`, `lockup-light.svg`, `banner-dark.svg`,
`banner-light.svg`. The mark itself is `mark.svg`; the app icon is `icon.svg` / `favicon.svg`.
