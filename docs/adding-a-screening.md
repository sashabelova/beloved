# Adding a Film Club screening

Everything about screenings lives in **`data/events.json`**. You add one entry, add a poster, and run one command. The script then rebuilds:

- the event's own page at `/film-club/<slug>/` (with Event structured data for Google),
- the "Next screening / Upcoming" and "Past screenings" lists on the Film Club page,
- the "Next Film Club screening" box on the homepage,
- the Film Club section on the Past Events page,
- `sitemap.xml`.

Do not edit the generated parts by hand (the blocks between `<!-- events:... -->` markers, and `film-club/<slug>/index.html`): they are overwritten on the next build.

## Steps

1. Put the poster in `assets/images/film-club/` (WebP, like the others).
2. Copy an existing entry in `data/events.json` and change the details:

   | Field | Notes |
   |---|---|
   | `slug` | Web address: `/film-club/<slug>/`. Lowercase words with hyphens. Never change it after publishing. |
   | `title` | Film title |
   | `date` | `YYYY-MM-DD` |
   | `startTime`, `endTime` | 24-hour `HH:MM`, London time. Use the times advertised on Ticket Tailor. |
   | `venue` | A key from `venues` (add a new venue there if needed) |
   | `poster` | `file`, `alt`, and `width`/`height` in pixels |
   | `ticketUrl` | Ticket Tailor link |
   | `year`, `director`, `cast` (list of names), `runtime` | Shown in the event details (optional) |
   | `seoTitle`, `seoDescription` | Page title and Google snippet (optional, sensible defaults) |
   | `description` | List of paragraphs. **An event only gets its own page if this is present.** |
   | `updated` | `YYYY-MM-DD`, set when you change the event; used in the sitemap |
   | `price`, `currency`, `availability` | Optional. Only add if verified. They go into the structured data. `availability` can be `InStock`, `SoldOut` or `LimitedAvailability`. |
   | `status` | Optional. Only `"cancelled"`. |

3. Run `node scripts/build.mjs` (Node 18+, no install needed).
4. Open the site locally (`python3 -m http.server`) and look at `/film-club/`, `/film-club/<slug>/` and the homepage.
5. Commit and push. GitHub Pages deploys it.
6. In Google Search Console, "Inspect URL" the new event page and click "Request indexing".

Never put a street address, price or availability in the data unless you have confirmed it: the page and the structured data would then state it.

## When an event has happened

Nothing to do. An event counts as past from the day after its date: it moves to "Past screenings", its booking buttons and `offers` markup disappear, and its page stays online. The site does this when the script runs, and the workflow in `.github/workflows/rebuild.yml` runs it every day and commits any change. If you delete that workflow, run the script yourself after each screening.

The script never marks events as sold out or completed except by date. If a screening is cancelled, set `"status": "cancelled"`. To update the wording of a past page, edit its `description`.

## Other commands

- `node scripts/build.mjs --check` exits with an error if the generated files are out of date.
- `node scripts/build.mjs --today=2026-12-01` rebuilds as if it were that date (to preview the past-event view; rebuild without it afterwards).
- The script validates the data and stops with a clear message if something is missing or wrong.
