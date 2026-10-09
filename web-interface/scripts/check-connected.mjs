import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const localPython = path.join(root, '.venv/bin/python');
const result = spawnSync(process.env.QA_PYTHON || (existsSync(localPython) ? localPython : 'python3'), ['tests/lecture_browser.py'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, TEST_URL: process.env.TEST_URL || 'http://127.0.0.1:5173' },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
