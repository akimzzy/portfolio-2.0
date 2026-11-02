import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const processes = [];
let stopping = false;

const services = [
  {
    name: 'web',
    script: resolve(workspaceRoot, 'node_modules/vite/bin/vite.js'),
    args: ['--config', 'apps/web/vite.config.js'],
  },
  {
    name: 'worker',
    script: resolve(workspaceRoot, 'node_modules/wrangler/bin/wrangler.js'),
    args: ['dev', '--config', 'apps/worker/wrangler.jsonc'],
  },
];

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;

  for (const child of processes) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }

  const forceStop = setTimeout(() => {
    for (const child of processes) {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }, 4_000);
  forceStop.unref();
}

for (const service of services) {
  const child = spawn(process.execPath, [service.script, ...service.args], {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
  });
  processes.push(child);

  child.once('error', (error) => {
    console.error(`Could not start the ${service.name}:`, error);
    stop(1);
  });

  child.once('exit', (code, signal) => {
    if (stopping) return;
    if (code !== 0) {
      console.error(`${service.name} stopped${signal ? ` (${signal})` : ` with exit code ${code ?? 1}`}.`);
      stop(code ?? 1);
    } else {
      stop(0);
    }
  });
}

process.once('SIGINT', () => stop(130));
process.once('SIGTERM', () => stop(143));
