import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { IntegrationExternalLink } from './IntegrationExternalLink';

test('omits external integration anchors for rejected URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'http://example.com',
    'https://user:pass@example.com/path',
    '/relative/path',
    null,
  ]) {
    const markup = renderToStaticMarkup(createElement(IntegrationExternalLink, {
      url,
      name: 'Untrusted integration',
    }));
    assert.equal(markup, '', `expected no anchor for ${String(url)}`);
  }
});

test('renders a safe anchor for a valid HTTPS integration URL', () => {
  const markup = renderToStaticMarkup(createElement(IntegrationExternalLink, {
    url: 'https://example.com:443/docs',
    name: 'Documentation',
  }));

  assert.match(markup, /href="https:\/\/example\.com\/docs"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /aria-label="Open Documentation"/);
});
