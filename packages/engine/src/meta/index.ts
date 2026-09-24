/**
 * The seam meta.pick3.gg imports. One formula in the repo, two callers: the site must run the
 * same blend pick3 runs on device, and the same simStrength the bake scores generated teams with.
 * Deliberately narrow, so pulling this in does not pull in the CSV parser, the cost tables, the
 * simulator interface or anything else the site has no business shipping.
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
