/**
 * Workflow helper (no entry guard, so it cannot silently do nothing). Input comes from the
 * environment, never argv: CHECK_OUTPUT (the schedule:check output) and, for close, OPEN_ISSUES
 * (JSON of the open issues).
 *   schedule-issues-cli warnings   one JSON warning per line
 *   schedule-issues-cli close      one issue number per line
 * Any failure prints a ::error:: line on stderr (stdout is captured by the workflow) and exits 1.
 */
import { closableIssues, parseCheckOutput, type OpenIssue } from './close-schedule-issues.js';

const mode = process.argv[2];
try {
  const check = parseCheckOutput(process.env.CHECK_OUTPUT ?? '');
  if (mode === 'warnings') {
    for (const w of check.warnings) {
      process.stdout.write(`${JSON.stringify(w)}\n`);
    }
  } else if (mode === 'close') {
    const openText = process.env.OPEN_ISSUES ?? '';
    if (openText.trim() === '') {
      throw new Error('OPEN_ISSUES is empty');
    }
    const open = JSON.parse(openText) as OpenIssue[];
    for (const n of closableIssues(check, open)) {
      process.stdout.write(`${n}\n`);
    }
  } else {
    throw new Error(`unknown mode: ${mode}`);
  }
} catch (e) {
  process.stderr.write(`::error::schedule issues: ${(e as Error).message}\n`);
  process.exit(1);
}
