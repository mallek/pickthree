<p align="center"><img src="apps/web/public/lockup.svg" alt="pick3" width="240"></p>

# PickThree

Great League team building from the Pokémon you actually own.

Upload a Poke Genie CSV export. PickThree combines it with [PvPoke](https://github.com/pvpoke/pvpoke)'s
game data, rankings, and battle simulator, and tells you which three Pokémon to use, in what order,
with which moves, what the build costs, what it beats, what beats it, and why.

Everything runs in your browser. Your collection never leaves your device.

Live at [pick3.demome.com](http://pick3.demome.com). No export handy? The welcome screen can load a
synthetic sample collection so you can see what it does.

Status: MVP (Great League). Design spec, plans and the UI design export live under `docs/`.

## How it works

1. `packages/data` pins a PvPoke commit, normalizes its game master and Great League rankings, and
   precomputes a matchup matrix of every ranked species against PvPoke's meta group with the
   vendored simulator (about a minute; 274 KB gzipped).
2. `packages/sim-pvpoke` vendors PvPoke's battle simulator byte-for-byte behind a small shim. A golden
   test reproduces PvPoke's published matchup ratings exactly.
3. `packages/engine` parses the Poke Genie CSV, maps names and forms to PvPoke ids, checks Great
   League eligibility across evolution stages, ranks IVs against all 4096 spreads, prunes to a
   candidate pool, scores every trio on the matrix (ABB lines and balanced ABC teams), simulates the
   finalists with your exact IVs, scores them on coverage, consistency, safety, cost and
   accessibility, and writes the explanations.
4. `apps/web` runs the engine in a Web Worker, keeps the collection in IndexedDB, and renders the
   decisions.

## Development

```
fnm use 24
npm install
npm run data:build      # once; clones the pinned PvPoke commit and builds apps/web/public/data
npm run dev             # Vite dev server for apps/web
npm test
npm run web:screens     # screenshots every screen at phone size (needs `npx vite preview` in apps/web)
```

See `docs/setup.md`. Game data comes from PvPoke at the commit pinned in `packages/data/pvpoke.lock.json`.

## License

MIT. PvPoke data and simulator code are used under the MIT license, copyright 2019 pvpoke.
See `packages/sim-pvpoke/LICENSE-pvpoke`.

PickThree is not affiliated with Niantic, Nintendo, The Pokémon Company, Poke Genie, or PvPoke.
