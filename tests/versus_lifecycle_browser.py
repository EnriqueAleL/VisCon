"""Exercise solo and two-player Versus exit flows."""
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:3101')

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
    solo_context = browser.new_context(reduced_motion='reduce')
    solo = solo_context.new_page()
    solo.goto(BASE + '/arena')
    solo.wait_for_load_state('networkidle')
    solo.get_by_role('button', name='Practice solo', exact=True).click()
    solo.wait_for_url('**/room/*')
    expect(solo.get_by_role('button', name='Ready to play', exact=True)).to_be_enabled()
    solo.get_by_role('button', name='Ready to play', exact=True).click()
    expect(solo.locator('.answer-options')).to_be_visible(timeout=10000)
    solo.locator('.answer-option').first.click()
    solo.get_by_role('button', name='Lock answer', exact=True).click()
    solo.get_by_role('button', name='Leave match', exact=True).click()
    expect(solo.get_by_role('alertdialog')).to_be_visible()
    solo.get_by_role('alertdialog').get_by_role('button', name='Leave match', exact=True).click()
    solo.wait_for_url('**/arena')
    expect(solo.get_by_role('button', name='Practice solo', exact=True)).to_be_enabled()
    assert solo_context.request.get(BASE + '/api/bootstrap').json()['activeRoom'] is None

    host_context = browser.new_context(reduced_motion='reduce')
    guest_context = browser.new_context(reduced_motion='reduce')
    host, guest = host_context.new_page(), guest_context.new_page()
    host.goto(BASE + '/arena'); host.wait_for_load_state('networkidle')
    guest.goto(BASE + '/arena'); guest.wait_for_load_state('networkidle')
    host.get_by_role('button', name='Create a room', exact=True).click()
    host.wait_for_url('**/room/*')
    guest.goto(host.url); guest.wait_for_load_state('networkidle')
    expect(host.locator('.players-panel .player-row')).to_have_count(2)
    host.get_by_role('button', name='Ready to play', exact=True).click()
    guest.get_by_role('button', name='Ready to play', exact=True).click()
    expect(host.locator('.answer-options')).to_be_visible(timeout=10000)
    expect(guest.locator('.answer-options')).to_be_visible(timeout=10000)
    host.locator('.answer-option').first.click()
    host.get_by_role('button', name='Lock answer', exact=True).click()
    host.get_by_role('button', name='Leave match', exact=True).click()
    host.get_by_role('alertdialog').get_by_role('button', name='Leave match', exact=True).click()
    host.wait_for_url('**/arena')
    expect(guest.locator('.result-intro')).to_be_visible(timeout=10000)
    expect(guest.locator('.result-divider')).to_contain_text('You won')
    assert host_context.request.get(BASE + '/api/bootstrap').json()['activeRoom'] is None
    assert guest_context.request.get(BASE + '/api/bootstrap').json()['activeRoom'] is None

    # Browser Back must ask before abandoning a live solo match.
    solo.get_by_role('button', name='Practice solo', exact=True).click()
    solo.wait_for_url('**/room/*')
    solo.get_by_role('button', name='Ready to play', exact=True).click()
    expect(solo.locator('.answer-options')).to_be_visible(timeout=10000)
    solo.go_back()
    expect(solo.get_by_role('alertdialog')).to_be_visible()
    solo.get_by_role('alertdialog').get_by_role('button', name='Stay here', exact=True).click()
    expect(solo.locator('.answer-options')).to_be_visible()
    solo.go_back()
    expect(solo.get_by_role('alertdialog')).to_be_visible()
    solo.route('**/api/rooms/*/leave', lambda route: route.fulfill(status=503, content_type='application/json', body='{"error":"Temporary outage"}'))
    solo.get_by_role('alertdialog').get_by_role('button', name='Leave match', exact=True).click()
    expect(solo.get_by_role('alertdialog')).to_contain_text('Temporary outage')
    solo.unroute('**/api/rooms/*/leave')
    solo.get_by_role('alertdialog').get_by_role('button', name='Leave match', exact=True).click()
    solo.wait_for_url('**/arena')
    assert solo_context.request.get(BASE + '/api/bootstrap').json()['activeRoom'] is None

    # The Java editor link in a live lobby must also leave the room cleanly.
    solo.get_by_label('Subject', exact=True).select_option('programming')
    solo.get_by_role('button', name='Practice solo', exact=True).click()
    solo.wait_for_url('**/room/*')
    solo.locator('.settings-panel > summary').click()
    solo.locator('.format-option').filter(has_text='Java').click()
    solo.get_by_role('button', name='Explore the editor').click()
    expect(solo.get_by_role('alertdialog')).to_be_visible()
    solo.get_by_role('alertdialog').get_by_role('button', name='Leave room', exact=True).click()
    solo.wait_for_url('**/java')
    assert solo_context.request.get(BASE + '/api/bootstrap').json()['activeRoom'] is None
    browser.close()
