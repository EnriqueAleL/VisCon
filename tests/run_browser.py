"""Run both frontends against a temporary, isolated production server."""
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_suite(env):
    for script in ('lecture_browser.py', 'browser_flow.py'):
        subprocess.run([sys.executable, str(ROOT / 'tests' / script)], cwd=ROOT, env=env, check=True)


def main():
    env = os.environ.copy()
    if env.get('TEST_URL'):
        run_suite(env)
        return
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='viscon-browser-') as folder:
        url = f'http://127.0.0.1:{port}'
        env.update(PORT=str(port), HOST='127.0.0.1', DATABASE_PATH=str(Path(folder) / 'arena.sqlite'), ALLOWED_ORIGINS=url, TEST_URL=url, LECTURE_QA_PROVIDER='local')
        env.pop('OLLAMA_MODEL', None)
        env.pop('QUESTION_BANK_PATH', None)
        with open(Path(folder) / 'server.log', 'w+') as log:
            server = subprocess.Popen(['node', '--import', 'tsx', 'server/index.ts'], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if server.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(log.read())
                    try:
                        with urllib.request.urlopen(url + '/api/health', timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(0.1)
                else:
                    raise RuntimeError('The test server did not start.')
                run_suite(env)
            finally:
                server.terminate()
                try: server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == '__main__':
    main()
