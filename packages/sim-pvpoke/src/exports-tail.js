/* PickThree: expose the vendored classes on the global object so module code can reach them. */
globalThis.__pvpoke = {
  GameMaster: GameMaster,
  Battle: Battle,
  Pokemon: Pokemon,
  DamageCalculator: DamageCalculator,
  ActionLogic: ActionLogic,
  flushAjax: __pickthreeFlushAjax,
};
