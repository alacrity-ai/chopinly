# Writing for the Chopinly blog

The blog exists to be read by pianists, and only secondarily to be found by
search engines. Write the piece you would want to find. See
[SEO_DESIGN.md](SEO_DESIGN.md) for the machinery.

## Adding a post

1. Create `content/blog/<slug>.md`. The file name is the URL (`/blog/<slug>`):
   lowercase, hyphens, the words someone would search for.
2. Front matter:
   ```yaml
   ---
   title: "How to practice piano with a metronome (without playing like a machine)"
   description: "One or two sentences, ≤ 160 characters ideally. This is the meta description, the OG description and the card blurb."
   date: 2026-09-06          # publication date, yyyy-mm-dd — the real one
   updated: 2026-09-20       # optional; bump on a material edit (drives dateModified)
   tags: [metronome, rhythm, practice]
   tool: metronome           # optional: the tool page slug this post belongs to (tool card + `about` in JSON-LD)
   order: 2                  # optional: tie-break among posts with the same date (lower first)
   status: draft             # optional: a draft is skipped by the build
   ---
   ```
3. Body in Markdown. Start with prose, not a heading — the title is the H1.
   Use `##` for sections (three or more and the post gets a table of contents),
   `###` sparingly. Supported: paragraphs, `**bold**`, `*italic*`, `` `code` ``,
   `[links](/metronome)`, bullet and numbered lists, `> quotes`, fenced code,
   pipe tables, `---`. Nothing else — the renderer is `dev/lib/markdown.mjs`
   and it is small on purpose.
4. Start the dev server (`npx wrangler pages dev . --local --port 8789`), then:
   ```bash
   node dev/render-og.mjs --posts     # og/blog/<slug>.png
   node dev/build-site.mjs            # blog/<slug>.html, index, sitemap, rss, llms.txt, landing teaser
   npm test                           # site.test.mjs checks the committed output + ≥900 words
   ```
5. Commit the Markdown, the generated HTML, the OG image, and the feeds together.
   Bump the release (`sw.js` CACHE + `js/version.js`) only if `js/`, `css/` or
   the app shell changed — pure content changes don't need one.
6. After deploy: `node dev/indexnow.mjs /blog/<slug>` and, once Search Console is
   verified, a URL inspection (SOP `google-search-console-api.md`).

## Voice

- Written by a pianist for pianists. Specific over general: "bars 9–12 at 76",
  not "the difficult passage slowly".
- Honest about Chopinly. Mention a tool where it genuinely helps, in one
  sentence, and link to its page; never make the article an advert. If the
  advice works without the app, say so.
- No listicles, no "in this article we will". Get to the point in the first
  paragraph; the reader decides from there.
- 1,000–2,000 words. Shorter than that is a note; longer needs to be two posts.
- Link to two or three other posts and to the relevant tool page. Internal
  links are how the site's topics hang together.
- British or American spelling — either, consistently within a post.

## Titles and descriptions

- Title ≤ 70 characters where possible, the search phrase early, a human hook
  after: *"How long should you practice piano each day? Less than you think,
  more often than you do"*.
- Description is a promise about what the reader will get, not a summary of
  the app.

## Author

Posts carry `Leif Taylor` as author (`AUTHOR` in `dev/build-site.mjs`), linked
to `/about`, with the site's `Person` JSON-LD. Change the constant to change
every post.
