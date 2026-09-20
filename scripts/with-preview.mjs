/**
 * Build a workspace, serve it, run a command against it, then tear the server down.
 *
 *   node scripts/with-preview.mjs <workspace> <port> -- <command> [args...]
 *
 * The screenshot scripts drive the BUILT app over HTTP and do not build or serve anything
 * themselves. Run one directly and it silently drives whatever happens to be on the port: a
 * stale dist from an earlier build, a preview server left running from an hour ago, or nothing
 * at all. That fails in the worst way, by passing against the wrong code.
 *
 * Set PICKTHREE_SCREENS_SERVED=1 when something else has already built and served the app, which
 * is what CI does, and this runs the command unchanged.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [workspace, portArg, ...rest] = process.argv.slice(2);
const split = rest.indexOf('--');
const command = split === -1 ? rest : rest.slice(split + 1);
if (!workspace || !portArg || command.length === 0) {
  console.error('usage: node scripts/with-preview.mjs <workspace> <port> -- <command> [args...]');
  process.exit(2);
}
const port = Number(portArg);
const appDir = path.join(repoRoot, 'apps', workspace);
const served = process.env.PICKTHREE_SCREENS_SERVED === '1';

/** Resolves once the preview server answers, or rejects after the timeout. */
async function waitForPort(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    if (Date.now() > until) {
      throw new Error(`${url} did not come up within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

let server = null;
function stopServer() {
  if (!server || server.killed) {
    return;
  }
  // The server is spawned through a shell, so killing the handle kills the shell and leaves
  // vite preview holding the port. --strictPort then fails the NEXT run, which is the same
  // stale-server trap this wrapper exists to close. Take the whole tree down.
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
  server = null;
}

// An interrupted run must not leave the server holding the port, or --strictPort fails the next
// one. Covers Ctrl-C and a CI cancel; nothing can cover SIGKILL.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    stopServer();
    process.exit(130);
  });
}
process.on('exit', stopServer);

/** True when something already answers on the port. */
async function portBusy(url) {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

try {
  if (!served) {
    if (await portBusy(`http://localhost:${port}/`)) {
      // Deliberately not reused: serving whatever is already there, from who knows which build,
      // is the exact trap this wrapper exists to close.
      console.error(
        `Something is already serving :${port}. Stop it and run again, or set ` +
          `PICKTHREE_SCREENS_SERVED=1 if you built and served it yourself.`,
      );
      process.exit(1);
    }
    console.log(`building @pickthree/${workspace}`);
    const built = spawnSync('npm', ['-w', `@pickthree/${workspace}`, 'run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
    });
    if (built.status !== 0) {
      process.exit(built.status ?? 1);
    }
    console.log(`serving the build on :${port}`);
    server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
      cwd: appDir,
      stdio: 'ignore',
      shell: true,
      // A process group, so the whole tree can be signalled together off Windows.
      detached: process.platform !== 'win32',
    });
    server.on('exit', () => {
      server = null;
    });
    await waitForPort(`http://localhost:${port}/`, 60_000);
  }

  const run = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });
  stopServer();
  process.exit(run.status ?? 1);
} catch (e) {
  stopServer();
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
