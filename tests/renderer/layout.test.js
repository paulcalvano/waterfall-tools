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
