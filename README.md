# PickThree

Great League team building from the Pokemon you actually own.

Upload a Poke Genie CSV export. PickThree combines it with [PvPoke](https://github.com/pvpoke/pvpoke)'s
game data, rankings, and battle simulator, and tells you which three Pokemon to use, in what order,
with which moves, what the build costs, what it beats, what beats it, and why.

Everything runs in your browser. Your collection never leaves your device.

Status: pre-alpha. See `docs/superpowers/specs/` for the design.

## Development

```
fnm use 24
npm install
npm run data:build
npm run dev
npm test
```

## License

MIT. PvPoke data and simulator code are used under the MIT license, copyright 2019 pvpoke.
See `packages/sim-pvpoke/LICENSE-pvpoke`.

PickThree is not affiliated with Niantic, Nintendo, The Pokemon Company, Poke Genie, or PvPoke.
