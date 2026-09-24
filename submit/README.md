# Submit endpoint

A stateless Supabase Edge Function named `registry`, and the only way into the registry. It uses no Supabase database, auth, or storage, and stores nothing.

Base URL: `https://<project-ref>.supabase.co/functions/v1/registry`

- `GET /auth/callback`: GitHub redirects here after "Sign in with GitHub" on the site's `/submit/` page. It swaps the code for a user token and returns it to the page in the URL fragment.
- `POST /submit`: body `{"release_url": "...", "relationship": "author" | "coauthor" | "on-behalf"}` with `Authorization: Bearer <GitHub token>`. The token only identifies the submitter (`GET /user`); any GitHub token works, including `gh auth token`. The issue is opened by the registry's GitHub App, so the review workflow can trust it.

Code: `supabase/functions/_shared/handler.ts` (routes), `supabase/functions/_shared/submission.ts` (pure helpers, also used by the website), `supabase/functions/registry/index.ts` (entry point).

```bash
npm install
npm test        # unit tests plus the handler with GitHub faked, under Node
```

## Setup

1. **GitHub App** (Settings → Developer settings → GitHub Apps → New):
   - Callback URL: `https://<project-ref>.supabase.co/functions/v1/registry/auth/callback`
   - Webhook: off
   - Repository permissions: Issues read and write. Nothing else.
   - Where can it be installed: **Any account** (a public App). Authors sign in through it, and GitHub answers 404 to anyone but the owner for a private App. Its permissions still apply only where it is installed.
   - Install it on the registry repository only.
2. **Supabase project**: any project works; only Edge Functions are used. From this directory:

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
3. **Registry repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `REGISTRY_BOT_LOGIN`: the App's bot login, `<app-slug>[bot]`
   - `SITE_URL`: same as above, for links in bot comments
4. **Site build**: set `PUBLIC_SUBMIT_API` to the base URL above and `PUBLIC_GITHUB_APP_CLIENT_ID` to the client ID.
