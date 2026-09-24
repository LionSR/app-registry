# APP website

Astro + Starlight site: the papers listing, paper pages, the Submit page, and the protocol docs.

- **Papers** come from `../registry/entries/*.json`, validated by the Zod schema in `src/content.config.ts`. A malformed entry fails the build. Each paper is also served as JSON (`/papers/<ID>.json`, `/papers/index.json`) and listed in `/llms.txt`.
- **Protocol docs, guides and the skills reference** are generated at build time from the `../protocol` submodule by `scripts/sync-protocol.mjs`: one page per release tag from 1.0.0 on, and selected README sections. Do not edit those pages here; change the protocol repo and update the submodule.
- **The Submit page** (`src/pages/submit.astro`, script in `src/scripts/`) talks to the submit endpoint in `../submit`.

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # static output in dist/
```

Build settings come from the environment (the deploy workflow sets them from repository variables):

| Variable | Purpose |
|---|---|
| `SITE_ORIGIN`, `BASE_PATH` | where the site is served, e.g. `https://sirui-lu.com` and `/app-registry` |
| `NOINDEX` | `true` asks search engines not to index the site |
| `PUBLIC_SUBMIT_API` | the submit endpoint's base URL |
| `PUBLIC_GITHUB_APP_CLIENT_ID` | the GitHub App used for sign-in |

Internal links go through Astro's base path: `url()` in `src/lib/url.ts` for components, relative links in hand-written Markdown.
