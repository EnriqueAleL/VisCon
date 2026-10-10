"""Verify the small example import can create usable rooms for every subject."""
import json
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor, Request, build_opener

client = build_opener(HTTPCookieProcessor(CookieJar()))


def request(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    with client.open(Request('http://127.0.0.1:3102/api' + path, data=data,
                             headers={'Content-Type': 'application/json'})) as response:
        return json.load(response)


bootstrap = request('/bootstrap')
assert bootstrap['demoContent'] is False
assert len(bootstrap['subjects']) == 3
for subject in bootstrap['subjects']:
    room = request('/rooms', {'settings': {'subject': subject['id']}})
    assert room['settings']['format'] in subject['formats']
    assert room['settings']['rounds'] == 1
    assert room['settings']['seconds'] == (300 if room['settings']['format'] == 'java' else 75)
    request('/rooms/' + room['id'] + '/leave', {})
print('Example bank: quiz, numeric-only, and Java-only subjects create valid one-round rooms.')
