import { cp, mkdir, readdir } from 'node:fs/promises';

// The standalone viewer stays the source of truth. Serve and build the same assets.
const source = new URL('../../translation/', import.meta.url);
const destination = new URL('../public/translation/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css', 'documents.json', 'vendor']) {
  await cp(new URL(name, source), new URL(name, destination), { recursive: true });
}

for (const name of await readdir(source)) {
  if (name.toLowerCase().endsWith('.pdf')) await cp(new URL(name, source), new URL(name, destination));
}
