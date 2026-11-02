import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outputName = process.argv[2] || 'www';
const output = resolve(root, outputName);
const serverUrl = (process.env.SERVER_URL || '').replace(/\/+$/, '');

if (serverUrl) {
  const url = new URL(serverUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('SERVER_URL должен использовать HTTPS (разрешён HTTP только для localhost).');
  }
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('SERVER_URL должен быть корнем сервера без пути, query или hash.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'rules.html', 'rules.css', 'style.css', 'favicon.svg', 'favicon.ico']) {
  await cp(join(root, file), join(output, file));
}
for (const dir of ['src', 'assets', 'positions']) {
  await cp(join(root, dir), join(output, dir), { recursive: true });
}

const configPath = join(output, 'src', 'config.js');
let config = await readFile(configPath, 'utf8');
config = config.replace(/^export const SERVER_URL_DEFAULT = .*;$/m, `export const SERVER_URL_DEFAULT = ${JSON.stringify(serverUrl)};`);
await writeFile(configPath, config);

if (outputName === 'www') {
  await build({
    entryPoints: [join(root, 'src', 'capacitor-bridge.js')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    outfile: join(output, 'capacitor-bridge.js'),
  });
  const uiPath = join(output, 'src', 'ui.js');
  const ui = await readFile(uiPath, 'utf8');
  await writeFile(uiPath, `import '../capacitor-bridge.js';\n${ui}`);
}

console.log(`Собрано в ${outputName}; SERVER_URL=${serverUrl || '(не задан)'}`);
