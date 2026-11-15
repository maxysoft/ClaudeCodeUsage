// Tests for the dependency-free Markdown renderer used by the conversation viewer.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import { renderMarkdown } from '../miniMarkdown';

test('escapes HTML before formatting (no injection)', () => {
  const html = renderMarkdown('<script>alert(1)</script> **bold**');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>bold</strong>'));
});

test('headings, bold, italic, inline code, strikethrough', () => {
  assert.ok(renderMarkdown('# Title').includes('<h1>Title</h1>'));
  assert.ok(renderMarkdown('**b**').includes('<strong>b</strong>'));
  assert.ok(renderMarkdown('_i_').includes('<em>i</em>'));
  assert.ok(renderMarkdown('`x`').includes('<code>x</code>'));
  assert.ok(renderMarkdown('~~s~~').includes('<del>s</del>'));
});

test('fenced code block is escaped and not inline-formatted', () => {
  const html = renderMarkdown('```\nconst a = **notbold**;\n<b>\n```');
  assert.ok(html.includes('<pre><code>'));
  assert.ok(html.includes('**notbold**')); // literal, not bolded
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(!html.includes('<strong>'));
});

test('unordered and ordered lists', () => {
  const ul = renderMarkdown('- one\n- two');
  assert.ok(ul.includes('<ul><li>one</li><li>two</li></ul>'));
  const ol = renderMarkdown('1. a\n2. b');
  assert.ok(ol.includes('<ol><li>a</li><li>b</li></ol>'));
});

test('safe links only; javascript: is neutralised', () => {
  assert.ok(renderMarkdown('[x](https://example.com)').includes('<a href="https://example.com">x</a>'));
  const bad = renderMarkdown('[x](javascript:alert(1))');
  assert.ok(!bad.includes('href="javascript'));
  assert.ok(bad.includes('x'));
});

test('blockquote and horizontal rule', () => {
  assert.ok(renderMarkdown('> quoted').includes('<blockquote>quoted</blockquote>'));
  assert.ok(renderMarkdown('---').includes('<hr>'));
});

test('paragraph keeps soft line breaks', () => {
  assert.ok(renderMarkdown('line a\nline b').includes('line a<br>line b'));
});

test('empty / null input is safe', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(null as unknown as string), '');
});

test('GFM table renders with header, rows and alignment', () => {
  const md = ['| Model | TTL |', '| :--- | ---: |', '| opus | 60m |', '| deepseek | 240m |'].join('\n');
  const html = renderMarkdown(md);
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<thead><tr><th style="text-align:left">Model</th><th style="text-align:right">TTL</th></tr></thead>'));
  assert.ok(html.includes('<td style="text-align:left">opus</td>'));
  assert.ok(html.includes('<td style="text-align:right">240m</td>'));
});

test('a lone pipe line is not treated as a table', () => {
  const html = renderMarkdown('a | b is just text');
  assert.ok(!html.includes('<table>'));
  assert.ok(html.includes('<p>'));
});

// A regression here is a synchronous infinite loop that node:test timeouts cannot interrupt, so render in a bounded worker.
function renderInWorker(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      "const { parentPort, workerData } = require('node:worker_threads');" +
        'parentPort.postMessage(require(workerData.mod).renderMarkdown(workerData.src));',
      {
        eval: true,
        workerData: { mod: path.join(__dirname, '..', 'miniMarkdown'), src },
        resourceLimits: { maxOldGenerationSizeMb: 64 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('renderMarkdown did not return'));
    }, 10000);
    worker.once('message', (html: string) => {
      clearTimeout(timer);
      resolve(html);
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test('a fence opener with U+2028 terminates and still opens a fence', async () => {
  assert.equal(await renderInWorker('```js\u2028x\ncode\n```\nafter'), '<pre><code>code</code></pre>\n<p>after</p>');
});

test('a heading line with U+2028 terminates and still renders as a heading', async () => {
  assert.equal(await renderInWorker('# a\u2028b\nnext'), '<h1>a\u2028b</h1>\n<p>next</p>');
});

test('NUL in input is replaced and never resolves an internal placeholder', () => {
  assert.equal(renderMarkdown('`c` x\u00000\u0000 y\u00009\u0000'), '<p><code>c</code> x\uFFFD0\uFFFD y\uFFFD9\uFFFD</p>');
});

test('links keep _ and * intact in href and text', () => {
  const url = 'https://x.io/a_b_c/d*e*f';
  assert.ok(renderMarkdown(`[t](${url}) _em_`).includes(`<a href="${url}">t</a> <em>em</em>`));
  assert.ok(renderMarkdown('[**b**](https://x.io/a_b)').includes('<a href="https://x.io/a_b"><strong>b</strong></a>'));
  assert.ok(renderMarkdown('[x](javascript:a_b_c)').includes('x (javascript:a_b_c)'));
  assert.ok(renderMarkdown('[`a_b`](https://x.io)').includes('<a href="https://x.io"><code>a_b</code></a>'));
});

test('a link URL never captures an inline code span', () => {
  assert.equal(renderMarkdown('[t](https://x.io/`a`)'), '<p>[t](https://x.io/<code>a</code>)</p>');
});

test('a rejected-scheme link URL is escaped exactly once', () => {
  assert.equal(renderMarkdown('[x](javascript:<b>&)'), '<p>x (javascript:&lt;b&gt;&amp;)</p>');
});
