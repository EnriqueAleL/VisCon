"""Exercise The Mania through its production UI with two isolated student sessions.

Run through tests/run_browser.py to keep real student data untouched. Ground-truth
answers are read from the local private bank, never from the public quest API.
"""
import json
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:3101').rstrip('/')
OUT = ROOT / '.impeccable/review'
OUT.mkdir(parents=True, exist_ok=True)
errors = []
console_errors = []
checks = []
bank = json.loads(subprocess.check_output(
    ['node', '--import', 'tsx', '--input-type=module', '-e',
     'import {loadWorld} from "./server/world.ts"; const {bank}=await loadWorld(); console.log(JSON.stringify(bank.map(q=>({id:q.id,answer:q.answer}))));'],
    cwd=ROOT, text=True))
answers = {item['id']: item['answer'] for item in bank}


def settle(page):
    page.wait_for_load_state('domcontentloaded')
    page.evaluate('document.fonts.ready')


def capture(page, name):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Horizontal overflow: {name}'
    page.screenshot(path=str(OUT / f'mania-{name}.png'), full_page=True, animations='disabled')


def track(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)


def select_city(page, name):
    page.locator('.city-directory').get_by_role('button', name=re.compile(re.escape(name))).click()
    expect(page.locator('.city-detail-card h2')).to_have_text(name)


def open_quest(page):
    with page.expect_response(lambda response: '/quest' in response.url and '/api/mania/cities/' in response.url) as reply:
        page.get_by_role('button', name='Claim with recall', exact=True).click()
    quest = reply.value.json()
    assert quest['questions']
    assert all('answer' not in item and 'explanation' not in item for item in quest['questions'])
    expect(page.get_by_role('button', name='Check my recall', exact=True)).to_be_disabled()
    return quest


def answer_quest(page, quest, wrong=False):
    for question in quest['questions']:
        choice = answers[question['id']]
        if wrong:
            choice = next(option['id'] for option in question['options'] if option['id'] != choice)
        page.locator(f'input[name="{question["id"]}"][value="{choice}"]').check()
    with page.expect_response(lambda response: '/review' in response.url and '/api/mania/cities/' in response.url) as reply:
        page.get_by_role('button', name='Check my recall', exact=True).click()
    assert reply.value.ok, reply.value.text()
    return reply.value.json()


def moment(page, start):
    expect(page.locator('.lm-player-heading')).to_contain_text(f'{int(start)//60}:{int(start)%60:02d}')
    page.wait_for_function('document.querySelector(".lm-player video") || document.querySelector(".lm-player .lm-empty strong")')
    video = page.locator('.lm-player video')
    if video.count():
        page.wait_for_function('(start) => Math.abs(document.querySelector(".lm-player video")?.currentTime - start) < .5', arg=start)
    else:
        expect(page.get_by_text('Read this lecture moment', exact=True)).to_be_visible()


def step_vm_to_end(page):
    vm = page.get_by_role('region', name='Virtual memory page walk visualizer')
    vm.get_by_role('button', name='Start walk', exact=True).click()
    for _ in range(8):
        next_step = vm.get_by_role('button', name='Next step', exact=True)
        if not next_step.count():
            break
        next_step.click()
    expect(vm.get_by_role('button', name='Translate again', exact=True)).to_be_visible()


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel=os.environ.get('PLAYWRIGHT_CHANNEL', 'chrome'), headless=True)
    host = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    guest = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    a, b = host.new_page(), guest.new_page()
    track(a); track(b)
    api, other = host.request, guest.request
    a.goto(BASE + '/world'); settle(a)
    expect(a.get_by_role('heading', name='Your semester, made visible.')).to_be_visible()
    expect(a.locator('.semester-map')).to_have_class('semester-map galaxy')
    world = api.get(BASE + '/api/mania/world').json()
    assert world['stats']['lectures'] == 24 and world['stats']['totalChapters'] == 512
    assert world['stats']['contentChapters'] + world['stats']['excludedChapters'] == 512
    assert len(world['cities']) == 24
    assert sum(len(city['chapters']) for city in world['cities']) == world['stats']['contentChapters']
    assert all('answer' not in chapter for city in world['cities'] for chapter in city['chapters'])
    assert sum(planet['available'] for planet in world['planets']) == 1
    progress = api.get(BASE + '/api/mania/progress').json()
    assert progress['readiness'] == 0 and all(city['status'] == 'dark' for city in progress['cities'])
    assert len({stop['cityId'] for stop in progress['expedition']['stops']}) == 3
    capture(a, 'galaxy-desktop')
    a.get_by_role('button', name='Enter planet', exact=True).click()
    expect(a.locator('.semester-map')).to_have_class('semester-map planet')
    expect(a.get_by_role('img', name='DDCA cities on a spherical knowledge map')).to_be_visible()
    a.get_by_role('button', name='Rotate globe left', exact=True).click()
    a.get_by_role('button', name='Reset globe rotation', exact=True).click()
    select_city(a, 'Pipeline City')
    capture(a, 'planet-desktop')
    checks.append('24 real lectures, 512 classified chapters, 24 cities, honest coming-soon planets, galaxy/planet/city navigation')

    # Proxy headers cannot impersonate another student in local/untrusted mode.
    assert api.get(BASE + '/api/mania/progress', headers={'X-User-Id': 'forged', 'X-User-Name': 'Forged'}).json()['profile']['id'] == progress['profile']['id']
    api.post(BASE + '/api/profile', data={'name': 'Mania QA Host'})
    other.get(BASE + '/api/mania/progress')
    other.post(BASE + '/api/profile', data={'name': 'Mania QA Guest'})
    a.reload(); settle(a)

    # The pre-reviewed stage answer must retain its real lecture timestamp.
    with a.expect_response(lambda response: response.url.endswith('/api/mania/ask')) as reply:
        a.get_by_role('button', name='Load-use hazards', exact=True).click()
    answer = reply.value.json()
    assert answer['answer']['mode'] == 'demo_cached'
    assert answer['sources'][0]['lectureId'] == 'lec11'
    assert abs(answer['sources'][0]['start'] - 4720.044) < .01
    expect(a.locator('.city-workspace h2')).to_have_text('Pipeline City')
    moment(a, answer['sources'][0]['start'])
    capture(a, 'exact-lecture-desktop')
    a.get_by_role('button', name='Visualize this', exact=True).click()
    pipe = a.get_by_role('region', name='Pipeline Factory interactive visualizer')
    expect(pipe.get_by_label('TEACHING EXAMPLE')).to_have_value('load-use')
    pipe.get_by_label(re.compile('YOUR INSTRUCTIONS')).fill('LW r1, 0(r20)\nADD r2, r1, r3')
    expect(pipe.locator('.pipe-stats')).to_contain_text('/ 07')
    pipe.get_by_role('button', name='Step', exact=True).click()
    pipe.get_by_role('button', name='Step', exact=True).click()
    pipe.get_by_role('button', name='No stall', exact=True).click()
    expect(pipe.locator('.pipe-feedback')).to_contain_text('Try the explanation.')
    pipe.get_by_role('button', name='Step', exact=True).click()
    expect(pipe.get_by_role('img', name='Pipeline stages in cycle 4')).to_be_visible()
    capture(a, 'pipeline-desktop')
    pipe.get_by_role('button', name='Previous cycle', exact=True).click()
    pipe.get_by_role('checkbox').uncheck()
    expect(pipe.locator('.pipe-stats')).to_contain_text('/ 08')
    expect(pipe.locator('.pipe-forward-badge')).to_have_text('Forwarding off')
    pipe.get_by_label(re.compile('YOUR INSTRUCTIONS')).fill('INVALID r1, r2, r3')
    expect(pipe.get_by_role('alert')).to_contain_text('Line 1')
    expect(pipe.get_by_role('button', name='Step', exact=True)).to_be_disabled()
    checks.append('cached Q&A exact 4720.044s source; lecture-synced preset; pipeline bubbles, predictions, backward step, forwarding and invalid instruction recovery')

    # Wrong recall links to its own source, and successful full recall lights the city.
    quest = open_quest(a)
    wrong = answer_quest(a, quest, wrong=True)
    assert wrong['correctCount'] == 0 and not wrong['passed']
    expect(a.get_by_role('heading', name='You found what to revisit.', exact=True)).to_be_visible()
    a.locator('.quest-review').first.get_by_role('button', name='Watch the explanation', exact=True).click()
    moment(a, wrong['results'][0]['source']['start'])
    quest = open_quest(a)
    result = answer_quest(a, quest)
    assert result['passed'] and result['correctCount'] == result['total']
    expect(a.locator('.city-state-tag')).to_have_text('claimed')
    assert api.post(BASE + '/api/mania/cities/pipelining/review', data={'questId': quest['questId'], 'answers': {item['id']: answers[item['id']] for item in quest['questions']}}).status == 400
    assert other.post(BASE + '/api/mania/cities/pipelining/review', data={'questId': quest['questId'], 'answers': {}}).status == 400
    a.reload(); settle(a)
    assert next(city for city in api.get(BASE + '/api/mania/progress').json()['cities'] if city['cityId'] == 'pipelining')['reviewCount'] == 2
    real_counts = [(city['cityId'], city['reviewCount'], city['puzzleSolved']) for city in api.get(BASE + '/api/mania/progress').json()['cities']]
    a.get_by_role('button', name='Try demo history', exact=True).click()
    expect(a.locator('.mania-banner')).to_contain_text('simulated week')
    demo_progress = api.get(BASE + '/api/mania/progress?demo=1').json()
    assert any(city['status'] == 'dimming' for city in demo_progress['cities'])
    a.get_by_role('button', name='Demo history on', exact=True).click()
    expect(a.locator('.mania-banner')).to_have_count(0)
    assert [(city['cityId'], city['reviewCount'], city['puzzleSolved']) for city in api.get(BASE + '/api/mania/progress').json()['cities']] == real_counts
    # A delayed fetch may resolve even after cancellation. It must not overwrite a
    # real profile after the student has already switched out of the demo world.
    a.evaluate('''fixture => {
        window.maniaOriginalFetch = window.fetch;
        window.fetch = (input, options) => String(input) === '/api/mania/progress?demo=1'
            ? new Promise(resolve => { window.maniaResolveOldDemo = () => resolve(new Response(JSON.stringify(fixture), {headers: {'Content-Type': 'application/json'}})); })
            : window.maniaOriginalFetch(input, options);
    }''', demo_progress)
    a.get_by_role('button', name='Try demo history', exact=True).click()
    a.wait_for_function('typeof window.maniaResolveOldDemo === "function"')
    a.get_by_role('button', name='Demo history on', exact=True).click()
    expected_readiness = api.get(BASE + '/api/mania/progress').json()['readiness']
    expect(a.locator('.readiness-ring strong')).to_have_text(f'{expected_readiness}%')
    a.evaluate('''async () => { window.maniaResolveOldDemo(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.fetch = window.maniaOriginalFetch; }''')
    expect(a.locator('.readiness-ring strong')).to_have_text(f'{expected_readiness}%')
    expect(a.locator('.mania-banner')).to_have_count(0)
    checks.append('answer-free recall quests; wrong answer source; full quest claims city; replay/other-user rejection; persistent real/demo isolation, including late canceled demo fetch')

    select_city(a, 'Cache Harbour')
    a.get_by_role('button', name='Enter landmark', exact=True).click()
    cache = a.get_by_role('region', name='Cache Harbour interactive visualizer')
    expect(cache).to_be_visible()
    cache.get_by_label(re.compile('ACCESS SEQUENCE')).fill('0, 64, 0')
    cache.get_by_role('button', name='Load trace', exact=True).click()
    for title, misses in [('Direct mapped', '3'), ('2-way', '2'), ('Fully associative', '2')]:
        cache.get_by_role('tab', name=re.compile('^' + re.escape(title))).click()
        for _ in range(3): cache.get_by_role('button', name='Step access', exact=True).click()
        expect(cache.locator('.cache-viz__amber')).to_have_text(misses)
    cache.get_by_role('button', name='Previous cache access', exact=True).click()
    cache.get_by_role('button', name='Reset cache trace', exact=True).click()
    cache.get_by_role('checkbox', name='Predict, then step', exact=True).check()
    expect(cache.get_by_role('button', name='Step access', exact=True)).to_be_disabled()
    cache.get_by_role('button', name='Hit', exact=True).click()
    expect(cache.locator('.cache-viz__feedback')).to_be_visible()
    expect(cache.get_by_role('button', name='See the lecture', exact=True)).to_be_visible()
    capture(a, 'cache-desktop')
    checks.append('same custom trace gives direct 3 misses, 2-way 2, fully associative 2; address routing/LRU; prediction and exact lecture recovery')

    select_city(a, 'Virtual Vista')
    a.get_by_role('button', name='Enter landmark', exact=True).click()
    vm = a.get_by_role('region', name='Virtual memory page walk visualizer')
    expect(vm).to_be_visible()
    vm.get_by_role('button', name='Translation succeeds', exact=True).click()
    step_vm_to_end(a)
    expect(vm.locator('.vm-viz__feedback')).to_contain_text('Exactly.')
    vm.get_by_role('button', name='A missing page', exact=True).click()
    vm.get_by_role('button', name='Page fault', exact=True).click()
    step_vm_to_end(a)
    expect(vm.locator('.vm-viz__feedback')).to_contain_text('Exactly.')
    vm.get_by_role('button', name='A forbidden write', exact=True).click()
    vm.get_by_role('button', name='Protection fault', exact=True).click()
    step_vm_to_end(a)
    expect(vm.locator('.vm-viz__feedback')).to_contain_text('Exactly.')
    capture(a, 'virtual-memory-desktop')
    checks.append('virtual-memory mapped translation, missing page and write permission fault predictions')

    a.get_by_role('button', name='Exam settings', exact=True).click()
    date = (datetime.now(timezone.utc) + timedelta(days=7)).strftime('%Y-%m-%d')
    a.get_by_label('Your Basisprüfung date', exact=True).fill(date)
    a.get_by_role('button', name='Save exam date', exact=True).click()
    a.get_by_role('button', name='Daily expedition', exact=True).click()
    assert api.get(BASE + '/api/mania/progress').json()['exam']['mockExamMode']
    expect(a.locator('.mock-exam')).to_be_visible()
    capture(a, 'expedition-desktop')
    counts_before = [(city['cityId'], city['reviewCount']) for city in api.get(BASE + '/api/mania/progress').json()['cities']]
    with a.expect_response(lambda response: '/api/mania/mock-exam' in response.url and response.request.method == 'GET') as reply:
        a.get_by_role('button', name='Start a 15-minute mock exam', exact=True).click()
    exam = reply.value.json()
    assert len(exam['questions']) == 12 and len({question['cityId'] for question in exam['questions']}) == 12
    expect(a.get_by_role('button', name='Submit my attempt', exact=True)).to_be_disabled()
    for index, question in enumerate(exam['questions']):
        choice = answers[question['id']]
        if index == 0:
            choice = next(option['id'] for option in question['options'] if option['id'] != choice)
        text = next(option['text'] for option in question['options'] if option['id'] == choice)
        a.locator('.mock-exam__question').filter(has_text=question['prompt']).get_by_role('radio', name=text, exact=True).check()
    with a.expect_response(lambda response: response.url.endswith('/api/mania/mock-exam/review')) as reply:
        a.get_by_role('button', name='Submit my attempt', exact=True).click()
    mixed_result = reply.value.json()
    assert mixed_result['correctCount'] == 11 and mixed_result['total'] == 12
    assert [(city['cityId'], city['reviewCount']) for city in mixed_result['snapshot']['cities']] == counts_before
    expect(a.get_by_role('heading', name='11 of 12 recalled.', exact=True)).to_be_visible()
    a.locator('.mock-exam__review').filter(has=a.get_by_role('button', name=re.compile('Watch the explanation'))).get_by_role('button').click()
    missed = next(result for result in mixed_result['results'] if not result['correct'])
    moment(a, missed['source']['start'])
    checks.append('personal exam date unlocks timed mixed exam; 12 cities, full submission, weakness feedback without falsely claiming cities, exact wrong-answer source')

    # A leaderboard attempt is timed and server-scored; a client-supplied score is ignored.
    a.get_by_role('button', name='Cursed puzzles', exact=True).click()
    hub = a.get_by_role('region', name='Cursed puzzles', exact=True)
    expect(hub.get_by_role('button', name='Start a 60s attempt', exact=True)).to_be_enabled()
    with a.expect_response(lambda response: '/api/puzzles/pipeline-reorder/start' in response.url) as reply:
        hub.get_by_role('button', name='Start a 60s attempt', exact=True).click()
    attempt = reply.value.json()
    assert attempt['timeLimit'] == 60
    current = [f'i{i}' for i in range(1, 9)]
    target = ['i1', 'i3', 'i5', 'i2', 'i4', 'i6', 'i7', 'i8']
    for position, instruction in enumerate(target):
        while current.index(instruction) > position:
            previous = current.index(instruction)
            hub.get_by_role('button', name=f'Move instruction {instruction.upper()} up', exact=True).click()
            current[previous - 1], current[previous] = current[previous], current[previous - 1]
    with a.expect_response(lambda response: '/api/puzzles/pipeline-reorder/submit' in response.url) as reply:
        hub.get_by_role('button', name='Submit to the city board', exact=True).click()
    submitted = reply.value.json()
    assert submitted['score']['cycles'] == 12 and submitted['score']['stalls'] == 0
    expect(hub.locator('.puzzle-leaderboard')).to_contain_text('Mania QA Host')
    assert api.post(BASE + '/api/puzzles/pipeline-reorder/submit', data={'sessionId': attempt['sessionId'], 'orderIds': target}).status == 409
    assert other.post(BASE + '/api/puzzles/pipeline-reorder/submit', data={'sessionId': attempt['sessionId'], 'orderIds': target}).status == 403
    spoof_attempt = other.post(BASE + '/api/puzzles/pipeline-reorder/start', data={}).json()
    spoofed = other.post(BASE + '/api/puzzles/pipeline-reorder/submit', data={'sessionId': spoof_attempt['sessionId'], 'orderIds': [f'i{i}' for i in range(1, 9)], 'score': 99999999, 'elapsedMs': 0}).json()
    assert spoofed['score']['cycles'] == 15 and spoofed['score']['score'] < 10000
    assert api.post(BASE + '/api/puzzles/pipeline-reorder/start?demo=1', data={}).status == 403
    capture(a, 'puzzle-desktop')
    hub.get_by_role('button', name='Put it on the big screen', exact=True).click()
    projector = a.get_by_role('dialog')
    expect(projector.get_by_role('img', name='Scan this QR code to open the puzzle')).to_be_visible()
    projector.get_by_role('button', name='Start room countdown', exact=True).click()
    expect(projector.get_by_role('button', name='Restart room countdown', exact=True)).to_be_visible()
    capture(a, 'projector-desktop')
    a.keyboard.press('Escape')
    expect(a.get_by_role('dialog')).to_have_count(0)
    checks.append('60-second server-scored 12-cycle pipeline puzzle, real-name mayor/leaderboard, replay/ownership/client-score checks, QR and projector countdown')

    # Two independent browsers share state through default Socket.IO transports.
    a.get_by_role('button', name='Study tables', exact=True).click()
    expect(a.locator('.study-city-select select')).to_be_visible()
    a.locator('.study-city-select select').select_option('pipelining')
    a.get_by_role('button', name='Open a table', exact=True).click()
    a.get_by_label('What are you working on?', exact=True).fill('QA load-use discussion')
    a.get_by_label('Meet at', exact=True).fill('HG library')
    with a.expect_response(lambda response: response.url.endswith('/api/study/tables') and response.request.method == 'POST') as reply:
        a.get_by_role('button', name='Create study table', exact=True).click()
    table = reply.value.json()['table']
    expect(a.get_by_role('button', name='Step together', exact=True)).to_be_enabled()
    b.goto(BASE + f'/world?table={table["id"]}&city=pipelining'); settle(b)
    expect(b.locator('.study-invite')).to_be_visible()
    b.locator('.study-invite').get_by_role('button', name='Join table', exact=True).click()
    expect(b.get_by_role('button', name='Following host', exact=True)).to_be_disabled()
    expect(a.locator('.study-members')).to_contain_text('Mania QA Guest')
    a.get_by_role('button', name='Step together', exact=True).click()
    expect(b.locator('.study-shared-transport')).to_contain_text('Cycle 1 /')
    assert other.put(BASE + f'/api/study/tables/{table["id"]}/state', data={'state': {'kind': 'pipeline', 'step': 7, 'preset': 'load-use', 'forwarding': True}}).status == 403
    b.reload(); settle(b)
    expect(b.locator('.study-shared-transport')).to_contain_text('Cycle 1 /')
    a.get_by_role('button', name='Step together', exact=True).click()
    expect(b.locator('.study-shared-transport')).to_contain_text('Cycle 2 /')
    capture(a, 'table-host-desktop')
    capture(b, 'table-guest-desktop')
    # Host leaving promotes the remaining student; following becomes a usable host control.
    a.get_by_role('button', name='Leave table', exact=True).click()
    expect(b.get_by_role('button', name='Step together', exact=True)).to_be_enabled()
    b.get_by_role('button', name='Step together', exact=True).click()
    expect(b.locator('.study-shared-transport')).to_contain_text('Cycle 3 /')
    checks.append('two real student contexts, shared pipeline steps, guest control rejection, reload/reconnect restoration and host succession')

    # Retain the existing Arena with real, city-scoped DDCA questions.
    a.get_by_role('button', name='Challenge a friend', exact=True).click()
    a.wait_for_url('**/room/*')
    room = api.get(BASE + '/api/rooms/' + a.url.rsplit('/', 1)[1]).json()
    assert room['settings']['subject'] == 'ddca' and room['settings']['topic'] == 'Pipeline City'
    assert room['settings']['rounds'] == 3 and not room['settings']['ranked']
    expect(a.get_by_role('heading', name='Invite your opponent', exact=True)).to_be_visible()
    checks.append('city-scoped duel enters retained Arena with three friendly DDCA rounds')

    # Phone layouts cover the core world and every large workspace.
    a.set_viewport_size({'width': 390, 'height': 844})
    for path, visible, label in [
        ('/world', '.semester-map', 'galaxy-mobile'),
        ('/world?planet=1&city=pipelining&tab=landmark', '.pipeline-visualizer', 'pipeline-mobile'),
        ('/world?planet=1&city=caches&tab=landmark', '.cache-viz', 'cache-mobile'),
        ('/world?planet=1&city=virtual-memory&tab=landmark', '.vm-viz', 'virtual-memory-mobile'),
        ('/world?puzzle=pipeline-reorder', '.puzzle-hub', 'puzzle-mobile'),
        (f'/world?table={table["id"]}&city=pipelining', '.study-panel', 'table-mobile'),
    ]:
        a.goto(BASE + path); settle(a)
        expect(a.locator(visible)).to_be_visible()
        capture(a, label)
    checks.append('390×844 phone: galaxy, pipeline, cache, page walk, puzzle, social table; no horizontal overflow')
    assert not errors, errors
    assert not console_errors, console_errors
    report = {'passed': True, 'checks': checks, 'pageErrors': errors,
              'consoleErrors': console_errors, 'world': world['stats'], 'screenshots': 'mania-*.png', 'base': BASE}
    (OUT / 'mania-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    browser.close()
