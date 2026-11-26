"""GCEF 2A: ephemeral offline Chromium views of approved pinned HTTPS documents.

No original site HTML, scripts, forms, credentials, or browser network access.
"""
import argparse
import html
import json
import os
from pathlib import Path
import signal
from gcef import (PolicyError, approved_links, validate_target, inspect_page,
                  render_document, MAX_TEXT)
from browser_view import configure_context, capture_view

MAX_ACTIONS=8

def validate_plan(plan):
    if not isinstance(plan,list) or not 1<=len(plan)<=MAX_ACTIONS:
        raise PolicyError('PLAN_DENIED')
    for step in plan:
        if not isinstance(step,dict):
            raise PolicyError('PLAN_DENIED')
        action=step.get('action')
        if action=='navigate' and set(step)=={'action','url'} and isinstance(step['url'],str):
            continue
        if action=='follow' and set(step)=={'action','index'} and type(step['index']) is int and 0<=step['index']<32:
            continue
        if action=='screenshot' and set(step)=={'action'}:
            continue
        raise PolicyError('PLAN_DENIED')
    return plan


def render_session(document, links):
    view=render_document(document).replace('</style>', 'button{max-width:100%;white-space:normal;overflow-wrap:anywhere}</style>')
    buttons=''.join(f'<p><button type="button" id="gcef-link-{i}">{html.escape(url)}</button></p>' for i,url in enumerate(links))
    return view.replace('</body>','<h2>Approved document links</h2>'+buttons+'</body>')


class BrowserSession:
    def __init__(self,context,allowed_hosts,*,inspector=inspect_page):
        self.page=context.new_page()
        self.allowed_hosts=frozenset(allowed_hosts)
        self.inspector=inspector
        self.links=[]
        self.document=None
        self.closed=False
        self.actions=0

    def __enter__(self):
        return self

    def __exit__(self,*_):
        self.closed=True
        self.links=[]
        self.document=None
        self.page.close()

    def _admit(self):
        if self.closed or self.actions>=MAX_ACTIONS:
            raise PolicyError('SESSION_DENIED')
        self.actions+=1

    def _navigate(self,url):
        self.links=[]
        self.document=None
        target=validate_target(url,self.allowed_hosts).geturl()
        document=self.inspector(target,self.allowed_hosts)
        if (document.get('classification')!='PUBLIC_STATIC_READ_ONLY' or document.get('url')!=target
                or not isinstance(document.get('title'),str) or len(document['title'])>256
                or not isinstance(document.get('text'),str) or len(document['text'])>MAX_TEXT):
            raise PolicyError('RECEIPT_DENIED')
        links=approved_links(target,document.get('links',[])[:32],self.allowed_hosts)
        self.page.set_content(render_session(document,links),wait_until='domcontentloaded',timeout=5000)
        self.links=links
        self.document=document
        return document

    def navigate(self,url):
        self._admit()
        return self._navigate(url)

    def follow(self,index):
        self._admit()
        if type(index) is not int or not 0<=index<len(self.links):
            raise PolicyError('LINK_DENIED')
        url=self.links[index]
        self.page.locator(f'#gcef-link-{index}').click(timeout=5000)
        return self._navigate(url)

    def screenshot(self):
        self._admit()
        if self.document is None:
            raise PolicyError('NO_DOCUMENT')
        return capture_view(self.page)


def write_private(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as file:
        file.write(data)


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('plan',type=Path)
    cli.add_argument('output',type=Path,help='New private directory; must not exist.')
    cli.add_argument('--allow-host',required=True,action='append')
    cli.add_argument('--system-chromium',action='store_true')
    args=cli.parse_args()
    def deadline(*_):
        raise PolicyError('DEADLINE_EXCEEDED')
    previous=signal.signal(signal.SIGALRM,deadline)
    signal.alarm(90)
    try:
        if os.geteuid()==0:
            raise PolicyError('UNPRIVILEGED_USER_REQUIRED')
        with args.plan.open('rb') as file:
            data=file.read(32769)
        if len(data)>32768:
            raise PolicyError('PLAN_DENIED')
        plan=validate_plan(json.loads(data))
        for step in plan:
            if step['action']=='navigate':
                validate_target(step['url'],set(args.allow_host))
        args.output.mkdir(mode=0o700)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            options={'headless':True,'chromium_sandbox':True,'timeout':10000}
            if args.system_chromium:
                options['executable_path']='/usr/bin/chromium'
            browser=p.chromium.launch(**options)
            try:
                context=configure_context(browser)
                try:
                    with BrowserSession(context,args.allow_host) as session:
                        for i,step in enumerate(plan):
                            action=step['action']
                            if action=='screenshot':
                                write_private(args.output/f'{i:02d}-offline-view.png',session.screenshot())
                            else:
                                result=session.navigate(step['url']) if action=='navigate' else session.follow(step['index'])
                                write_private(args.output/f'{i:02d}-receipt.json',json.dumps(result,ensure_ascii=True).encode())
                finally:
                    context.close()
            finally:
                browser.close()
        print(json.dumps({'classification':'BOUNDED_STATIC_BROWSER_SESSION','ok':True}))
        return 0
    except Exception:
        print(json.dumps({'classification':'FAILED_CLOSED','reason':'SESSION_FAILED'}))
        return 1
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM,previous)

if __name__=='__main__':
    raise SystemExit(main())
