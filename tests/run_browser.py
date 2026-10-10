"""Run the learning world, lecture library, Arena and campus browser suites."""
import os
import argparse
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run_suite(env):
    scripts = {'lectures': 'lecture_browser.py', 'arena': 'browser_flow.py', 'globe': 'globe_browser.py', 'mania': 'mania_browser.py', 'versus': 'versus_browser.py', 'versus-lifecycle': 'versus_lifecycle_browser.py', 'cockpit': 'cockpit_browser.py'}
    selected = env.get('BROWSER_SUITES', ','.join(scripts)).split(',')
    if any(name not in scripts for name in selected):
        raise ValueError('BROWSER_SUITES must contain lectures, arena, globe, mania, versus, versus-lifecycle, and/or cockpit.')
    for name in selected:
        script = scripts[name]
        subprocess.run([sys.executable, str(ROOT / 'tests' / script)], cwd=ROOT, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suites', help='Comma-separated lectures, arena, globe, mania, versus, versus-lifecycle, and/or cockpit.')
    args = parser.parse_args()
    env = os.environ.copy()
    if args.suites:
        env['BROWSER_SUITES'] = args.suites
    if env.get('TEST_URL'):
        run_suite(env)
        return
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='viscon-browser-') as folder:
        url = f'http://127.0.0.1:{port}'
        env.update(PORT=str(port), HOST='127.0.0.1', DATABASE_PATH=str(Path(folder) / 'arena.sqlite'), ALLOWED_ORIGINS=url, TEST_URL=url, LECTURE_QA_PROVIDER='local', MANIA_TRUST_PROXY='false', COOKIE_SECURE='false', AUTH_REQUIRE_VERIFIED='false')
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
