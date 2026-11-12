#!/usr/bin/env node
// Static generator for Beloved Films screenings. No dependencies; needs Node 18+.
//
//   node scripts/build.mjs                  rebuild everything
//   node scripts/build.mjs --check          exit 1 if generated files are out of date
//   node scripts/build.mjs --today=2026-12-01   pretend today is that date (for testing)
//
// Reads data/events.json and writes:
//   film-club/<slug>/index.html   one page per event that has a "description"
//   index.html, film-club/index.html, past-events/index.html
//                                 only the parts between <!-- events:NAME:start/end --> markers
//   sitemap.xml
//
// See docs/adding-a-screening.md.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.belovedfilms.co.uk';
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const todayArg = args.find((a) => a.startsWith('--today='));

// "Today" in London, as YYYY-MM-DD: an event counts as past from the day after it takes place
const TODAY = todayArg
    ? todayArg.slice('--today='.length)
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

// ---------------------------------------------------------------- data

const data = JSON.parse(readFileSync(join(ROOT, 'data/events.json'), 'utf8'));
const errors = [];
const slugs = new Set();

for (const e of data.events) {
    const where = `event "${e.slug || e.title || '?'}"`;
    for (const key of ['slug', 'title', 'date', 'venue', 'poster', 'ticketUrl']) {
        if (!e[key]) errors.push(`${where}: missing "${key}"`);
    }
    if (e.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) errors.push(`${where}: slug must be lowercase words joined by hyphens`);
    if (slugs.has(e.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(e.slug);
    if (e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push(`${where}: date must be YYYY-MM-DD`);
    if (e.date && Number.isNaN(Date.parse(e.date))) errors.push(`${where}: date is not a real date`);
    for (const key of ['startTime', 'endTime']) {
        if (e[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e[key])) errors.push(`${where}: ${key} must be HH:MM (24-hour)`);
    }
    if (e.endTime && !e.startTime) errors.push(`${where}: endTime needs startTime`);
    if (e.venue && !data.venues[e.venue]) errors.push(`${where}: unknown venue "${e.venue}"`);
    if (e.ticketUrl && !/^https:\/\//.test(e.ticketUrl)) errors.push(`${where}: ticketUrl must be an https link`);
    if (e.poster && e.poster.file && !existsSync(join(ROOT, 'assets/images/film-club', e.poster.file))) {
        errors.push(`${where}: poster not found at assets/images/film-club/${e.poster.file}`);
    }
    if (e.status && !['cancelled'].includes(e.status)) errors.push(`${where}: status can only be "cancelled" (leave it out otherwise)`);
    if (e.availability && !['InStock', 'SoldOut', 'LimitedAvailability'].includes(e.availability)) {
        errors.push(`${where}: availability must be InStock, SoldOut or LimitedAvailability`);
    }
    if (hasPage(e) && !(e.poster && e.poster.width && e.poster.height)) {
        errors.push(`${where}: event pages need poster.width and poster.height`);
    }
}
if (errors.length) {
    console.error('data/events.json has problems:\n - ' + errors.join('\n - '));
    process.exit(1);
}

function hasPage(e) { return Array.isArray(e.description) && e.description.length > 0; }
function isPast(e) { return e.date < TODAY; }
const byDateAsc = (a, b) => a.date.localeCompare(b.date);
const upcoming = data.events.filter((e) => !isPast(e)).sort(byDateAsc);
const past = data.events.filter(isPast).sort((a, b) => byDateAsc(b, a));

// ---------------------------------------------------------------- formatting

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateOf = (e) => new Date(`${e.date}T12:00:00Z`);
const fmt = (e, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(dateOf(e));
const longDate = (e) => fmt(e, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '');
const plainDate = (e) => fmt(e, { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (e) => fmt(e, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '');
const clock = (t) => {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const timeRange = (e) => (e.startTime ? clock(e.startTime) + (e.endTime ? `–${clock(e.endTime)}` : '') : '');

// Europe/London offset (+00:00 or +01:00) for the event's date and start time
function londonOffset(e) {
    const at = new Date(`${e.date}T${e.startTime || '12:00'}:00Z`);
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'longOffset' })
        .formatToParts(at).find((p) => p.type === 'timeZoneName').value; // "GMT" or "GMT+01:00"
    return part === 'GMT' ? '+00:00' : part.replace('GMT', '');
}

const venueOf = (e) => data.venues[e.venue];
const eventUrl = (e) => `/film-club/${e.slug}/`;
const posterSrc = (e) => `/assets/images/film-club/${e.poster.file}`;
const newTab = '<span class="sr-only"> (opens in a new tab)</span>';
const PIN = '<svg aria-hidden="true" focusable="false"><use href="#pin"/></svg>';

// ---------------------------------------------------------------- cards and sections

function card(e) {
    const past = isPast(e);
    const cancelled = e.status === 'cancelled';
    const page = hasPage(e);
    const href = eventUrl(e);
    const posterInner = `<img src="${posterSrc(e)}" alt="${esc(e.poster.alt)}" loading="lazy">` +
        (past ? '<span class="poster-stamp">Past screening</span>' : '') +
        (cancelled && !past ? '<span class="poster-stamp">Cancelled</span>' : '') +
        (page ? `<span class="poster-cta">${past ? 'Event details' : 'View event'}</span>` : '');
    const posterEl = page
        ? `<a class="screening-poster" href="${href}" aria-label="${past ? 'Past screening' : 'Event details'}: ${esc(e.title)}, ${plainDate(e)}">${posterInner}</a>`
        : `<div class="screening-poster">${posterInner}</div>`;
    const title = page ? `<a href="${href}">"${esc(e.title)}"</a>` : `"${esc(e.title)}"`;
    const dateText = past
        ? `<time datetime="${e.date}">${plainDate(e)}</time>`
        : `<time datetime="${e.date}${e.startTime ? 'T' + e.startTime : ''}">${longDate(e)}</time>${e.startTime ? ` · ${clock(e.startTime)}` : ''}`;
    const buy = !past && !cancelled
        ? `\n            <a class="screening-buy" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener noreferrer">Book tickets<span class="sr-only"> for ${esc(e.title)} (opens in a new tab)</span></a>`
        : '';
    return `        <article class="screening">
            ${posterEl}
            <h3 class="screening-title">${title}</h3>
            <p class="screening-date">${dateText}</p>
            <span class="venue">${PIN} ${esc(venueOf(e).label)}</span>${buy}
        </article>`;
}

function upcomingSection() {
    if (!upcoming.length) {
        return `    <p class="screenings-notice" id="screeningsNotice">
        <strong>Next screening coming soon</strong>
        <a href="#newsletter">Sign up to the newsletter</a> to hear about it first.
    </p>`;
    }
    const lone = upcoming.length === 1;
    return `    <section id="upcomingSection" aria-labelledby="upcomingHeading">
    <h2 class="screenings-heading" id="upcomingHeading">Upcoming screenings</h2>
    <div class="screenings${lone ? ' is-featured' : ''}">
${upcoming.map(card).join('\n\n')}
    </div>
    </section>`;
}

function pastSection(heading = 'Past screenings', id = 'pastHeading') {
    if (!past.length) return '';
    return `    <section id="pastSection" aria-labelledby="${id}">
    <h2 class="screenings-heading" id="${id}">${heading}</h2>
    <div class="screenings">
${past.map(card).join('\n\n')}
    </div>
    </section>`;
}

function homeNext() {
    const next = upcoming[0];
    if (!next || next.status === 'cancelled') {
        return `<p class="next-screening">Next Film Club screening coming soon. <a href="/film-club/">See Beloved Film Club</a></p>`;
    }
    const title = hasPage(next) ? `<a href="${eventUrl(next)}">${esc(next.title)}</a>` : esc(next.title);
    return `<p class="next-screening">
                <span class="next-label">Next Film Club screening</span>
                ${title}<br>
                <time datetime="${next.date}">${shortDate(next)}</time> · ${esc(venueOf(next).label)}
            </p>`;
}

// ---------------------------------------------------------------- event page

function jsonLd(e) {
    const v = venueOf(e);
    const offset = londonOffset(e);
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: `Beloved Film Club Presents: ${e.title}`,
        description: e.seoDescription || e.description[0],
        startDate: e.startTime ? `${e.date}T${e.startTime}:00${offset}` : e.date,
        ...(e.endTime ? { endDate: `${e.date}T${e.endTime}:00${offset}` } : {}),
        eventStatus: e.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
            '@type': 'Place',
            name: v.name,
            address: {
                '@type': 'PostalAddress',
                addressLocality: v.locality,
                postalCode: v.postcode,
                addressCountry: v.country,
                ...(v.streetAddress ? { streetAddress: v.streetAddress } : {})
            }
        },
        image: [`${SITE}${posterSrc(e)}`],
        organizer: { '@type': 'Organization', name: data.organizer.name, url: data.organizer.url },
        url: `${SITE}${eventUrl(e)}`
    };
    // Booking details only while the event can still be booked. Price and availability only if you add them.
    if (!isPast(e) && e.status !== 'cancelled') {
        ld.offers = {
            '@type': 'Offer',
            url: e.ticketUrl,
            ...(e.price ? { price: String(e.price), priceCurrency: e.currency || 'GBP' } : {}),
            ...(e.availability ? { availability: `https://schema.org/${e.availability}` } : {})
        };
    }
    return JSON.stringify(ld, null, 4).replace(/</g, '\\u003c').replace(/\n/g, '\n    ');
}

function eventPage(e) {
    const v = venueOf(e);
    const past = isPast(e);
    const cancelled = e.status === 'cancelled';
    const canonical = `${SITE}${eventUrl(e)}`;
    const title = e.seoTitle || `${e.title} Screening in Hackney | Beloved Film Club`;
    const desc = e.seoDescription || e.description[0];
    const time = timeRange(e);
    const venueLine = `${v.label}, ${v.locality} ${v.postcode}`;
    const facts = [
        ['Film', `${esc(e.title)}${e.year ? ` (${e.year})` : ''}`],
        e.director ? ['Director', esc(e.director)] : null,
        e.cast && e.cast.length ? ['Cast', esc(e.cast.join(', '))] : null,
        ['Date', `<time datetime="${e.date}">${longDate(e)}</time>`],
        time ? ['Time', esc(time)] : null,
        ['Venue', esc(venueLine)],
        e.runtime ? ['Runtime', esc(e.runtime)] : null
    ].filter(Boolean).map(([k, val]) => `                    <div><dt>${k}</dt><dd>${val}</dd></div>`).join('\n');

    let action;
    if (cancelled) {
        action = `<p class="event-note">This screening has been cancelled. <a href="/film-club/">See upcoming Beloved Film Club screenings</a>.</p>`;
    } else if (past) {
        action = `<p class="event-note">This screening has taken place. <a href="/film-club/">See upcoming Beloved Film Club screenings</a>.</p>`;
    } else {
        action = `<p><a class="screening-buy" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener noreferrer">Book tickets for ${esc(e.title)}${newTab}</a></p>
                <p class="event-small">Tickets are sold through Ticket Tailor.</p>`;
    }
    const eyebrow = past ? 'Beloved Film Club presented' : 'Beloved Film Club presents';
    const subline = `<time datetime="${e.date}">${longDate(e)}</time>${time ? ` · ${esc(time)}` : ''} · ${esc(v.label)}`;

    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="author" content="Beloved Films">
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Beloved Films">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${SITE}${posterSrc(e)}">
    <meta property="og:image:width" content="${e.poster.width}">
    <meta property="og:image:height" content="${e.poster.height}">
    <meta property="og:image:alt" content="${esc(e.poster.alt)}">
    <meta name="twitter:card" content="summary">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preload" href="/assets/fonts/script_alt-webfont.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/assets/fonts/all_caps-webfont.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/site.css">
    <link rel="stylesheet" href="/assets/screenings.css">
    <link rel="stylesheet" href="/assets/event.css">
    <link rel="stylesheet" href="https://sibforms.com/forms/end-form/build/sib-styles.css">
    <link rel="stylesheet" href="/assets/newsletter.css">
    <script type="application/ld+json">
    ${jsonLd(e)}
    </script>
</head>

<body>
    <!-- Generated by scripts/build.mjs from data/events.json. Edit the data, not this file. -->
    <svg style="display: none" aria-hidden="true">
        <symbol id="pin" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></symbol>
    </svg>

    <nav class="top-navigation">
        <div class="nav-links">
            <a href="/"><img class="logo" src="/assets/images/black-logotype.png" alt="Beloved Films home"></a>
            <a href="/film-club/">Film Club</a>
            <a href="/past-events/">Past Events</a>
        </div>
    </nav>

    <header class="hero">
        <h1 class="main-heading"><span class="event-eyebrow">${eyebrow}</span> ${esc(e.title)}</h1>
        <p class="hero-sub">${subline}</p>
    </header>

    <div class="ribbon" aria-hidden="true">
        <div class="ribbon-track" id="ribbonTrack"></div>
    </div>

    <main class="event-page">
        <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/film-club/">Beloved Film Club</a> <span aria-hidden="true">/</span> <span aria-current="page">${esc(e.title)}</span>
        </nav>

        <div class="event-page-grid">
            <figure class="event-page-poster">
                <img src="${posterSrc(e)}" alt="${esc(e.poster.alt)}" width="${e.poster.width}" height="${e.poster.height}">
            </figure>

            <div class="event-page-info">
                <h2>Event details</h2>
                <dl class="event-facts">
${facts}
                </dl>
                ${action}

                <h2>About the screening</h2>
${e.description.map((p) => `                <p>${esc(p)}</p>`).join('\n')}

                <h2>About Beloved Film Club</h2>
                <p>Beloved Film Club is a regular community film night run by Beloved Films. We show independent films, cult classics and favourites worth rewatching, for people who love movies and for anyone curious to discover something new.</p>

                <p class="event-links">
                    <a href="/film-club/">All Beloved Film Club screenings</a>
                    <a href="/past-events/">Past events</a>
                </p>
            </div>
        </div>
    </main>

    <footer class="footer">
        <p class="footer-about">Beloved Films is bringing distinctive independent cinema to the big screen through curated releases and special screenings.</p>
        <div id="newsletter"></div>
        <div class="footer-social" id="footerSocial"></div>
        <p class="copyright"><span class="copyright-mark">©</span> <span class="year">2026</span> Beloved Films Ltd. All Rights Reserved.</p>
    </footer>

    <div class="grain" aria-hidden="true"></div>

    <script src="/assets/newsletter.js"></script>
    <script src="/assets/site.js"></script>
</body>

</html>
`;
}

// ---------------------------------------------------------------- sitemap

// Last commit date of a file; today if it has uncommitted changes (e.g. just regenerated)
function gitDate(path) {
    try {
        const opts = { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] };
        if (execFileSync('git', ['status', '--porcelain', '--', path], opts).toString().trim()) return TODAY;
        return execFileSync('git', ['log', '-1', '--format=%cs', '--', path], opts).toString().trim() || null;
    } catch { return null; }
}

function sitemap() {
    const pages = [
        { loc: '/', file: 'index.html' },
        { loc: '/film-club/', file: 'film-club/index.html' },
        { loc: '/past-events/', file: 'past-events/index.html' },
        ...data.events.filter(hasPage).map((e) => ({ loc: eventUrl(e), lastmod: e.updated || null })),
        { loc: '/privacy/', file: 'privacy/index.html' }
    ];
    const rows = pages.map((p) => {
        const lastmod = p.lastmod !== undefined ? p.lastmod : gitDate(p.file);
        return `    <url><loc>${SITE}${p.loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------- writing

let stale = 0;
function write(rel, content) {
    const path = join(ROOT, rel);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) return;
    stale++;
    if (CHECK) { console.error(`out of date: ${rel}`); return; }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`wrote ${rel}`);
}

function inject(rel, name, html) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    const re = new RegExp(`([ \\t]*)<!-- events:${name}:start[^>]*-->[\\s\\S]*?<!-- events:${name}:end -->`);
    const m = text.match(re);
    if (!m) throw new Error(`${rel}: missing <!-- events:${name}:start --> ... <!-- events:${name}:end --> markers`);
    const indent = m[1];
    const block = `${indent}<!-- events:${name}:start (generated by scripts/build.mjs; edit data/events.json) -->\n${html ? html + '\n' : ''}${indent}<!-- events:${name}:end -->`;
    write(rel, text.replace(re, () => block));
}

for (const e of data.events.filter(hasPage)) write(`film-club/${e.slug}/index.html`, eventPage(e));
inject('index.html', 'home-next', homeNext());
inject('film-club/index.html', 'upcoming', upcomingSection());
inject('film-club/index.html', 'past', pastSection());
write('sitemap.xml', sitemap());

if (CHECK && stale) process.exit(1);
console.log(`${upcoming.length} upcoming, ${past.length} past (today is ${TODAY}).${stale ? '' : ' Nothing changed.'}`);
