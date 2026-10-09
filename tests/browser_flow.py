import json, re, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('TEST_URL', 'http://127.0.0.1:3101')
OUT = Path('.impeccable/review')
OUT.mkdir(parents=True, exist_ok=True)
errors = []
contrasts = {}

def check_contrast(page, selectors):
    for selector in selectors:
        colors = page.locator(selector).first.evaluate('''element => {
            const color = getComputedStyle(element).color;
            let parent = element, background;
            while(parent){
                background = getComputedStyle(parent).backgroundColor;
                if(background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') break;
                parent = parent.parentElement;
            }
            return [color, background];
        }''')
        def luminance(color):
            values = [float(v)/255 for v in re.findall(r'[\d.]+', color)[:3]]
            return sum((v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4)*w
                       for v,w in zip(values,[.2126,.7152,.0722]))
        first,second = map(luminance,colors)
        ratio = (max(first,second)+.05)/(min(first,second)+.05)
        contrasts[selector] = round(ratio,2)
        assert ratio >= 4.5, (selector, colors, ratio)

def settle(page):
    page.wait_for_load_state('networkidle')
    page.evaluate('document.fonts.ready')

def capture(page, name):
    page.evaluate('window.scrollTo(0,0)')
    original=page.viewport_size
    height=page.evaluate('document.documentElement.scrollHeight')
    page.set_viewport_size({'width':original['width'],'height':height})
    page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    page.screenshot(path=str(OUT / name), full_page=False, animations='disabled')
    page.set_viewport_size(original)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Horizontal overflow: {name}'

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True, args=['--disable-gpu'])
    host = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    guest = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    a,b = host.new_page(),guest.new_page()
    for page in (a,b):
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(BASE);settle(page)
    host.request.post(BASE+'/api/profile',data={'name':'Mateo'})
    guest.request.post(BASE+'/api/profile',data={'name':'Alex'})
    a.reload();settle(a)
    expect(a.get_by_role('heading',name='A little competition. A better study session.')).to_be_visible()
    capture(a,'home-desktop.png')
    a.get_by_role('button',name='Create a room',exact=True).click()
    a.wait_for_url('**/room/*');settle(a)
    room_url=a.url
    room_id=room_url.rsplit('/',1)[1]
    b.goto(room_url);settle(b)
    expect(a.get_by_text('2 / 2 players',exact=True)).to_be_visible()
    expect(a.get_by_text('Alex',exact=True)).to_be_visible()
    check_contrast(a,['.estimate-band small','.ready-panel>p'])
    capture(a,'desktop.png')
    a.set_viewport_size({'width':390,'height':844});capture(a,'mobile.png')
    a.set_viewport_size({'width':1440,'height':1000})
    a.get_by_label('Number of rounds').fill('1')
    a.get_by_label('Time per question').select_option('30')
    a.get_by_label('Match mode').select_option('ranked')
    a.get_by_role('button',name='Save settings',exact=True).click()
    expect(b.get_by_label('Number of rounds')).to_have_value('1')
    expect(b.get_by_label('Subject')).to_be_disabled()
    a.get_by_role('button',name='Ready to play',exact=True).click()
    b.get_by_role('button',name='Ready to play',exact=True).click()
    expect(a.get_by_role('heading',name='Your answer',exact=True)).to_be_visible(timeout=10000)
    expect(b.get_by_role('heading',name='Your answer',exact=True)).to_be_visible(timeout=10000)
    public=host.request.get(BASE+f'/api/rooms/{room_id}').json()
    for secret in ('answer','tests','explanation','tolerance'):
        assert secret not in public['question'],secret
    question=public['question']
    n=int(re.search(r'contains (\d+)',question['prompt']).group(1))
    correct=str(2**n)
    capture(a,'match-desktop.png')
    check_contrast(a,['.question-source','.match-clock small','.question-meta','.option-letter','.round-mark'])
    a.set_viewport_size({'width':390,'height':844});capture(a,'match-mobile.png')
    a.get_by_role('button',name='Lock answer',exact=True).scroll_into_view_if_needed()
    expect(a.locator('.mobile-match-timer')).to_be_in_viewport()
    expect(a.get_by_role('button',name='Lock answer',exact=True)).to_be_in_viewport()
    assert a.locator('.mobile-match-timer').bounding_box()['y'] >= 0
    a.screenshot(path=str(OUT/'match-mobile-scrolled.png'),animations='disabled')
    a.set_viewport_size({'width':1440,'height':1000})
    for option in a.locator('.answer-option').all():
        if option.locator('span').nth(1).inner_text()==correct: option.click();break
    a.get_by_role('button',name='Lock answer',exact=True).click()
    expect(a.get_by_text('Your answer is locked.',exact=True)).to_be_visible()
    # A reload must preserve server-side submission without revealing the answer.
    a.reload();settle(a)
    expect(a.get_by_text('Your answer is locked.',exact=True)).to_be_visible()
    for option in b.locator('.answer-option').all():
        if option.locator('span').nth(1).inner_text()!=correct: option.click();break
    b.get_by_role('button',name='Lock answer',exact=True).click()
    expect(a.get_by_role('heading',name='Nicely solved.')).to_be_visible()
    expect(b.get_by_role('heading',name='One to learn from.')).to_be_visible()
    a.get_by_role('button',name='See results',exact=True).click()
    b.get_by_role('button',name='See results',exact=True).click()
    expect(a.get_by_role('heading',name='This round of learning is yours.')).to_be_visible()
    capture(a,'results-desktop.png')
    one=host.request.get(BASE+'/api/bootstrap').json();two=guest.request.get(BASE+'/api/bootstrap').json()
    assert one['profile']['rating']==1216,one
    assert two['profile']['rating']==1184,two
    assert len(one['history'])==1
    a.reload();settle(a)
    assert host.request.get(BASE+'/api/bootstrap').json()['profile']['rating']==1216
    a.get_by_role('button',name='Play again',exact=True).click();settle(a)
    expect(b.get_by_role('button',name='Join the rematch',exact=True)).to_be_visible()
    b.get_by_role('button',name='Join the rematch',exact=True).click();settle(b)
    b.wait_for_url(a.url)
    assert a.url==b.url and a.url!=room_url
    a.get_by_label('Match mode').select_option('friendly')
    a.get_by_role('button',name=re.compile('Numeric')).click()
    a.get_by_label('Number of rounds').fill('1')
    a.get_by_label('Time per question').select_option('10')
    a.get_by_role('button',name='Save settings',exact=True).click()
    expect(b.get_by_label('Time per question')).to_have_value('10')
    a.get_by_role('button',name='Ready to play',exact=True).click()
    b.get_by_role('button',name='Ready to play',exact=True).click()
    expect(a.get_by_label('Enter your result')).to_be_visible(timeout=10000)
    q=host.request.get(BASE+'/api/rooms/'+a.url.rsplit('/',1)[1]).json()['question']
    n=int(re.search(r'group of (\d+)',q['prompt']).group(1))
    a.get_by_label('Enter your result').fill(str(n*(n-1)//2))
    a.get_by_role('button',name='Lock answer',exact=True).click()
    expect(a.get_by_role('heading',name='Nicely solved.')).to_be_visible(timeout=15000)
    expect(b.get_by_text('No answer',exact=True)).to_be_visible()
    a.get_by_role('button',name='See results',exact=True).click()
    b.get_by_role('button',name='See results',exact=True).click()
    expect(a.get_by_role('heading',name='This round of learning is yours.')).to_be_visible()
    assert host.request.get(BASE+'/api/bootstrap').json()['profile']['rating']==1216
    a.get_by_role('button',name='Back to Play',exact=True).click();settle(a)
    a.get_by_role('button',name='Match history',exact=True).click();settle(a)
    expect(a.locator('tbody tr')).to_have_count(2)
    capture(a,'history-desktop.png')
    check_contrast(a,['th','.result-tag'])
    a.get_by_role('button',name='Your profile',exact=True).click();settle(a)
    expect(a.get_by_label('Display name')).to_have_value('Mateo')
    expect(a.get_by_text('Start · 1,200 Elo',exact=True)).to_be_visible()
    expect(a.get_by_text('Latest · 1,216 Elo',exact=True)).to_be_visible()
    capture(a,'profile-desktop.png')
    a.set_viewport_size({'width':390,'height':844});capture(a,'profile-mobile.png')
    a.set_viewport_size({'width':1440,'height':1000})
    a.goto(BASE+'/java');settle(a)
    expect(a.get_by_text('Java runner not connected.',exact=False)).to_be_visible()
    expect(a.get_by_role('button',name='Run examples',exact=True)).to_be_disabled()
    capture(a,'java-desktop.png')
    a.set_viewport_size({'width':390,'height':844});capture(a,'java-mobile.png')
    # Full rooms and invalid invitations get recoverable UI, not blank screens.
    a.set_viewport_size({'width':1440,'height':1000})
    a.goto(BASE+'/room/0000000000');settle(a)
    expect(a.get_by_role('heading',name='That room is unavailable.')).to_be_visible()
    # Practice bot is explicit, friendly only, and uses the same match state machine.
    a.goto(BASE);settle(a)
    a.get_by_role('button',name='Practice solo',exact=True).click();settle(a)
    expect(a.get_by_text('Practice bot · Ready',exact=True)).to_be_visible()
    expect(a.get_by_label('Match mode').locator('option[value="ranked"]')).to_be_disabled()
    # Keyboard focus remains inside the leave confirmation.
    a.get_by_role('button',name='Leave room',exact=True).click()
    expect(a.get_by_role('alertdialog')).to_be_visible()
    expect(a.get_by_role('button',name='Stay here',exact=True)).to_be_focused()
    a.keyboard.press('Escape');expect(a.get_by_role('alertdialog')).not_to_be_visible()
    assert not errors, errors
    report={'passed':True,'checks':['two independent players','shared settings','ranked quiz result','Elo +16/-16','answer privacy','reload/reconnect','rematch','numeric grading','timeout','friendly rating unchanged','history','profile with labeled Elo history','Java unavailable state','invalid room','practice bot','keyboard dialog','desktop/mobile overflow','mobile timer visible while scrolled to answer','secondary text contrast'],'contrastRatios':contrasts,'consoleErrors':errors}
    (OUT/'browser-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report))
    browser.close()
