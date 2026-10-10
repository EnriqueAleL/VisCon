"""Integration against a running shared server; no model credentials needed."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:3101')
OUT = Path('.impeccable/review')
OUT.mkdir(parents=True, exist_ok=True)
errors = []


def settle(page):
    page.wait_for_load_state('networkidle')
    page.evaluate('document.fonts.ready')


def capture(page, name):
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(OUT / name), full_page=page.locator('dialog[open]').count() == 0, animations='disabled')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), name


def recording_course(page):
    page.get_by_role('button', name='Kurse', exact=True).click()
    page.get_by_role('group', name='Departement').get_by_role('button', name='D-INFK', exact=False).click()
    page.get_by_role('button', name='Bachelor (BSc), 1. Studienjahr', exact=True).click()
    page.get_by_role('button', name='Digital Design & Computer Architecture', exact=True).click()


def demo_course(page):
    page.get_by_role('button', name='Kurse', exact=True).click()
    page.get_by_role('group', name='Departement').get_by_role('button', name='D-MATH', exact=False).click()
    page.get_by_role('button', name='Bachelor (BSc), 1. Studienjahr', exact=True).click()
    page.get_by_role('button', name='Lineare Algebra I · Demo', exact=True).click()


def ask(page, text):
    page.get_by_label('Nachricht eingeben').fill(text)
    page.get_by_role('button', name='Frage stellen', exact=True).click()
    expect(page.get_by_role('heading', name='Aus dem Transkript', exact=True)).to_be_visible()


def check_moment(page, start, available):
    if available:
        page.wait_for_function('(start) => Math.abs(document.querySelector("video")?.currentTime - start) < 0.5', arg=start)
        page.wait_for_function('document.querySelector("video")?.readyState >= 2 && !document.querySelector("video").seeking')
    else:
        expect(page.locator('.missing-video')).to_be_visible()
    minutes, seconds = divmod(int(start), 60)
    expect(page.locator('.selected-moment')).to_contain_text(f'{minutes}:{seconds:02d}')


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    api = context.request
    lectures = api.get(BASE + '/api/lectures').json()['lectures']
    assert len(lectures) == 27
    assert sum(not item['demo'] for item in lectures) == 24
    assert api.get(BASE + '/api/lectures/lec1/summary').json()['summary']['overview']
    assert api.get(BASE + '/api/lectures/lec2/summary').json()['summary'] is None
    assert api.get(BASE + '/api/lectures/missing').status == 404
    assert api.get(BASE + '/api/unknown').status == 404
    assert api.get(BASE + '/media/not-present.mp4').status == 404
    response = api.get(BASE + '/media/lectures/lec7.mp4', headers={'Range': 'bytes=0-31'})
    assert response.status == 206 and len(response.body()) == 32
    assert response.headers['content-range'].startswith('bytes 0-31/')
    assert api.head(BASE + '/media/lectures/lec7.mp4').status == 200
    assert api.get(BASE + '/media/lectures/lec7.vtt').text().startswith('WEBVTT')
    assert api.get(BASE + '/media/chapters/lec7.chapters.vtt').text().startswith('WEBVTT')
    recording = next(item for item in lectures if item['id'] == 'lec7')
    recording_available = bool(recording['mediaUrl'])
    assert api.post(BASE + '/api/ask', data={'question': 'MIPS', 'lectureId': 'lec7', 'courseId': 'analysis'}).status == 400

    page.goto(BASE + '/learn'); settle(page)
    assert page.evaluate('getComputedStyle(document.body).backgroundColor') == 'rgb(17, 19, 21)'
    assert 'Inter' in page.evaluate('getComputedStyle(document.body).fontFamily')
    expect(page.get_by_label('Nachricht eingeben')).to_be_disabled()
    page.get_by_role('button', name='Kurse', exact=True).hover()
    expect(page.get_by_role('dialog', name='Kursauswahl')).to_be_visible()
    capture(page, 'integration-picker-desktop.png')
    recording_course(page)
    ask(page, 'MIPS byte addressable')
    expect(page.locator('.lecture-card')).to_have_count(1)
    capture(page, 'integration-search-desktop.png')
    source = api.post(BASE + '/api/ask', data={'question': 'MIPS byte addressable', 'courseId': 'computer-architecture'}).json()['sources'][0]
    page.locator('.segment-open').first.click()
    expect(page.get_by_role('dialog', name='Lecture 7')).to_be_visible()
    check_moment(page, source['start'], recording_available)
    if recording_available:
        page.locator('video').evaluate('async video => { video.muted = true; await video.play(); }')
        page.wait_for_function('!document.querySelector("video").paused')
        page.locator('video').evaluate('video => video.pause()')
    page.get_by_role('button', name='Aktuelle Stelle speichern', exact=True).click()
    capture(page, 'integration-player-desktop.png')
    page.set_viewport_size({'width': 390, 'height': 844})
    capture(page, 'integration-player-mobile.png')
    chapter = next(item for item in lectures if item['id'] == 'lec7')['chapters'][2]
    page.locator('.viewer-segment-select').nth(2).click()
    check_moment(page, chapter['start'], recording_available)
    page.get_by_role('button', name='Transkript', exact=True).click()
    expect(page.locator('.viewer-segment-select p').first).not_to_be_empty()
    page.get_by_role('button', name='Vorlesung schliessen', exact=True).click()
    expect(page.locator('.toast')).not_to_be_visible(timeout=5000)
    capture(page, 'integration-search-mobile.png')
    page.get_by_role('button', name='Gespeicherte Stellen', exact=True).click()
    expect(page.locator('.lecture-card')).to_have_count(1)
    page.reload(); settle(page)
    expect(page.locator('.lecture-card')).to_have_count(1)
    page.locator('.segment-open').first.click()
    check_moment(page, source['start'], recording_available)
    page.keyboard.press('Escape')

    page.set_viewport_size({'width': 1440, 'height': 1000})
    demo_course(page)
    ask(page, 'Eigenwerte und Eigenvektoren')
    expect(page.locator('.lecture-card')).to_have_count(1)
    expect(page.locator('.lecture-title')).to_contain_text('Demo')
    page.locator('.segment-open').first.click()
    demo_source = api.post(BASE + '/api/ask', data={'question': 'Eigenwerte und Eigenvektoren', 'courseId': 'linear-algebra'}).json()['sources'][0]
    check_moment(page, demo_source['start'], True)
    page.locator('video').evaluate('async video => { video.muted = true; await video.play(); }')
    page.wait_for_function('!document.querySelector("video").paused')
    page.locator('video').evaluate('video => video.pause()')
    assert page.locator('video').evaluate('video => video.duration') <= 91
    page.keyboard.press('Escape')

    # Restoring chat history also restores the course scope and runs a fresh request.
    page.get_by_role('button', name='Chat', exact=True).click()
    page.locator('.history-panel-list button').filter(has_text='MIPS byte addressable').click()
    expect(page.locator('.lecture-title')).to_contain_text('Lecture 7')
    page.get_by_role('button', name='Meine Vorlesungen', exact=True).click()
    page.get_by_role('button', name='Lecture 1 öffnen', exact=True).click()
    page.get_by_role('button', name='Lernnotizen', exact=True).click()
    expect(page.get_by_role('heading', name='Zum Mitnehmen', exact=True)).to_be_visible()
    page.keyboard.press('Escape')

    # API errors remain recoverable and never resurrect an earlier answer.
    recording_course(page)
    page.route('**/api/ask', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Test: Suche vorübergehend nicht verfügbar"}'))
    page.get_by_label('Nachricht eingeben').fill('MIPS byte addressable')
    page.get_by_role('button', name='Frage stellen', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Test: Suche')
    expect(page.locator('.lecture-card')).to_have_count(0)
    page.unroute('**/api/ask')
    page.get_by_role('button', name='Suche erneut versuchen', exact=True).click()
    expect(page.locator('.lecture-card')).to_have_count(1)
    page.get_by_label('Nachricht eingeben').fill('quasar xylophone')
    page.get_by_role('button', name='Frage stellen', exact=True).click()
    expect(page.get_by_role('heading', name='Keine passende Stelle gefunden', exact=True)).to_be_visible()
    expect(page.locator('.lecture-card')).to_have_count(0)

    page.evaluate("""() => {
        window.originalFetch = window.fetch;
        window.askAborted = false;
        window.fetch = (input, options) => String(input).endsWith('/api/ask')
            ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
                window.askAborted = true;
                reject(new DOMException('Aborted', 'AbortError'));
            }, {once: true}))
            : window.originalFetch(input, options);
    }""")
    page.get_by_label('Nachricht eingeben').fill('MIPS')
    page.get_by_role('button', name='Frage stellen', exact=True).click()
    expect(page.get_by_role('button', name='Erneut suchen', exact=True)).to_be_visible()
    demo_course(page)
    expect(page.locator('.answer-panel')).to_have_count(0)
    expect(page.get_by_label('Nachricht eingeben')).to_have_value('')
    assert page.evaluate('window.askAborted')
    page.evaluate('() => { window.fetch = window.originalFetch; }')
    ask(page, 'Eigenwerte und Eigenvektoren')
    expect(page.locator('.lecture-title')).to_contain_text('Demo')

    # The new Arena icon enters the existing app and keeps its session on return.
    page.locator('.sidebar').get_by_role('link', name='Versus', exact=True).click(); settle(page)
    expect(page.get_by_role('heading', name='Versus', exact=False)).to_be_visible()
    profile = api.get(BASE + '/api/bootstrap').json()['profile']['id']
    page.get_by_role('button', name='Practice solo', exact=True).click()
    expect(page.get_by_text('Practice bot · Ready', exact=True)).to_be_visible()
    page.locator('.cabin-menu > summary').click()
    page.get_by_role('link', name='Lectures', exact=True).click()
    expect(page.get_by_role('alertdialog')).to_be_visible()
    page.get_by_role('button', name='Stay here', exact=True).click()
    expect(page.get_by_role('alertdialog')).not_to_be_visible()
    page.locator('.cabin-menu > summary').click()
    page.get_by_role('link', name='Lectures', exact=True).click()
    page.get_by_role('alertdialog').get_by_role('button', name='Leave room', exact=True).click()
    page.wait_for_url('**/learn'); settle(page)
    assert api.get(BASE + '/api/bootstrap').json()['profile']['id'] == profile
    assert api.get(BASE + '/api/bootstrap').json()['activeRoom'] is None
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Kurse', exact=True).click()
    capture(page, 'integration-picker-mobile.png')
    page.get_by_role('button', name='Kursauswahl schliessen', exact=True).click()
    capture(page, 'integration-landing-mobile.png')
    assert not errors, errors
    report = {'passed': True, 'recordingVideoAvailable': recording_available, 'checks': ['24 real lectures + 3 playable demos', 'latest icon navigation and hover picker', 'archive and year/semester/study-year course selection', 'real search and exact demo video seek/playback', 'chapter selection and transcript', 'missing LFS recording fallback or exact recording seek', 'captions and chapter tracks', 'cached notes', 'persistent exact saved moments', 'course-scoped chat history', 'stale-request cancellation', 'recoverable search errors', 'honest no-match', 'HTTP Range and HEAD', 'Arena navigation with leave confirmation', 'same player session', 'desktop/mobile overflow'], 'consoleErrors': errors}
    (OUT / 'integration-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    browser.close()
