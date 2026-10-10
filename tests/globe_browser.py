"""Exercise the compiled globe, camera controls and failure recovery without tile-service dependencies."""
import json
import base64
import os
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:3101')
ROOT = Path(__file__).resolve().parent.parent
PREVIEW = ROOT / 'web-interface/public/globe/earth-preview.jpg'
OUT = ROOT / '.impeccable/review'
OUT.mkdir(parents=True, exist_ok=True)


def fixture_tiles(page):
    for pattern in ('https://tiles.maps.eox.at/**', 'https://wmts.geo.admin.ch/**'):
        page.route(pattern, lambda route: route.fulfill(path=str(PREVIEW), content_type='image/jpeg'))


def check_width(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def capture_scene(page, name):
    check_width(page)
    page.screenshot(path=str(OUT / name), animations='disabled')
    screenshot = page.locator('.maplibregl-canvas').screenshot()
    colors = page.evaluate('''async encoded => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + encoded;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        const colors = new Set();
        // Sample the upper-right scene, away from the text and map controls.
        for (let y = 40; y < image.height * .4; y += 12) {
            for (let x = image.width * .6 | 0; x < image.width - 20; x += 12) {
                const offset = (y * image.width + x) * 4;
                colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
            }
        }
        return colors.size;
    }''', base64.b64encode(screenshot).decode())
    assert colors > 30, f'Blank or unrendered map: {name}, {colors} colors'


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel=os.environ.get('PLAYWRIGHT_CHANNEL', 'chrome'))
    errors = []
    desktop = browser.new_page(viewport={'width': 1440, 'height': 1000})
    desktop.on('pageerror', lambda error: errors.append(str(error)))
    fixture_tiles(desktop)
    desktop.goto(BASE + '/campus')
    globe = desktop.locator('.globe-arrival')
    expect(globe).to_have_attribute('data-view', 'earth', timeout=20000)
    assert desktop.locator('.arrival-campus-pin').evaluate('(el) => getComputedStyle(el).opacity') == '0'
    expect(globe).to_have_attribute('data-view', 'flight', timeout=5000)
    expect(globe).to_have_attribute('data-view', 'zurich', timeout=12000)
    capture_scene(desktop, 'campus-desktop.png')
    expect(desktop.locator('.arrival-campus-pin')).to_have_class('arrival-campus-pin is-visible')
    desktop.get_by_role('button', name='Replay journey', exact=True).click()
    expect(globe).to_have_attribute('data-view', 'earth')
    desktop.get_by_role('button', name='Skip intro', exact=True).click()
    expect(globe).to_have_attribute('data-view', 'zurich')
    desktop.get_by_role('link', name='Enter Arena', exact=True).click()
    expect(desktop.get_by_role('heading', name='Set up a match', exact=True)).to_be_visible()
    expect(globe).to_have_count(0)

    mobile = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    mobile.on('pageerror', lambda error: errors.append(str(error)))
    fixture_tiles(mobile)
    mobile.goto(BASE + '/campus')
    expect(mobile.locator('.globe-arrival')).to_have_attribute('data-view', 'zurich', timeout=20000)
    check_width(mobile)
    label = mobile.locator('.arrival-pin-label').bounding_box()
    assert label and label['x'] >= 0 and label['x'] + label['width'] <= 390, label
    capture_scene(mobile, 'campus-mobile.png')
    mobile.get_by_role('link', name='Open learning chat', exact=True).click()
    expect(mobile.locator('textarea')).to_be_visible()
    expect(mobile.locator('.globe-arrival')).to_have_count(0)

    # Unavailable imagery keeps the app links usable and offers a working retry.
    failed = browser.new_page(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
    failed.on('pageerror', lambda error: errors.append(str(error)))
    failed.route('https://tiles.maps.eox.at/**', lambda route: route.abort())
    failed.goto(BASE + '/campus')
    expect(failed.locator('.globe-arrival')).to_have_attribute('data-view', 'unavailable', timeout=20000)
    expect(failed.get_by_role('link', name='Open learning chat', exact=True)).to_be_visible()
    expect(failed.locator('.arrival-placeholder')).not_to_have_class('arrival-placeholder is-hidden')
    failed.unroute('https://tiles.maps.eox.at/**')
    fixture_tiles(failed)
    failed.get_by_role('button', name='Try again', exact=True).click()
    expect(failed.locator('.globe-arrival')).to_have_attribute('data-view', 'zurich', timeout=20000)
    assert not errors, errors
    report = {'passed': True, 'checks': ['automatic Earth-to-Zürich journey', 'campus marker reveal',
              'replay and skip', 'Arena navigation and cleanup', 'mobile marker fits',
              'reduced motion', 'lecture chat navigation', 'tile failure and retry'], 'pageErrors': errors}
    (OUT / 'globe-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    browser.close()
