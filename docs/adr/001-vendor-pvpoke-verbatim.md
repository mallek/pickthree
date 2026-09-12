# ADR 001: Vendor PvPoke's simulator verbatim behind a globals shim

Status: accepted, 2026-09-11

## Context
PvPoke's battle simulator (Battle.js, Pokemon.js, ActionLogic.js, DamageCalculator.js and friends) is
plain script code with no jQuery or DOM use. Its only outside dependency is the GameMaster
singleton, whose getMoveById and generateFilteredPokemonList derive many fields we would otherwise
reimplement. GameMaster.js itself uses a handful of jQuery calls and page globals.

## Decision
Copy nine files byte-for-byte at a pinned commit (hash manifest enforced by test). Provide the page
globals and a jQuery subset in globals-shim.js. Concatenate into one classic script loaded in a Node vm
context (build, tests) and later a browser worker via importScripts. Expose a BattleSimulator adapter;
the engine depends only on that interface.

## Consequences
Upgrades are a lock bump plus vendor:sync, gated by a golden test that reproduces PvPoke's published
matchup ratings. No fork, no drift, no edits to upstream code. The bundle is a classic script, so the
web worker that hosts it must be a classic worker (or import the bundle before module code runs).
