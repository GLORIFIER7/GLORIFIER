"""Optional local Chromium renderer of GCEF static evidence, not original websites."""
import argparse
import json
import os
from pathlib import Path
from gcef import render_document, MAX_TEXT


def configure_context(browser):
    context=browser.new_context(offline=True,java_script_enabled=False,service_workers='block',
                                accept_downloads=False,viewport={'width':1000,'height':720})
    context.route('**/*',lambda route: route.abort())
    return context


def prepare_view(context, document):
    if not isinstance(document,dict) or not isinstance(document.get('title'),str) or not isinstance(document.get('text'),str):
        raise ValueError('Invalid static evidence')
    if len(document['title'])>256 or len(document['text'])>MAX_TEXT:
        raise ValueError('Static evidence exceeds bounds')
    page=context.new_page()
    page.set_content(render_document(document),wait_until='domcontentloaded',timeout=5000)
    return page


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt',type=Path)
    parser.add_argument('screenshot',type=Path)
    parser.add_argument('--system-chromium',action='store_true',help='Use the administrator-installed /usr/bin/chromium on Debian.')
    args=parser.parse_args()
    try:
        if os.geteuid()==0:
            raise ValueError('Run as an unprivileged user')
        with args.receipt.open('rb') as f:
            data=f.read(400_001)
        if len(data)>400_000:
            raise ValueError('Evidence file exceeds bounds')
        document=json.loads(data)
        if document.get('classification')!='PUBLIC_STATIC_READ_ONLY':
            raise ValueError('Not a static evidence receipt')
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            # Fail rather than disable the browser sandbox. Do not import a profile.
            options={'headless':True,'chromium_sandbox':True,'timeout':10000}
            if args.system_chromium:
                options['executable_path']='/usr/bin/chromium'
            browser=p.chromium.launch(**options)
            try:
                context=configure_context(browser)
                try:
                    page=prepare_view(context,document)
                    png=page.screenshot(timeout=5000,full_page=False,animations='disabled')
                finally:
                    context.close()
            finally:
                browser.close()
        # Never overwrite existing evidence; output is user-selected and private.
        fd=os.open(args.screenshot,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f:
            f.write(png)
        print(json.dumps({'classification':'OFFLINE_STATIC_EVIDENCE_VIEW','ok':True}))
        return 0
    except Exception:
        print(json.dumps({'classification':'FAILED_CLOSED','reason':'OFFLINE_RENDER_FAILED'}))
        return 1

if __name__=='__main__':
    raise SystemExit(main())
