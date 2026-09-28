# URL / Domain Filter — Design Spec

**Date:** 2026-09-28
**Status:** Approved, ready for implementation planning

## Summary

Add a new waterfall filter that lets a user hide/show requests by matching against their full URL, using glob-style wildcards and/or full regular expressions. It lives in the "Waterfall Options" dialog, combined into the existing "Filtering" section alongside the current request-number filter (`reqFilter`).

## Motivation

Today the only way to narrow the visible request set is `reqFilter`, which requires the user to already know (or count) request indices. Filtering by domain or URL substring/pattern is a much more common real-world need (e.g. "show me only requests to `*.mydomain.com`", "hide all analytics/ad domains").

## Matching Semantics

- **Full URL matching.** The pattern is tested against the complete request URL (protocol, host, path, query string) — not just the hostname. This is more flexible and mirrors DevTools' default network filter behavior.
- **Unanchored (substring) matching.** Patterns match anywhere in the URL, not just when they match the entire string. This means a bare pattern like `google.com` matches `https://www.google.com/page` without requiring wildcards on both ends. Wildcards remain useful for mid-string patterns like `*/ads/*`.
- **Case-insensitive.** All patterns (glob and regex) compile with the `i` flag.
- **Two pattern syntaxes, auto-detected per token:**
  - **Regex**, when the token is wrapped in `/…/` (e.g. `/^https:.*\.js$/`). The interior is used as raw regex source.
  - **Glob**, otherwise. Only `*` is a wildcard (matches any sequence of characters); no `?` single-char wildcard support (real URLs use `?` as the query-string delimiter, so treating it as a wildcard would be confusing). All other regex metacharacters in the glob token are escaped literally before `*` → `.*` substitution.
- **Multiple patterns, comma-separated, OR'd together** for the include set (same convention as `reqFilter`'s comma-separated ranges).
- **Negation via leading `-`.** A token starting with `-` (stripped before syntax detection) is an exclude pattern instead of an include pattern.
- **Include/exclude combination:** a request is shown when:
  1. It does **not** match any exclude pattern, **AND**
  2. It matches **at least one** include pattern, **OR** there are no include patterns at all (only excludes present, or filter is empty).
- **Invalid regex tokens fail silently.** A malformed `/…/` pattern (e.g. unbalanced brackets) is caught and dropped — it contributes to neither the include nor exclude set. This matches the existing forgiving behavior of `reqFilter` (unparseable tokens are silently ignored) and avoids error UI flicker while a regex is mid-edit.
- **Scope: Waterfall view only.** The filter does not apply when `options.connectionView` is true. Connection View groups by connection rather than individual requests, and URL-level filtering was judged not to fit that view's semantics.
- **Combines with `reqFilter` via AND.** Both filters are applied as independent, sequential array-filter passes — a request must survive both to be shown.

## Architecture

### New option

`src/core/waterfall-tools.js#getDefaultOptions()` gains:
```js
urlFilter: ''
```

### Parsing helper

New static method `Layout.parseUrlFilter(filterStr)` in `src/renderer/layout.js`:
- Returns `{ includes: RegExp[], excludes: RegExp[] }`.
- Splits `filterStr` on `,`, trims each token, skips empty tokens.
- For each token: strip a leading `-` (routes to excludes instead of includes), then compile the remainder:
  - If it starts with `/` and ends with `/` (length > 1), use the interior as regex source.
  - Otherwise, escape regex metacharacters except `*`, then replace `*` with `.*`.
- Compile with `new RegExp(source, 'i')` inside a `try/catch`; on throw, drop that token entirely (don't add to either array).

### Filtering pass

In `Layout.calculateRows()`, immediately after the existing `reqFilter` block:
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
`entry.url` is already populated (flat string, sourced from `entry.request.url` in `har-converter.js`) and is the same field `getRequestColors()` already reads — no new data plumbing required.

### UI (Viewer)

`src/viewer/index.html` — the existing standalone "Request Filtering" section is replaced with a combined "Filtering" section containing two labeled fields:
1. **Request numbers** — existing `#ui-req-filter` input, unchanged behavior, now with an explicit label above it.
2. **URL / domain pattern** — new `#ui-url-filter` input, placeholder `e.g. *.google.com, -*/ads/*, /cdn\d+\.example\.com/`, with a small `?` help icon/tooltip next to its label. Tooltip content (validated via mockup):
   - `*.google.com` — wildcard glob match
   - `/^https:.*\.js$/` — regex (slash-delimited)
   - `-*/ads/*` — exclude matches (leading `-`)
   - Comma-separate multiple patterns — combined with OR

`src/viewer/viewer.js` — three mechanical additions mirroring the existing `reqFilter` plumbing exactly:
1. `getOptionsFromUrl()`: parse `?urlFilter=` query param.
2. Modal-open sync: set `#ui-url-filter`'s value from `renderOptions.urlFilter`.
3. Input-listener array (`['ui-start-time', 'ui-end-time', 'ui-req-filter', ...]`): add `'ui-url-filter'`, mapping to `optKey: 'urlFilter'`, with `undefined` substituted for an empty string (same as `reqFilter`).

No changes needed to `updateOptions()` or `updateUrlWithCurrentState()` — both are already generic over all option keys in `getDefaultOptions()`.

## Testing

- Unit tests in `tests/renderer/layout.test.js`:
  - `parseUrlFilter`: glob→regex translation, `*` wildcard, regex delimiter detection, exclude prefix stripping, invalid regex silently dropped, case-insensitivity, comma-splitting with whitespace trimming, empty/whitespace-only filter.
  - `calculateRows()`: include-only, exclude-only, mixed include+exclude, no matches (empty result), `connectionView: true` bypasses filtering entirely, combination with `reqFilter` (AND semantics).

## Documentation

- `README.md`: add `urlFilter` to the documented renderer options list (alongside the existing `reqFilter` entry).
- `AGENTS.md`: update the renderer/options-related bullets to mention `urlFilter`, and note that the viewer's "Request Filtering" section was renamed/merged into a combined "Filtering" section (per the file's own mandatory rule that public option/API changes must be reflected here).

## Out of Scope

- No UI toggle for glob vs. regex mode (auto-detected via `/…/` delimiters instead).
- No `?` single-character glob wildcard.
- No domain-only matching mode (full URL substring matching covers this via patterns like `*.example.com`).
- No application of this filter to Connection View.
