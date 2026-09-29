/**
 * Workflow helper (no entry guard, so it cannot silently do nothing).
 *   schedule-issues-cli warnings <checkOutput>          one JSON warning per line
 *   schedule-issues-cli close <checkOutput> <openJson>  one issue number per line
 * Invalid check output prints a ::error:: line and exits 1.
 */
import { closableIssues, parseCheckOutput, type OpenIssue } from './close-schedule-issues.js';

const [mode, checkText, openText] = process.argv.slice(2);
try {
  const check = parseCheckOutput(checkText ?? '');
  if (mode === 'warnings') {
    for (const w of check.warnings) {
      process.stdout.write(`${JSON.stringify(w)}\n`);
    }
  } else if (mode === 'close') {
    const open = JSON.parse(openText ?? '') as OpenIssue[];
    for (const n of closableIssues(check, open)) {
      process.stdout.write(`${n}\n`);
    }
  } else {
    throw new Error(`unknown mode: ${mode}`);
  }
} catch (e) {
  process.stdout.write(`::error::schedule issues: ${(e as Error).message}\n`);
  process.exit(1);
}
