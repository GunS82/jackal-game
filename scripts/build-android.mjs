import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const task = process.argv[2] || 'assembleDebug';
const isWindows = process.platform === 'win32';
const capCli = resolve(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const gradle = resolve(root, 'android', isWindows ? 'gradlew.bat' : 'gradlew');

function run(command, args, cwd = root) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} завершился с кодом ${code}`)));
  });
}

if (!['assembleDebug', 'bundleRelease', 'sync'].includes(task)) throw new Error(`Неизвестная Gradle-задача: ${task}`);
await run(process.execPath, ['scripts/build-web.mjs', 'www']);
await run(process.execPath, [capCli, 'sync', 'android']);
if (task !== 'sync') {
  if (isWindows) await run('cmd.exe', ['/d', '/c', 'call', gradle, task], resolve(root, 'android'));
  else await run(gradle, [task], resolve(root, 'android'));
}
