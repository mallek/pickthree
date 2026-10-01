/**
 * The team board: cores as the spine, complete teams nested under each, one sort by score. The
 * board lives in @pickthree/engine/meta (teamRank.ts); re-exported here so the screens keep
 * their imports.
 */
export {
  BOARD_LIMIT,
  TEAM_HALF_SAY,
  TEAM_MIN,
  THIRD_SAMPLE,
  UNKNOWN_PRIOR,
  buildBoard,
  type Board,
  type BoardRow,
  type RowSource,
} from '@pickthree/engine/meta';
