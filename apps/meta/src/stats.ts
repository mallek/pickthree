/**
 * What the site is allowed to claim about a number. The rules live in @pickthree/engine/meta
 * (stats.ts) so pick3 and this site print the same caveats; re-exported here so the screens keep
 * their imports.
 */
export {
  MANY,
  SHARE_MIN,
  SOME,
  TREND_MIN,
  confidence,
  margin,
  marginSentence,
  trendLabel,
  trendPoints,
  winRate,
  type Confidence,
} from '@pickthree/engine/meta';
