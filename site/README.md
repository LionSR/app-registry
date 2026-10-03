# APP website

Astro and Starlight website for paper listings, paper pages, the submission interface, and protocol documentation.

- **Papers**: Sourced from `../registry/entries/*.json` and validated by the schema in `src/content.config.ts`. Invalid entries cause build failure. The site also serves JSON representations (`/papers/<ID>.json`, `/papers/index.json`) and `/llms.txt`.
- **Protocol documentation, guides, and skills reference**: Generated at build time from the `../protocol` submodule by `scripts/sync-protocol.mjs`. Do not edit generated documentation in this directory. Update the protocol repository and update the submodule reference.
- **Submit interface**: Located at `src/pages/submit.astro` and `src/scripts/submit.ts`. Communicates with the submission endpoint in `../submit`.

```bash
npm install
npm run dev     # Starts local server at http://localhost:4321
npm run build   # Generates static assets in dist/
```

Build configuration variables (configured in deployment workflows from repository variables):

| Variable | Purpose |
|---|---|
| `SITE_ORIGIN`, `BASE_PATH` | Base URL where the site is served (for example, `https://agenticpapers.app` and `/`). If changed, update `SITE_URL` in repository variables and Supabase secrets. |
| `NOINDEX` | Set to `true` to block search engine indexing. |
| `PUBLIC_SUBMIT_API` | Base URL of the submission endpoint. |
| `PUBLIC_GITHUB_APP_CLIENT_ID` | Client ID of the GitHub App used for authentication. |

Internal links use Astro base path handling: call `url()` from `src/lib/url.ts` in components, and use relative links in Markdown documents.
