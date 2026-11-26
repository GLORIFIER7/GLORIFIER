"""Controlled local DOM interactions in the offline evidence view (not a live site)."""
from gcef import render_document, MAX_TEXT
from browser_view import capture_view

class InteractionDenied(Exception): pass

def validate_interaction(step):
    if not isinstance(step,dict): raise InteractionDenied('ACTION_DENIED')
    action=step.get('action')
    if action in ('screenshot','read-note') and set(step)=={'action'}: return step
    if action=='fill' and set(step)=={'action','value'} and isinstance(step['value'],str) and len(step['value'])<=512: return step
    if action=='scroll' and set(step)=={'action','direction'} and step['direction'] in ('top','bottom'): return step
    raise InteractionDenied('ACTION_DENIED')

def render_interactive(document):
    if not isinstance(document,dict) or not isinstance(document.get('title'),str) or not isinstance(document.get('text'),str) or len(document['title'])>256 or len(document['text'])>MAX_TEXT: raise InteractionDenied('DOCUMENT_DENIED')
    return render_document(document).replace('</body>','<label for="gcef-note">Local evidence note (never submitted)</label><textarea id="gcef-note" maxlength="512"></textarea></body>')

class ActiveView:
    """Caller must use browser_view.configure_context and a supervised deadline."""
    def __init__(self,context,document):
        self.page=context.new_page(); self.actions=0; self.closed=False
        try: self.page.set_content(render_interactive(document),wait_until='domcontentloaded',timeout=5000)
        except BaseException:
            self.page.close(); raise
    def __enter__(self): return self
    def __exit__(self,*_): self.closed=True; self.page.close()
    def run(self,step):
        if self.closed or self.actions>=8: raise InteractionDenied('SESSION_DENIED')
        self.actions+=1; action=validate_interaction(step)['action']
        if action=='fill': self.page.locator('#gcef-note').fill(step['value'],timeout=5000); return None
        if action=='read-note': return self.page.locator('#gcef-note').input_value(timeout=5000)
        if action=='scroll':
            self.page.evaluate('window.scrollTo(0, 0)' if step['direction']=='top' else 'window.scrollTo(0, document.scrollingElement.scrollHeight)')
            return None
        # Full-page screenshot bounds are relative to the viewport. Reset
        # document scroll using a fixed internal expression, never caller code.
        self.page.evaluate('window.scrollTo(0, 0)')
        return capture_view(self.page)
