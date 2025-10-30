const express = require('express');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function resolveUrl(href, base) {
    try { return new URL(href, base).href; } catch { return href; }
}

app.post('/scrape', async (req, res) => {
    const { url, contentTypes } = req.body || {};
    if (!url || !Array.isArray(contentTypes) || contentTypes.length === 0) {
        return res.status(400).json({ error: 'Missing url or contentTypes' });
    }

    try {
        const resp = await axios.get(url, { responseType: 'text', timeout: 15000 });
        const html = resp.data;
        const $ = cheerio.load(html);
        const results = {};

        if (contentTypes.includes('html')) results.html = html;
        if (contentTypes.includes('txt')) results.text = $('body').text().replace(/\s+/g, ' ').trim();

        if (contentTypes.includes('css')) {
            const cssContents = [];
            $('style').each((i, el) => { const t = $(el).html(); if (t) cssContents.push(t); });
            const cssLinks = [];
            $('link[rel="stylesheet"]').each((i, el) => { const href = $(el).attr('href'); if (href) cssLinks.push(resolveUrl(href, url)); });
            for (const link of cssLinks) {
                try { const r = await axios.get(link, { responseType: 'text', timeout: 10000 }); cssContents.push(r.data); } catch {}
            }
            results.css = cssContents;
        }

        if (contentTypes.includes('js')) {
            const jsContents = [];
            $('script:not([src])').each((i, el) => { const t = $(el).html(); if (t) jsContents.push(t); });
            const scriptLinks = [];
            $('script[src]').each((i, el) => { const src = $(el).attr('src'); if (src) scriptLinks.push(resolveUrl(src, url)); });
            for (const s of scriptLinks) {
                try { const r = await axios.get(s, { responseType: 'text', timeout: 10000 }); jsContents.push(r.data); } catch {}
            }
            results.js = jsContents;
        }

        if (contentTypes.includes('img')) {
            const images = [];
            $('img').each((i, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                if (src) images.push(resolveUrl(src, url));
            });
            results.images = images;
        }

        if (contentTypes.includes('video')) {
            const videos = [];
            $('video').each((i, el) => {
                const src = $(el).attr('src');
                if (src) videos.push(resolveUrl(src, url));
                $(el).find('source').each((j, sourceEl) => {
                    const s = $(sourceEl).attr('src');
                    if (s) videos.push(resolveUrl(s, url));
                });
            });
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && /\.(mp4|webm|ogg)$/i.test(href)) videos.push(resolveUrl(href, url));
            });
            results.videos = videos;
        }

        return res.json({ message: 'Scrape complete', results });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch or parse the URL', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
