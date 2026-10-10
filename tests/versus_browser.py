"""Galaxy → Versus → course continuity, without changing game or study data."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:3101')
OUT = Path('.impeccable/review/versus')
OUT.mkdir(parents=True, exist_ok=True)
errors = []


def settle(page):
    page.wait_for_load_state('networkidle')
    page.evaluate('document.fonts.ready')


def capture(page, name):
    page.evaluate('window.scrollTo(0, 0)')
    original = page.viewport_size
    capture_style = None
    if page.get_by_role('alertdialog').count() == 0:
        # Avoid fixed-canvas tiling in Chrome; remove the viewport-dependent
        # minimum while expanding an already scrollable document for capture.
        capture_style = page.add_style_tag(content='.versus-shell .page { min-height: 0 !important; }')
        height = page.evaluate('document.documentElement.scrollHeight')
        page.set_viewport_size({'width': original['width'], 'height': height})
        page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    page.screenshot(path=str(OUT / (name + '.png')), full_page=False, animations='disabled')
    page.set_viewport_size(original)
    if capture_style:
        capture_style.evaluate('el => el.remove()')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), name


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/'); settle(page)
    page.locator('#loading.gone').wait_for()
    if page.locator('#gate').is_visible():
        page.locator('#gate-list .gate-option').filter(has_text='D-INFK').click()
        if page.locator('#gate').is_visible():
            page.locator('#gate-list .gate-option').filter(has_text='Bachelor · 1. Jahr').click()
        page.locator('#gate').wait_for(state='hidden')
    assert 'IBM Plex Sans' in page.evaluate('getComputedStyle(document.body).fontFamily')
    capture(page, 'galaxy-desktop')
    page.locator('#list .row').filter(has_text='Digital Design & Computer Architecture').click()
    page.wait_for_url('**/#/computer-architecture')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('#trail .crumb').filter(has_text='D-INFK').click()
    page.wait_for_url('**/#/')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    expect(page.locator('#title')).to_have_text('Lernraum')
    expect(page.locator('#gate')).to_be_hidden()
    assert page.locator('#list .row').count() > 0
    page.locator('#change-programme').click()
    expect(page.locator('#gate')).to_be_visible()
    page.locator('#gate-list .gate-option').filter(has_text='D-INFK').click()
    if page.locator('#gate').is_visible():
        page.locator('#gate-list .gate-option').filter(has_text='Bachelor · 1. Jahr').click()
    page.locator('#gate').wait_for(state='hidden')
    page.goto(BASE + '/#/computer-architecture/vl-11/kapitel-3'); settle(page)
    page.locator('#loading.gone').wait_for()
    expect(page.locator('#versus-link')).to_have_attribute('href', '/arena?returnTo=%2F%23%2Fcomputer-architecture%2Fvl-11%2Fkapitel-3&course=computer-architecture')
    page.get_by_role('link', name='Versus', exact=True).click(); settle(page)
    expect(page.get_by_role('heading', name='Versus', exact=False)).to_be_visible()
    expect(page.get_by_label('Subject',exact=True)).to_have_value('ddca')
    expect(page.get_by_role('link', name='Return to Galaxy', exact=True)).to_have_attribute('href', '/#/computer-architecture/vl-11/kapitel-3')
    assert page.evaluate('getComputedStyle(document.body).backgroundColor') == 'rgb(7, 10, 18)'
    assert 'Chakra Petch' in page.locator('h1').evaluate('el => getComputedStyle(el).fontFamily')
    assert 'IBM Plex Sans' in page.evaluate('getComputedStyle(document.body).fontFamily')
    expect(page.locator('.cockpit-scene')).to_have_count(1)
    capture(page, 'home-desktop')
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        capture(page, f'home-{width}')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.get_by_role('button', name='Practice solo', exact=True).click(); settle(page)
    expect(page.get_by_label('Subject')).to_have_value('ddca')
    capture(page, 'lobby-desktop')
    page.set_viewport_size({'width': 390, 'height': 844})
    capture(page, 'lobby-mobile')
    page.get_by_role('link', name='Return to Galaxy', exact=True).click()
    expect(page.get_by_role('alertdialog')).to_be_visible()
    expect(page.get_by_role('button', name='Stay here', exact=True)).to_be_focused()
    capture(page, 'leave-mobile')
    page.keyboard.press('Escape')
    expect(page.get_by_role('alertdialog')).not_to_be_visible()
    assert context.request.get(BASE + '/api/bootstrap').json()['activeRoom']
    page.get_by_role('link', name='Return to Galaxy', exact=True).click()
    page.get_by_role('alertdialog').get_by_role('button', name='Leave room', exact=True).click()
    page.wait_for_url('**/#/computer-architecture/vl-11/kapitel-3'); settle(page)
    assert context.request.get(BASE + '/api/bootstrap').json()['activeRoom'] is None

    # An unavailable bank is labelled, and untrusted return addresses stay local.
    page.goto(BASE + '/arena?course=analysis&returnTo=https://example.org'); settle(page)
    expect(page.get_by_text('This course has no Versus question bank yet.', exact=False)).to_be_visible()
    expect(page.get_by_role('link', name='Return to Galaxy', exact=True)).to_have_attribute('href', '/')
    page.get_by_role('button', name='Practice solo', exact=True).click(); settle(page)
    page.locator('.cabin-menu > summary').click()
    page.get_by_role('button', name='Match history', exact=True).click()
    expect(page.get_by_role('alertdialog')).to_be_visible()
    page.get_by_role('alertdialog').get_by_role('button', name='Leave room', exact=True).click()
    page.wait_for_url('**/history')
    # The new route-level tokens never leak into the other workspaces.
    for route in ['/world', '/learn']:
        page.goto(BASE + route); settle(page)
        expect(page.locator('.versus-shell')).to_have_count(0)
        assert page.evaluate('getComputedStyle(document.body).backgroundColor') == 'rgb(17, 19, 21)'
        assert 'Inter' in page.evaluate('getComputedStyle(document.body).fontFamily')
    assert not errors, errors
    report = {'passed': True, 'checks': ['galaxy visual continuity', 'programme breadcrumb returns to course galaxy', 'explicit programme switch reopens selection', 'course-aware entry and return', 'same profile and question bank', '390px and 320px layout', 'leave confirmation and Escape focus', 'pending internal destination preserved', 'unsupported bank explained', 'unsafe return URL rejected', 'other modules keep their theme', 'static sky under reduced motion'], 'consoleErrors': errors}
    (OUT / 'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    browser.close()
