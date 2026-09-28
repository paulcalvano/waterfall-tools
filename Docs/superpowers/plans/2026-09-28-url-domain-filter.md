# URL / Domain Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `urlFilter` renderer option that lets users hide/show waterfall requests by matching glob or regex patterns against the full request URL, combined (AND) with the existing `reqFilter`, wired into the viewer's "Waterfall Options" dialog.

**Architecture:** A new static `Layout.parseUrlFilter(filterStr)` helper in `src/renderer/layout.js` compiles a comma-separated, `-`-prefixed-exclude pattern string into `{ includes: RegExp[], excludes: RegExp[] }`. `Layout.calculateRows()` gains a filtering pass (mirroring the existing `reqFilter` block) that runs immediately after it, is skipped entirely in Connection View, and applies include/exclude semantics against `entry.url`. The viewer's options dialog gains a new `#ui-url-filter` text input (merging the old standalone "Request Filtering" section into a combined "Filtering" section) plumbed through the same generic URL-param / option-key mechanism `reqFilter` already uses.

**Tech Stack:** Vanilla JS (ESM), vitest for unit tests, plain HTML/CSS for the viewer dialog.

---

## Spec Reference

This plan implements `Docs/superpowers/specs/2026-09-28-url-domain-filter-design.md` in full. Re-read that file if any ambiguity arises during implementation — it is the source of truth for matching semantics.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/waterfall-tools.js` | Adds `urlFilter: ''` to the canonical option dictionary (`getDefaultOptions()`). |
| `src/renderer/layout.js` | New `Layout.parseUrlFilter()` static method (glob/regex compilation). New filtering pass inside `calculateRows()`. |
| `tests/renderer/layout.test.js` | **New file.** Unit tests for `parseUrlFilter()` and the `calculateRows()` URL-filter pass (this test file does not exist yet in the repo — `theming-options.test.js` and `zoom-offset.test.js` are the only existing `tests/renderer/*.test.js` files). |
| `src/viewer/index.html` | Renames/merges the "Request Filtering" section into a combined "Filtering" section with two labeled inputs (`#ui-req-filter`, `#ui-url-filter`) plus a static tooltip callout. Bumps `style.css?v=` and `viewer.js?v=` cache-bust query params. |
| `src/viewer/style.css` | New `.filter-help` / `.filter-tooltip` classes for the static tooltip callout (no absolutely-positioned popup — the approved mockup uses a non-overlapping callout box below the input). |
| `src/viewer/viewer.js` | Three mechanical additions mirroring `reqFilter`: `getOptionsFromUrl()` parses `?urlFilter=`; modal-open sync sets `#ui-url-filter`'s value; the input-listener array gains `'ui-url-filter'` → `urlFilter`. |
| `README.md` | Documents the new `urlFilter` option alongside the existing `reqFilter` entry. |
| `AGENTS.md` | Updates the `getDefaultOptions()` canonical-list bullet and the Viewer section to mention the combined "Filtering" section. |

## Task 1: `getDefaultOptions()` gains `urlFilter`

**Files:**
- Modify: `src/core/waterfall-tools.js:547`
- Test: `tests/core/waterfall-tools.test.js` (if it doesn't exist, create it at that path)

- [ ] **Step 1: Check for an existing default-options test**

Run: `ls tests/core/waterfall-tools.test.js 2>/dev/null || echo "MISSING"`

If it prints a path, open the file and find (or add) a test block for `getDefaultOptions()`. If it prints `MISSING`, create the file fresh in Step 2 below.

- [ ] **Step 2: Write the failing test**

If the file already exists, add this `it(...)` inside its existing `describe('WaterfallTools', ...)` block (or nearest matching describe for static methods). If the file does not exist, create `tests/core/waterfall-tools.test.js` with:

```js
/*
 * Copyright 2006 Patrick Meenan
 * Licensed under the Apache License, Version 2.0.
 * See the LICENSE file for details.
 */
import { describe, it, expect } from 'vitest';
import { WaterfallTools } from '../../src/core/waterfall-tools.js';

describe('WaterfallTools.getDefaultOptions', () => {
    it('includes an empty urlFilter alongside reqFilter', () => {
        const opts = WaterfallTools.getDefaultOptions();
        expect(opts).toHaveProperty('urlFilter');
        expect(opts.urlFilter).toBe('');
        expect(opts).toHaveProperty('reqFilter');
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/waterfall-tools.test.js -t "includes an empty urlFilter"`
Expected: FAIL — `expect(opts).toHaveProperty('urlFilter')` fails because the key is absent.

- [ ] **Step 4: Add `urlFilter` to `getDefaultOptions()`**

In `src/core/waterfall-tools.js`, locate the `getDefaultOptions()` return object (around line 539-569). Add the new key immediately after `reqFilter: ''` (line 547):

```js
            reqFilter: '',
            urlFilter: '',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/waterfall-tools.test.js -t "includes an empty urlFilter"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/waterfall-tools.js tests/core/waterfall-tools.test.js
git commit -m "feat: add urlFilter to getDefaultOptions"
```

## Task 2: `Layout.parseUrlFilter()` — glob/regex compilation

**Files:**
- Modify: `src/renderer/layout.js` (new static method, placed after `formatUrl()`, before `calculateRows()` — i.e. after line 136, before line 138)
- Test: `tests/renderer/layout.test.js` (new file)

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/layout.test.js`:

```js
/*
 * Copyright 2006 Patrick Meenan
 * Licensed under the Apache License, Version 2.0.
 * See the LICENSE file for details.
 */
import { describe, it, expect } from 'vitest';
import { Layout } from '../../src/renderer/layout.js';

describe('Layout.parseUrlFilter', () => {
    it('returns empty includes/excludes for an empty or whitespace-only string', () => {
        expect(Layout.parseUrlFilter('')).toEqual({ includes: [], excludes: [] });
        expect(Layout.parseUrlFilter('   ')).toEqual({ includes: [], excludes: [] });
    });

    it('compiles a bare glob token to an unanchored, case-insensitive regex', () => {
        const { includes } = Layout.parseUrlFilter('*.google.com');
        expect(includes).toHaveLength(1);
        expect(includes[0].source).toBe('.*\\.google\\.com');
        expect(includes[0].flags).toBe('i');
        expect(includes[0].test('https://www.google.com/page')).toBe(true);
        expect(includes[0].test('https://www.GOOGLE.com/page')).toBe(true);
        expect(includes[0].test('https://example.com/page')).toBe(false);
    });

    it('matches a bare substring token anywhere in the URL (unanchored)', () => {
        const { includes } = Layout.parseUrlFilter('google.com');
        expect(includes[0].test('https://www.google.com/page')).toBe(true);
    });

    it('escapes regex metacharacters other than *', () => {
        const { includes } = Layout.parseUrlFilter('/ads/v1.2?x=1');
        // '.' '?' should be escaped literally; there is no trailing '*' to translate.
        expect(includes[0].source).toBe('/ads/v1\\.2\\?x=1');
        expect(includes[0].test('https://example.com/ads/v1.2?x=1')).toBe(true);
        expect(includes[0].test('https://example.com/adsXv1X2?xAx=1')).toBe(false);
    });

    it('treats a /.../ delimited token as raw regex source', () => {
        const { includes } = Layout.parseUrlFilter('/^https:.*\\.js$/');
        expect(includes).toHaveLength(1);
        expect(includes[0].source).toBe('^https:.*\\.js$');
        expect(includes[0].test('https://example.com/app.js')).toBe(true);
        expect(includes[0].test('http://example.com/app.js')).toBe(false);
    });

    it('routes a leading "-" token to excludes, not includes', () => {
        const { includes, excludes } = Layout.parseUrlFilter('-*/ads/*');
        expect(includes).toHaveLength(0);
        expect(excludes).toHaveLength(1);
        expect(excludes[0].test('https://example.com/ads/banner.png')).toBe(true);
    });

    it('drops an invalid regex token silently (neither includes nor excludes)', () => {
        const { includes, excludes } = Layout.parseUrlFilter('/[unbalanced/');
        expect(includes).toHaveLength(0);
        expect(excludes).toHaveLength(0);
    });

    it('splits multiple comma-separated tokens and trims whitespace', () => {
        const { includes, excludes } = Layout.parseUrlFilter(' *.google.com , -*/ads/* , /cdn\\d+\\.example\\.com/ ');
        expect(includes).toHaveLength(2);
        expect(excludes).toHaveLength(1);
        expect(includes[1].test('https://cdn3.example.com/x')).toBe(true);
    });

    it('skips empty tokens produced by trailing/duplicate commas', () => {
        const { includes, excludes } = Layout.parseUrlFilter('*.google.com,,');
        expect(includes).toHaveLength(1);
        expect(excludes).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/layout.test.js`
Expected: FAIL — `Layout.parseUrlFilter is not a function`.

- [ ] **Step 3: Implement `parseUrlFilter()`**

In `src/renderer/layout.js`, insert this static method inside the `Layout` class, immediately after `formatUrl()` closes (after line 136's closing `}` and before `static calculateRows(...)` on line 138):

```js
    /**
     * Compiles a comma-separated urlFilter string into include/exclude RegExp arrays.
     * Each token: optional leading '-' (routes to excludes), then either a /regex/
     * (interior used as raw source) or a glob (only '*' is a wildcard; all other
     * regex metacharacters are escaped literally). All patterns are unanchored
     * (substring match) and case-insensitive. Malformed regex tokens are dropped
     * silently — this mirrors reqFilter's forgiving parse behavior and avoids
     * error UI flicker while a regex is mid-edit.
     * @param {string} filterStr
     * @returns {{includes: RegExp[], excludes: RegExp[]}}
     */
    static parseUrlFilter(filterStr) {
        const includes = [];
        const excludes = [];
        if (!filterStr) return { includes, excludes };

        const tokens = String(filterStr).split(',');
        tokens.forEach(rawToken => {
            let token = rawToken.trim();
            if (token === '') return;

            let isExclude = false;
            if (token.startsWith('-')) {
                isExclude = true;
                token = token.slice(1);
            }
            if (token === '') return;

            let source;
            if (token.length > 1 && token.startsWith('/') && token.endsWith('/')) {
                source = token.slice(1, -1);
            } else {
                // Escape regex metacharacters except '*', then turn '*' into '.*'.
                const escaped = token.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
                source = escaped.replace(/\*/g, '.*');
            }

            try {
                const re = new RegExp(source, 'i');
                (isExclude ? excludes : includes).push(re);
            } catch {
                // Malformed regex — drop the token entirely.
            }
        });

        return { includes, excludes };
    }

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/layout.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/layout.js tests/renderer/layout.test.js
git commit -m "feat: add Layout.parseUrlFilter for glob/regex URL filter compilation"
```

## Task 3: `calculateRows()` filtering pass

**Files:**
- Modify: `src/renderer/layout.js:180` (insert immediately after the existing `reqFilter` block's closing brace, before the `thumbMaxReqs` line)
- Test: `tests/renderer/layout.test.js` (append to the file created in Task 2)

- [ ] **Step 1: Write the failing tests**

Append this new `describe` block to `tests/renderer/layout.test.js` (after the existing `describe('Layout.parseUrlFilter', ...)` block):

```js
describe('Layout.calculateRows urlFilter', () => {
    const makeEntries = (urls) => urls.map((url, i) => ({
        index: i,
        url,
        mimeType: 'text/html',
        status: 200,
        time_start: i * 10,
        time_end: i * 10 + 5,
        timings: { dns: 0, connect: 0, ssl: 0, send: 0, wait: 2, receive: 3 }
    }));

    it('include-only: keeps only requests matching at least one include pattern', () => {
        const entries = makeEntries([
            'https://www.google.com/a',
            'https://example.com/b',
            'https://sub.google.com/c'
        ]);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '*.google.com' });
        expect(rows).toHaveLength(2);
        expect(rows.map(r => r.request.url)).toEqual([
            'https://www.google.com/a',
            'https://sub.google.com/c'
        ]);
    });

    it('exclude-only: drops requests matching any exclude pattern, keeps the rest', () => {
        const entries = makeEntries([
            'https://example.com/ads/banner.png',
            'https://example.com/index.html'
        ]);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '-*/ads/*' });
        expect(rows).toHaveLength(1);
        expect(rows[0].request.url).toBe('https://example.com/index.html');
    });

    it('mixed include+exclude: exclude wins even when a URL also matches an include', () => {
        const entries = makeEntries([
            'https://example.com/ads/tracker.js',
            'https://example.com/app.js',
            'https://other.com/app.js'
        ]);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '*.js,-*/ads/*' });
        expect(rows.map(r => r.request.url)).toEqual([
            'https://example.com/app.js',
            'https://other.com/app.js'
        ]);
    });

    it('no matches: returns an empty row set without throwing', () => {
        const entries = makeEntries(['https://example.com/a']);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '*.nomatch.test' });
        expect(rows).toHaveLength(0);
    });

    it('connectionView bypasses urlFilter entirely', () => {
        const entries = makeEntries([
            'https://example.com/a',
            'https://other.com/b'
        ]);
        const { rows } = Layout.calculateRows(entries, 1000, {
            urlFilter: '*.nomatch.test',
            connectionView: true
        });
        expect(rows.length).toBeGreaterThan(0);
    });

    it('combines with reqFilter via AND', () => {
        const entries = makeEntries([
            'https://www.google.com/a',
            'https://www.google.com/b',
            'https://example.com/c'
        ]);
        // reqFilter keeps requests #1-2 (1-based), urlFilter further restricts to google.com.
        const { rows } = Layout.calculateRows(entries, 1000, {
            reqFilter: '1-2',
            urlFilter: '*.google.com'
        });
        expect(rows).toHaveLength(2);
        expect(rows.every(r => r.request.url.includes('google.com'))).toBe(true);
    });

    it('empty urlFilter is a no-op', () => {
        const entries = makeEntries(['https://example.com/a', 'https://other.com/b']);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '' });
        expect(rows).toHaveLength(2);
    });
});
```

This test suite assumes `row.request.url` exposes the original entry's URL on each returned row. Before writing the implementation, confirm this shape by inspecting how existing rows are built further down in `calculateRows()` — grep for `request:` inside the row-construction code in `src/renderer/layout.js` to confirm the exact property path used for the raw entry reference on a row object. If the property differs (e.g. `row.entry.url` or similar), adjust every `r.request.url` / `r.entry.url` reference in this test block to match the real shape before proceeding — do not guess.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/layout.test.js -t "calculateRows urlFilter"`
Expected: FAIL — either wrong row counts (filter not applied yet) or a property-access mismatch if the row shape needed adjusting in Step 1.

- [ ] **Step 3: Implement the filtering pass**

In `src/renderer/layout.js`, insert this block immediately after the `reqFilter` block's closing brace (after line 180 `}` and before line 182's `let thumbMaxReqs = options.thumbMaxReqs;`):

```js
        if (!options.connectionView && options.urlFilter) {
            const { includes, excludes } = Layout.parseUrlFilter(options.urlFilter);
            if (includes.length > 0 || excludes.length > 0) {
                entries = entries.filter(entry => {
                    const url = entry.url || '';
                    if (excludes.some(re => re.test(url))) return false;
                    if (includes.length > 0 && !includes.some(re => re.test(url))) return false;
                    return true;
                });
            }
        }

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/layout.test.js`
Expected: PASS (16 tests total: 9 from `parseUrlFilter` + 7 from `calculateRows urlFilter`)

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npm test -- --run`
Expected: All tests pass (previous baseline was 162 passing + 1 known-flaky timeout unrelated to this change — re-run that single flaky file in isolation if it fails again: `npx vitest run tests/inputs/chrome-trace.test.js`).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/layout.js tests/renderer/layout.test.js
git commit -m "feat: apply urlFilter in calculateRows, AND'd with reqFilter"
```

## Task 4: Viewer UI — combined "Filtering" section

**Files:**
- Modify: `src/viewer/index.html:263-268` (replace the standalone "Request Filtering" section)
- Modify: `src/viewer/style.css` (new tooltip classes, appended after the `.settings-grid label` rule around line 748)
- Modify: `src/viewer/index.html:23,301` (cache-bust bumps)

- [ ] **Step 1: Replace the "Request Filtering" section in `index.html`**

In `src/viewer/index.html`, replace lines 263-268:

```html
                <div class="settings-separator"></div>
                <h4>Request Filtering</h4>
                <div style="margin-bottom: 20px;">
                    <input type="text" id="ui-req-filter" placeholder="e.g. 1, 5-10, 15"
                        style="width: 100%; box-sizing: border-box; padding: 6px; border: 1px solid var(--border-color, #ccc); border-radius: 4px;">
                </div>
```

with:

```html
                <div class="settings-separator"></div>
                <h4>Filtering</h4>
                <div style="margin-bottom: 12px;">
                    <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:4px;">Request numbers</label>
                    <input type="text" id="ui-req-filter" placeholder="e.g. 1, 5-10, 15"
                        style="width: 100%; box-sizing: border-box; padding: 6px; border: 1px solid var(--border-color, #ccc); border-radius: 4px;">
                </div>
                <div style="margin-bottom: 20px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                        <label style="font-size:0.85rem; font-weight:600;">URL / domain pattern</label>
                        <span class="filter-help" tabindex="0" role="button" aria-describedby="url-filter-tooltip">?</span>
                    </div>
                    <input type="text" id="ui-url-filter" placeholder="e.g. *.google.com, -*/ads/*, /cdn\d+\.example\.com/"
                        style="width: 100%; box-sizing: border-box; padding: 6px; border: 1px solid var(--border-color, #ccc); border-radius: 4px;">
                    <div id="url-filter-tooltip" class="filter-tooltip">
                        <div><code>*.google.com</code> &mdash; wildcard glob match</div>
                        <div><code>/^https:.*\.js$/</code> &mdash; regex (slash-delimited)</div>
                        <div><code>-*/ads/*</code> &mdash; exclude matches (leading <code>-</code>)</div>
                        <div>Comma-separate multiple patterns &mdash; combined with OR</div>
                    </div>
                </div>
```

- [ ] **Step 2: Add tooltip CSS**

In `src/viewer/style.css`, append these rules immediately after the `.settings-grid label` rule (after line 748's closing `}`):

```css
.filter-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--border-color, #ccc);
    color: #333;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: help;
    user-select: none;
}

.filter-tooltip {
    margin-top: 6px;
    padding: 8px 10px;
    background: var(--bg-color, #f9f9f9);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--text-color, #333);
}

.filter-tooltip code {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
}
```

This is a static, always-visible callout box below the input (per the approved mockup) — not an absolutely-positioned popup, avoiding the clipping issue found during the visual-mockup review.

- [ ] **Step 3: Bump cache-bust versions**

In `src/viewer/index.html`, change line 23:

```html
    <link rel="stylesheet" href="./style.css?v=9">
```

to:

```html
    <link rel="stylesheet" href="./style.css?v=10">
```

And change line 301:

```html
    <script type="module" src="./viewer.js?v=9"></script>
```

to:

```html
    <script type="module" src="./viewer.js?v=10"></script>
```

- [ ] **Step 4: Manually verify the dialog renders correctly**

Run: `npm run dev:viewer`

Open the printed local URL in a browser, load any sample capture (drag in a file from `Sample/Data/`), open the "⚙️ Options" dialog, and confirm:
- The section header reads "Filtering" (not "Request Filtering").
- Both "Request numbers" and "URL / domain pattern" labeled inputs are visible.
- The `?` help icon has a visible circular badge next to the URL/domain label.
- The tooltip callout box below the input is fully visible (not clipped) and shows all four example lines.

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/index.html src/viewer/style.css
git commit -m "feat: merge Request Filtering into a combined Filtering section with URL/domain input"
```

## Task 5: Viewer wiring — `viewer.js` plumbing

**Files:**
- Modify: `src/viewer/viewer.js:606` (`getOptionsFromUrl()`)
- Modify: `src/viewer/viewer.js:1933-1934` (modal-open sync)
- Modify: `src/viewer/viewer.js:2584` (input-listener array + branch)

- [ ] **Step 1: `getOptionsFromUrl()` — parse `?urlFilter=`**

In `src/viewer/viewer.js`, immediately after line 606:

```js
    if (params.has('reqFilter')) options.reqFilter = params.get('reqFilter');
```

add:

```js
    if (params.has('urlFilter')) options.urlFilter = params.get('urlFilter');
```

- [ ] **Step 2: Modal-open sync — set `#ui-url-filter`'s value**

In `src/viewer/viewer.js`, immediately after lines 1933-1934:

```js
    const rfEl = document.getElementById('ui-req-filter');
    if (rfEl) rfEl.value = (renderOptions.reqFilter !== undefined) ? renderOptions.reqFilter : '';
```

add:

```js
    const ufEl = document.getElementById('ui-url-filter');
    if (ufEl) ufEl.value = (renderOptions.urlFilter !== undefined) ? renderOptions.urlFilter : '';
```

- [ ] **Step 3: Input-listener array — add `'ui-url-filter'`**

In `src/viewer/viewer.js`, change line 2584 from:

```js
    ['ui-start-time', 'ui-end-time', 'ui-req-filter'].forEach(id => {
```

to:

```js
    ['ui-start-time', 'ui-end-time', 'ui-req-filter', 'ui-url-filter'].forEach(id => {
```

Then, inside the same `forEach` callback, extend the `if/else if` chain. Change lines 2596-2599 from:

```js
                } else if (id === 'ui-req-filter') {
                    optKey = 'reqFilter';
                    optVal = optVal !== '' ? optVal : undefined;
                }
```

to:

```js
                } else if (id === 'ui-req-filter') {
                    optKey = 'reqFilter';
                    optVal = optVal !== '' ? optVal : undefined;
                } else if (id === 'ui-url-filter') {
                    optKey = 'urlFilter';
                    optVal = optVal !== '' ? optVal : undefined;
                }
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev:viewer`

Load a sample capture with multiple distinct domains (e.g. `Sample/Data/wptagent/roadtrip-wptagent.zip` if handy, or any multi-domain HAR under `Sample/Data/HAR/`). Open Options, type `*.google.com` (or a domain actually present in the loaded sample) into the URL/domain field, and confirm:
- The waterfall canvas immediately narrows to only matching requests.
- The browser address bar's query string picks up `&urlFilter=...` (confirms `updateUrlWithCurrentState()` picked up the new option generically).
- Reloading the page with that URL re-applies the filter (confirms `getOptionsFromUrl()` round-trips).
- Clearing the field restores all requests.
- Switching to Connection View while a URL filter is set shows all connections (filter correctly bypassed).

Stop the dev server once confirmed.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/viewer.js
git commit -m "feat: wire urlFilter through viewer URL params, modal sync, and input listeners"
```

## Task 6: Browser smoke test

**Files:**
- Create: `tests/browser/viewer-url-filter.spec.js`

- [ ] **Step 1: Inspect an existing Playwright spec for the file-drop + options-dialog pattern**

Run: `ls tests/browser/*.spec.js`

Open one existing spec that loads a file via the drop zone and opens the Options dialog (e.g. `tests/browser/viewer-embed-iframe.spec.js` or any spec referencing `#btn-settings` / `#settings-overlay`) to copy the exact file-input / drop-zone interaction pattern and any existing helper imports (`@playwright/test` config, fixture paths). Do not guess the interaction pattern — read the real file and mirror its structure exactly, including how it locates the hidden `<input type="file">` element and which fixture HAR it loads.

- [ ] **Step 2: Write the smoke test**

Create `tests/browser/viewer-url-filter.spec.js`, following the exact drop-zone/file-input pattern discovered in Step 1 (the sketch below uses a generic `page.setInputFiles` call — replace `'#file-input'` and the fixture path with whatever the real existing spec uses):

```js
/*
 * Copyright 2006 Patrick Meenan
 * Licensed under the Apache License, Version 2.0.
 * See the LICENSE file for details.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '..', 'fixtures', 'chrome-google.har.json');

test('urlFilter narrows visible requests and Connection View bypasses it', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#file-input', fixture);
    await page.waitForSelector('#waterfall-canvas', { state: 'visible' });

    await page.click('#btn-settings');
    await page.waitForSelector('#settings-overlay:not(.hidden)');

    await page.fill('#ui-url-filter', 'google.com');
    await page.click('#btn-settings-close');

    await expect(page).toHaveURL(/urlFilter=google\.com/);

    // Switch to Connection View — filter should be bypassed, not error.
    await page.click('#btn-settings');
    await page.check('input[name="ui-view-type"][value="connection"]');
    await page.click('#btn-settings-close');
    await expect(page.locator('#waterfall-canvas')).toBeVisible();
});
```

- [ ] **Step 3: Run the browser test**

Run: `npm run test:browser -- viewer-url-filter`
Expected: PASS. If the selectors don't match (e.g. `#file-input` or `#btn-settings` differ from the real DOM), fix them by reading `src/viewer/index.html` directly rather than guessing further.

- [ ] **Step 4: Commit**

```bash
git add tests/browser/viewer-url-filter.spec.js
git commit -m "test: add browser smoke test for urlFilter dialog + Connection View bypass"
```

## Task 7: Documentation

**Files:**
- Modify: `README.md` (near the existing `reqFilter` documentation)
- Modify: `AGENTS.md` (renderer options bullet + Viewer section)

- [ ] **Step 1: Update `README.md`**

In `README.md`, find the existing `reqFilter` line (confirmed at the options-list block containing `reqFilter,           // filter by request id substring` — search for that exact line if line numbers have shifted). Immediately after it, add:

```
urlFilter: '',           // filter requests by URL/domain glob or regex (see below)
```

If the surrounding documentation block has prose describing `reqFilter`'s syntax (comma-separated ranges, etc.), add an equivalent paragraph directly below it describing `urlFilter`'s syntax:

```
`urlFilter` accepts a comma-separated list of patterns matched against each request's full URL (protocol, host, path, query), unanchored (substring match), case-insensitive:
- Glob syntax by default — only `*` is a wildcard (e.g. `*.example.com`, `*/ads/*`).
- Regex syntax when wrapped in slashes (e.g. `/^https:.*\.js$/`).
- Prefix a pattern with `-` to exclude matches instead of including them (e.g. `-*/ads/*`).
- A request is shown when it matches no exclude pattern AND (matches at least one include pattern OR no include patterns were given).
- Invalid regex patterns are silently ignored.
- Only applies in the standard waterfall view — has no effect when `connectionView: true`.
- Combines with `reqFilter` via AND (a request must pass both filters to be shown).
```

- [ ] **Step 2: Update `AGENTS.md`**

In `AGENTS.md`, find this bullet in the Renderer section:

```
`WaterfallTools.getDefaultOptions()` returns canonical boolean/filter dict: `{ connectionView, thumbnailView, thumbMaxReqs, showCpu, showBw, showMainthread, showLongtasks, showMissing, showLabels, showChunks, showJsTiming, showWait, showLegend, reqFilter, startTime, endTime, rowHeight, backgroundColor, palette }`. Keep in sync when adding controls.
```

Replace `reqFilter,` with `reqFilter, urlFilter,` in that list.

Then, in the Viewer section, find:

```
- Whenever supported formats or capabilities change, update the landing page copy and feature list.
```

Add a new bullet immediately after it:

```
- **Filtering section (viewer Options dialog):** the standalone "Request Filtering" section was merged into a combined "Filtering" section (`#ui-req-filter` for request numbers, `#ui-url-filter` for URL/domain glob-or-regex patterns via `Layout.parseUrlFilter()`). `urlFilter` is AND'd with `reqFilter` and is skipped entirely in Connection View (`options.connectionView`). See `Docs/superpowers/specs/2026-09-28-url-domain-filter-design.md` for full matching semantics.
```

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: document urlFilter option and combined Filtering section"
```

## Task 8: Final full-suite verification

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test -- --run`
Expected: All tests pass (baseline was 162 + this plan's new tests; the one previously-flaky `chrome-trace.test.js` timeout is unrelated — retry in isolation if it recurs).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Zero warnings/errors.

- [ ] **Step 3: Run the browser smoke suite**

Run: `npm run test:browser`
Expected: All specs pass, including the new `viewer-url-filter.spec.js`.

- [ ] **Step 4: Run a production build**

Run: `npm run build`
Expected: Build completes without errors (this also re-runs lint with `--max-warnings 0`).

- [ ] **Step 5: Final review pass**

Read through the diff (`git diff main...HEAD` or equivalent) once more against `Docs/superpowers/specs/2026-09-28-url-domain-filter-design.md` and confirm every item in that spec's "Testing" and "Documentation" sections has a corresponding change. Do not commit anything in this step — it's a verification-only pass.

---

## Out of Scope (per spec)

- No UI toggle for glob vs. regex mode.
- No `?` single-character glob wildcard.
- No domain-only matching mode.
- No application of this filter to Connection View.
