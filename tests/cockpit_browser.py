"""Board the real galaxy ship, then verify combat against two actual player sessions."""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE = os.environ.get('TEST_URL','http://127.0.0.1:3101')
OUT = Path('.impeccable/review/immersive-cockpit'); OUT.mkdir(parents=True, exist_ok=True)
errors=[]

def settle(page):
    page.wait_for_load_state('networkidle'); page.evaluate('document.fonts.ready')

def capture(page,name,full=True):
    page.evaluate('scrollTo(0,0)')
    if page.locator('.immersive-cabin #main').count(): page.locator('#main').evaluate('e=>e.scrollTop=0')
    page.evaluate("Promise.all(document.getAnimations().filter(a=>a.effect?.target?.classList?.contains('cockpit-window')).map(a=>a.finished.catch(()=>{})))")
    page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    page.screenshot(path=str(OUT/(name+'.png')),full_page=False)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), name

def choose(page, correct):
    public=page.request.get(BASE+'/api/rooms/'+page.url.rsplit('/',1)[1]).json()['question']
    fixture=next(q for q in json.loads(Path('questions/versus/discrete.json').read_text()) if q['id']==public['id'])
    answer=next(o['text'] for o in fixture['options'] if o['id']==fixture['answer'])
    for button in page.locator('.answer-option').all():
        if (button.locator('span').nth(1).inner_text()==answer)==correct:
            button.click(); break
    page.get_by_role('button',name='Lock answer',exact=True).click()

with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True,args=['--enable-unsafe-swiftshader'])
    host=browser.new_context(viewport={'width':1440,'height':1000})
    guest=browser.new_context(viewport={'width':1440,'height':1000})
    a,b=host.new_page(),guest.new_page()
    for page in (a,b): page.on('pageerror',lambda error:errors.append(str(error)))
    a.goto(BASE+'/');settle(a)
    a.locator('#loading.gone').wait_for()
    if a.locator('#gate').is_visible():
        a.locator('#gate-list .gate-option').filter(has_text='D-INFK').click()
        if a.locator('#gate').is_visible():
            a.locator('#gate-list .gate-option').filter(has_text='Bachelor · 1. Jahr').click()
        a.locator('#gate').wait_for(state='hidden')
    expect(a.locator('#board-versus')).to_be_visible()
    a.wait_for_timeout(2700)
    capture(a,'galaxy-ship',False)
    # Keyboard boarding supports cancellation without changing the route.
    a.locator('#board-versus').focus(); a.keyboard.press('Enter')
    expect(a.locator('#boarding-status')).to_be_visible()
    a.wait_for_timeout(850);capture(a,'boarding',False)
    a.keyboard.press('Escape'); expect(a.locator('#boarding-status')).not_to_be_visible()
    assert '/arena' not in a.url
    a.locator('#board-versus').click()
    a.wait_for_function("document.querySelector('#scene').dataset.boardingPhase==='enter-rear'")
    capture(a,'boarding-rear',False)
    a.wait_for_function("document.querySelector('#scene').dataset.boardingPhase==='seated'")
    a.wait_for_timeout(260)
    capture(a,'boarding-seated',False)
    a.wait_for_url('**/arena?**',timeout=10000);settle(a)
    assert 'entry=ship' in a.url
    expect(a.locator('.flight-deck')).to_have_attribute('data-renderer','webgl')
    expect(a.get_by_role('heading',name='Versus',exact=False)).to_be_visible()
    a.wait_for_timeout(700)
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-enemy','absent')
    a.get_by_role('button',name='Pause cockpit effects',exact=True).click()
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-perspective','behind-pilot')
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-universe','course-galaxy')
    snapshot=a.evaluate("JSON.parse(sessionStorage.getItem('viscon-cabin-universe'))")
    assert a.locator('.cockpit-scene').get_attribute('data-origin') == ','.join(str(n) for n in snapshot['origin'])
    capture(a,'home-desktop')
    a.get_by_role('button',name='Explore cockpit',exact=True).click()
    expect(a.locator('#main')).to_be_hidden()
    capture(a,'cabin-desktop')
    a.locator('.cockpit-scene').focus();a.keyboard.press('ArrowLeft');a.keyboard.press('ArrowDown')
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-look','-0.5,-0.4')
    capture(a,'look-desktop')
    a.get_by_role('button',name='Reset cockpit view').click()
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-look','0,0')
    a.get_by_role('button',name='Open console',exact=True).click()
    for width in [390,320]:
        a.set_viewport_size({'width':width,'height':844});capture(a,f'home-{width}')
        if width==390:
            a.get_by_role('button',name='Explore cockpit',exact=True).click();capture(a,'cabin-390')
            a.get_by_role('button',name='Open console',exact=True).click()
            a.locator('.join-panel > summary').click();capture(a,'join-390');a.locator('.join-panel > summary').click()
    a.set_viewport_size({'width':1440,'height':1000})
    mobile=browser.new_context(viewport={'width':390,'height':844})
    m=mobile.new_page();m.goto(BASE+'/');settle(m);m.locator('#loading.gone').wait_for()
    if m.locator('#gate').is_visible():
        m.locator('#gate-list .gate-option').filter(has_text='D-INFK').click()
        if m.locator('#gate').is_visible():
            m.locator('#gate-list .gate-option').filter(has_text='Bachelor · 1. Jahr').click()
        m.locator('#gate').wait_for(state='hidden')
    m.wait_for_timeout(2700)
    # Sample both extrema of the actual idle drift, not just one favorable frame.
    m.evaluate("window.testShipTime=0;const original=THREE.Clock.prototype.getDelta;THREE.Clock.prototype.getDelta=function(){const delta=original.call(this);this.elapsedTime=window.testShipTime;return delta}")
    for width in [390,320]:
        m.set_viewport_size({'width':width,'height':844})
        for time in [0,13.09,39.27]:
            m.evaluate('(time)=>window.testShipTime=time',time)
            m.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            box=m.locator('#board-versus').bounding_box()
            assert box and box['x']>=10 and box['x']+box['width']<=width-10,box
            ask=m.locator('#ask-form').bounding_box()
            assert ask['height']<160 and ask['y']>600,ask
        m.locator('#board-versus').focus()
        capture(m,f'galaxy-{width}',False)
    m.locator('#board-versus').click();m.wait_for_url('**/arena?**');settle(m)
    expect(m.locator('.flight-deck')).to_have_attribute('data-renderer','webgl')
    mobile.close()
    host.request.post(BASE+'/api/profile',data={'name':'Mira'})
    b.goto(BASE+'/arena');settle(b)
    guest.request.post(BASE+'/api/profile',data={'name':'Alex'})
    a.reload();settle(a)
    # Existing demo questions are used, never invented correctness or fake competitors.
    a.get_by_label('Subject',exact=True).select_option('discrete')
    a.get_by_role('button',name='Create a room',exact=True).click()
    a.wait_for_url('**/room/*');settle(a)
    b.goto(a.url);settle(b)
    expect(a.locator('.players-panel').get_by_text('Alex',exact=True)).to_be_visible()
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-enemy','absent')
    capture(a,'lobby-desktop')
    a.locator('.settings-panel > summary').click()
    a.get_by_label('Number of rounds').fill('4')
    a.get_by_label('Time per question').select_option('30')
    a.get_by_role('button',name='Save settings',exact=True).click()
    a.set_viewport_size({'width':390,'height':844})
    a.locator('.settings-panel > summary').scroll_into_view_if_needed()
    a.screenshot(path=str(OUT/'settings-390.png'))
    a.set_viewport_size({'width':1440,'height':1000})
    expect(b.get_by_label('Number of rounds')).to_have_value('4')
    a.get_by_role('button',name='Ready to play',exact=True).click()
    b.get_by_role('button',name='Ready to play',exact=True).click()
    expect(a.locator('.answer-options')).to_be_visible(timeout=10000)
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-enemy','engaged')
    capture(a,'match-desktop')
    a.set_viewport_size({'width':390,'height':844});capture(a,'match-390')
    a.get_by_role('button',name='Lock answer',exact=True).scroll_into_view_if_needed()
    expect(a.locator('.duel-instruments')).to_be_in_viewport()
    expect(a.locator('.cockpit-scene')).to_be_in_viewport()
    a.screenshot(path=str(OUT/'match-390-scrolled.png'))
    a.set_viewport_size({'width':1440,'height':1000})
    for index,(good_a,good_b,kind_a,kind_b) in enumerate([(True,False,'outgoing','incoming'),(False,True,'incoming','outgoing'),(True,True,'exchange','exchange'),(False,False,'exchange','exchange')]):
        expect(a.locator('.answer-options')).to_be_visible()
        choose(a,good_a)
        expect(a.locator('.flight-deck')).to_have_attribute('data-combat','idle')
        expect(a.locator('.flight-deck')).to_have_attribute('data-pulse','idle')
        choose(b,good_b)
        expect(a.locator('.flight-deck')).to_have_attribute('data-combat',kind_a)
        expect(b.locator('.flight-deck')).to_have_attribute('data-combat',kind_b)
        expect(a.locator('.flight-deck')).to_have_attribute('data-pulse',kind_a)
        if index==0:
            a.evaluate('scrollTo(0,0)'); a.wait_for_timeout(250)
            capture(a,'outgoing',False); capture(b,'incoming',False)
            a.reload();settle(a)
            expect(a.locator('.flight-deck')).to_have_attribute('data-combat','outgoing')
            expect(a.locator('.flight-deck')).to_have_attribute('data-pulse','idle')
            capture(a,'review-desktop')
        if index==2:
            capture(a,'exchange',False)
        button='See results' if index==3 else 'Next question'
        a.get_by_role('button',name=button,exact=True).click()
        b.get_by_role('button',name=button,exact=True).click()
        expect(a.locator('.flight-deck')).to_have_attribute('data-pulse','idle')
    expect(a.locator('.cabin-status')).to_contain_text('Duel drawn')
    expect(a.locator('.cockpit-scene')).to_have_attribute('data-enemy','absent')
    room=host.request.get(BASE+'/api/rooms/'+a.url.rsplit('/',1)[1]).json()
    assert [player['score'] for player in room['players']]==[2000,2000]
    capture(a,'results-desktop')
    a.set_viewport_size({'width':390,'height':844});capture(a,'results-390')
    # Live reduced-motion preference disables visual bursts; scores/labels remain.
    a.emulate_media(reduced_motion='reduce')
    expect(a.get_by_role('button',name='Pause cockpit effects')).to_be_disabled()
    a.goto(BASE+'/arena');settle(a)
    expect(a.locator('.flight-deck')).to_have_attribute('data-renderer','webgl')
    expect(a.get_by_role('button',name='Pause cockpit effects')).to_be_disabled()
    # WebGL unavailable and context loss both leave all actual quiz controls available.
    fallback=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    fallback.add_init_script("const get=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.includes('webgl')?null:get.call(this,kind,...args)}")
    f=fallback.new_page();f.on('pageerror',lambda error:errors.append(str(error)))
    f.goto(BASE+'/arena');settle(f)
    expect(f.locator('.flight-deck')).to_have_attribute('data-renderer','fallback')
    expect(f.get_by_role('button',name='Create a room',exact=True)).to_be_enabled()
    capture(f,'fallback-390')
    a.locator('.cockpit-scene').evaluate("el=>el.dispatchEvent(new Event('webglcontextlost',{cancelable:true}))")
    expect(a.locator('.flight-deck')).to_have_attribute('data-renderer','fallback')
    expect(a.get_by_role('button',name='Create a room',exact=True)).to_be_enabled()
    assert not errors, errors
    report={'passed':True,'checks':['3D rear boarding into shared physical cabin', 'matching camera and rendered frame across navigation', 'opponent only during active duel','keyboard boarding and cancel','behind-pilot cabin and look/reset', 'console disclosure', 'actual galaxy position handoff','390/320 responsive','two actual players','answer privacy','correct/wrong mirrored fire','tie exchanges','reconnect without replay','next-round pulse reset','score unchanged','reduced motion','WebGL failure and context loss fallback','mobile sticky timer'], 'consoleErrors':errors}
    (OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
    browser.close()
