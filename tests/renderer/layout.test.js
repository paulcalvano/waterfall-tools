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
        // Note: RegExp.source escapes forward slashes, so the source will show \/ads\/...
        expect(includes[0].source).toBe('\\/ads\\/v1\\.2\\?x=1');
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
        // `row.index` carries entry._originalIndex (the pre-filter position) —
        // row.url is a formatted "hostname - pathname" display string, not the raw URL.
        expect(rows.map(r => r.index)).toEqual([0, 2]);
    });

    it('exclude-only: drops requests matching any exclude pattern, keeps the rest', () => {
        const entries = makeEntries([
            'https://example.com/ads/banner.png',
            'https://example.com/index.html'
        ]);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '-*/ads/*' });
        expect(rows).toHaveLength(1);
        expect(rows[0].index).toBe(1);
    });

    it('mixed include+exclude: exclude wins even when a URL also matches an include', () => {
        const entries = makeEntries([
            'https://example.com/ads/tracker.js',
            'https://example.com/app.js',
            'https://other.com/app.js'
        ]);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '*.js,-*/ads/*' });
        expect(rows.map(r => r.index)).toEqual([1, 2]);
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
        expect(rows.map(r => r.index).sort()).toEqual([0, 1]);
    });

    it('empty urlFilter is a no-op', () => {
        const entries = makeEntries(['https://example.com/a', 'https://other.com/b']);
        const { rows } = Layout.calculateRows(entries, 1000, { urlFilter: '' });
        expect(rows).toHaveLength(2);
    });
});
