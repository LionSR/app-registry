# Submit endpoint

A stateless Vercel function, and the only way into the registry. It stores nothing.

- `GET /api/auth/callback`: GitHub redirects here after "Sign in with GitHub" on the site's `/submit/` page. It swaps the code for a user token and returns it to the page in the URL fragment.
- `POST /api/submit`: body `{"release_url": "...", "relationship": "author" | "coauthor" | "on-behalf"}` with `Authorization: Bearer <GitHub token>`. The token only identifies the submitter (`GET /user`); any GitHub token works, including `gh auth token`. The issue is opened by the registry's GitHub App, so the review workflow can trust it.

```bash
npm install
npm test        # unit tests plus the handler with GitHub faked
```

## Setup

1. **GitHub App** (Settings → Developer settings → GitHub Apps → New):
   - Callback URL: `https://<this-deployment>/api/auth/callback`
   - Webhook: off
   - Repository permissions: Issues read and write. Nothing else.
   - Install it on the registry repository only.
2. **Vercel project** rooted at `submit/`, with these environment variables:

   | Variable | Value |
   |---|---|
   | `GITHUB_APP_ID` | the App ID |
   | `GITHUB_APP_PRIVATE_KEY` | the App's private key (PEM) |
   | `GITHUB_APP_CLIENT_ID` | the App's client ID |
   | `GITHUB_APP_CLIENT_SECRET` | a client secret |
   | `REGISTRY_REPO` | `LionSR/app-registry` |
   | `SITE_URL` | the site's URL, e.g. `https://lionsr.github.io/app-registry` |

3. **Registry repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `REGISTRY_BOT_LOGIN`: the App's bot login, `<app-slug>[bot]`
   - `SITE_URL`: same as above, for links in bot comments
4. **Site build**: set `PUBLIC_SUBMIT_API` to this deployment's URL and `PUBLIC_GITHUB_APP_CLIENT_ID` to the client ID.
