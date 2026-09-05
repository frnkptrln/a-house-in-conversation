#!/usr/bin/env python3
"""Offline V2 browser regressions with silent media fixtures, not a listening review.

Requires Python Playwright and Chromium. Run from any directory with --root
pointing at the house. The original CSS/JS are injected into an offline about:blank document. The HTML
asset tags are replaced and the five recordings use silent WAV data URLs.
No production storage, credentials, external services or model calls are used.
"""
from __future__ import annotations

import argparse
import base64
import re
import hashlib
import io
import json
from importlib.metadata import version
from pathlib import Path
import wave

from playwright.sync_api import sync_playwright


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    files = {name: (args.root / name).read_bytes() for name in ('index.html', 'style.css', 'script.js')}
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(8000)
        output.writeframes(bytes(16000))
    audio = buffer.getvalue()
    report = {
        'scope': 'Offline about:blank Chromium; original CSS/JS, replaced HTML asset tags and silent PCM media fixtures.',
        'not_tested': ['original recordings and AAC decoding', 'native persistent storage', 'production deployment', 'physical mobile devices/Safari', 'listening judgment'],
        'source_sha256': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
        'playwright': version('playwright'), 'checks': [], 'errors': [], 'unexpected_requests': []
    }

    def flush() -> None:
        args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

    def record(name: str, passed: bool, detail: object = None) -> None:
        report['checks'].append({'name': name, 'passed': bool(passed), 'detail': detail})
        flush()
        print(('PASS ' if passed else 'FAIL ') + name, flush=True)

    html = files['index.html'].decode('utf-8')
    html = re.sub(r'<link rel="stylesheet"[^>]+>', '', html)
    html = re.sub(r'<script src="script.js[^>]+></script>', '', html)
    fixture = 'data:audio/wav;base64,' + base64.b64encode(audio).decode()
    html = re.sub(r'src="[^"\n]+\.m4a"', lambda _: 'src="' + fixture + '"', html)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox'])
        report['browser'] = browser.version
        try:
            for name, width, height in [('desktop', 1280, 800), ('portrait', 390, 844), ('narrow', 320, 568), ('landscape', 667, 375)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
                context.route('**/*', lambda route: route.abort())
                page = context.new_page()
                page.on('pageerror', lambda error: report['errors'].append(str(error)))
                page.set_content(html)
                page.add_style_tag(content=files['style.css'].decode('utf-8'))
                page.add_script_tag(content=files['script.js'].decode('utf-8'))
                page.wait_for_timeout(100)
                box = page.evaluate('''() => {
                  const a=document.querySelector('#house-title').getBoundingClientRect();
                  const b=enterHouse.getBoundingClientRect();
                  return {title:a.toJSON(), door:b.toJSON(), overlap:
                    Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
                    Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)),
                    within:a.left>=0&&a.right<=innerWidth&&a.top>=0&&a.bottom<=innerHeight};
                }''')
                record(name+': title unobscured', box['overlap'] == 0 and box['within'], box)
                if args.screenshots:
                    args.screenshots.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(args.screenshots / (name+'-threshold.png')))
                page.locator('#enter-house').click()
                page.wait_for_timeout(150)
                state = page.evaluate('''() => ({place:currentPlace, active:[...places].filter(([_,e])=>!e.inert).map(([n])=>n), focus:document.activeElement.id})''')
                record(name+': one active and focused conversation', state['place']=='conversation' and state['active']==['conversation'] and state['focus']=='conversation', state)
                button = page.evaluate(r'''() => {
                  const s=getComputedStyle(soundToggle), bg=getComputedStyle(places.get(currentPlace)).backgroundColor;
                  const values=x=>x.match(/[\d.]+/g).slice(0,3).map(Number);
                  const background=values(bg), ink=values(s.color), opacity=Number(s.opacity);
                  const luminance=rgb=>rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4)
                    .reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
                  const rendered=ink.map((x,i)=>x*opacity+background[i]*(1-opacity));
                  const l=[luminance(background),luminance(rendered)].sort((a,b)=>b-a);
                  const r=soundToggle.getBoundingClientRect();
                  return {width:r.width,height:r.height,contrast:(l[0]+.05)/(l[1]+.05)};
                }''')
                record(name+': sound control readable and touch-sized', button['width']>=44 and button['height']>=44 and button['contrast']>=4.5, button)
                if args.screenshots:
                    page.screenshot(path=str(args.screenshots / (name+'-conversation.png')))
                page.locator('#relation').click()
                page.wait_for_timeout(50)
                record(name+': relation opens garden', page.evaluate('!gardenDoor.hidden'))
                page.evaluate("goTo('hall');goTo('colour');goTo('window')")
                page.wait_for_timeout(100)
                active = page.evaluate("[...document.querySelectorAll('.place.is-present')].map(e=>e.id)")
                record(name+': rapid transitions show only destination', active==['window'], active)
                record(name+': reduced motion has no afterimage', page.evaluate("!afterimage.classList.contains('is-visible')"))
                if name=='desktop':
                    failed = page.evaluate('''async () => {
                      sound.pause(); sound.ensure=async()=>false;
                      sound.muted=true; sound.toggle();
                      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
                      return {state:body.dataset.sound,label:soundToggle.textContent};
                    }''')
                    record('failed playback does not claim sound is on', failed['state']=='waiting' and failed['label']=='sound', failed)
                    race = page.evaluate('''async () => {
                      const pending=[]; sound.muted=false; body.dataset.sound='on';
                      sound.ensure=()=>new Promise(resolve=>pending.push(resolve));
                      const attempt=sound.retry(); sound.toggle();
                      pending.forEach(resolve=>resolve(true)); await attempt;
                      return {state:body.dataset.sound,muted:sound.muted,
                        elementsMuted:sound.elements.every(e=>e.muted),pressed:soundToggle.getAttribute('aria-pressed')};
                    }''')
                    record('late playback cannot undo mute', race['state']=='off' and race['muted'] and race['elementsMuted'] and race['pressed']=='true', race)
                context.close()
        finally:
            browser.close()
    report['passed'] = sum(item['passed'] for item in report['checks'])
    report['failed'] = len(report['checks']) - report['passed']
    flush()
    print(f"{report['passed']} passed; {report['failed']} failed; {len(report['errors'])} page errors", flush=True)
    raise SystemExit(bool(report['failed'] or report['errors'] or report['unexpected_requests']))


if __name__ == '__main__':
    main()
