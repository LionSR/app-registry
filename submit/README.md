# Submit endpoint

A stateless Supabase Edge Function named `registry`, and the only way into the registry. It uses no Supabase database, auth, or storage, and stores nothing.

Base URL: `https://<project-ref>.supabase.co/functions/v1/registry`

- `GET /auth/callback`: GitHub redirects here after "Sign in with GitHub" on the site's `/submit/` page. It swaps the code for a user token and returns it to the page in the URL fragment.
- `POST /submit`: body `{"release_url": "...", "accept_terms": true, "authors_permission": false}` with `Authorization: Bearer <token>`. The token must have been issued by the registry's GitHub App, through the website's sign-in or GitHub's device flow (see the site's *For agents* page); the endpoint checks this with GitHub's token API and rejects any other token. It then reads the submitter's login and whether they can push to the paper repository (`permissions.push`). Without write access the submitter must send `"authors_permission": true`. The issue is opened by the same GitHub App as its bot, so the review workflow can trust what it records.

One **GitHub App** does both jobs: it signs users in (its user tokens only read the user's identity and their access to public repositories) and, installed on the registry repository only, it opens submission issues.

Code: `supabase/functions/_shared/handler.ts` (routes), `supabase/functions/_shared/submission.ts` (pure helpers, also used by the website), `supabase/functions/registry/index.ts` (entry point).

```bash
npm install
npm test        # unit tests plus the handler with GitHub faked, under Node
```

## Setup

1. **GitHub App** (Settings → Developer settings → GitHub Apps → New):
   - Callback URL: `https://<project-ref>.supabase.co/functions/v1/registry/auth/callback`. Enable Device Flow (for agents).
   - Webhook: off.
   - Repository permissions: Issues read and write. Nothing else.
   - Where it can be installed: any account (a public App), so that anyone can sign in. Install it on the registry repository only.
   - Generate a client secret and a private key.
2. The App's installation is what opens issues; sign-in needs no installation on the paper repositories.
3. **Supabase project**: any project works; only Edge Functions are used. From this directory:

   ```bash
   supabase login
   supabase secrets set --project-ref <project-ref> \
     GITHUB_APP_ID=<app id> \
     GITHUB_APP_CLIENT_ID=<client id> \
     GITHUB_APP_CLIENT_SECRET=<client secret> \
     GITHUB_APP_PRIVATE_KEY="$(cat path/to/private-key.pem)" \
     REGISTRY_REPO=LionSR/app-registry \
     SITE_URL=https://sirui-lu.com/app-registry
   supabase functions deploy registry --project-ref <project-ref> --no-verify-jwt
   ```

   `--no-verify-jwt` is required: callers send a GitHub token, not a Supabase key, and GitHub's sign-in redirect carries no header. `supabase/config.toml` sets the same.
4. **Registry repository variables and secrets** (Settings → Secrets and variables → Actions → Variables):
   - `REGISTRY_BOT_LOGIN`: the App's bot login, `<app-slug>[bot]`
   - `SITE_URL`: same as above, for links in bot comments
   - secret `COPILOT_PAT`: a token from an account with Copilot, for the AI review (optional; without it every valid submission waits for an editor)
5. **Site build**: set `PUBLIC_SUBMIT_API` to the base URL above and `PUBLIC_GITHUB_APP_CLIENT_ID` to the App's client ID.
