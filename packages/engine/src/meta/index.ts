/**
 * The meta seam. One formula in the repo: pick3's Meta tab, its Teams Source picker and the data
 * build's baseline teams run the same blend and the same simStrength. Deliberately narrow, so
 * pulling this in does not pull in the CSV parser, the cost tables or the simulator interface.
 * It also carries the meta pages' pure logic (wire types, species ranking, team board, stats,
 * baseline, slice, trend).
 */
export {
  DEFAULT_BLEND_OPTIONS,
  blendShare,
  blendWeights,
  type BlendInput,
  type BlendOptions,
} from '../yourmeta/blend.js';
export { facingWeight } from '../gamedata/metaRank.js';
export { MatrixView } from '../search/matrixView.js';
export { matrixIndex, type MatchupMatrix, type MatrixScenario } from '../gamedata/types.js';
export {
  PROJECTION_SLOPE,
  bestStrength,
  expectedWinRate,
  strengthContext,
  strengthOf,
  type Strength,
  type StrengthContext,
} from '../score/simStrength.js';
export * from './community.js';
export * from './legal.js';
export * from './window.js';
export * from './api.js';
export * from './baseline.js';
export * from './rank.js';
export * from './slice.js';
export * from './stats.js';
export * from './teamRank.js';
export * from './trend.js';
