# Submit endpoint

A stateless Supabase Edge Function named `registry`, and the only way into the registry. It uses no Supabase database, auth, or storage, and stores nothing.

Base URL: `https://<project-ref>.supabase.co/functions/v1/registry`

- `GET /auth/callback`: GitHub redirects here after "Sign in with GitHub" on the site's `/submit/` page. It swaps the code for a user token and returns it to the page in the URL fragment.
- `POST /submit`: body `{"release_url": "...", "accept_terms": true, "authors_permission": false}` with `Authorization: Bearer <GitHub token>`. The token is used only to read the submitter's login and whether they can push to the paper repository (`permissions.push`); any OAuth token works, including `gh auth token`. Without write access the submitter must send `"authors_permission": true`. The issue is opened by the registry's GitHub App, so the review workflow can trust what it records.

Two GitHub registrations, each with one job:

- an **OAuth App** for sign-in. It requests no scopes. Unlike GitHub App user tokens, OAuth tokens report the user's real push access to public repositories, which is how Palomar checks it too.
- a **GitHub App** that opens submission issues, installed on the registry repository only.

Code: `supabase/functions/_shared/handler.ts` (routes), `supabase/functions/_shared/submission.ts` (pure helpers, also used by the website), `supabase/functions/registry/index.ts` (entry point).

```bash
npm install
npm test        # unit tests plus the handler with GitHub faked, under Node
```

## Setup

1. **OAuth App** (Settings → Developer settings → OAuth Apps → New OAuth App):
   - Homepage URL: the site's URL
   - Authorization callback URL: `https://<project-ref>.supabase.co/functions/v1/registry/auth/callback`
   - Device Flow: off. Generate a client secret.
2. **GitHub App** (Settings → Developer settings → GitHub Apps → New):
   - Webhook: off. No callback URL is needed.
   - Repository permissions: Issues read and write. Nothing else.
   - Where it can be installed: only on this account. Install it on the registry repository only. Generate a private key.
3. **Supabase project**: any project works; only Edge Functions are used. From this directory:

   ```bash
   supabase login
   supabase secrets set --project-ref <project-ref> \
     GITHUB_APP_ID=<app id> \
     OAUTH_CLIENT_ID=<OAuth App client id> \
     OAUTH_CLIENT_SECRET=<OAuth App client secret> \
     GITHUB_APP_PRIVATE_KEY="$(cat path/to/private-key.pem)" \
     REGISTRY_REPO=LionSR/app-registry \
     SITE_URL=https://sirui-lu.com/app-registry
   supabase functions deploy registry --project-ref <project-ref> --no-verify-jwt
   ```

   `--no-verify-jwt` is required: callers send a GitHub token, not a Supabase key, and GitHub's sign-in redirect carries no header. `supabase/config.toml` sets the same.
4. **Registry repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `REGISTRY_BOT_LOGIN`: the App's bot login, `<app-slug>[bot]`
   - `SITE_URL`: same as above, for links in bot comments
5. **Site build**: set `PUBLIC_SUBMIT_API` to the base URL above and `PUBLIC_OAUTH_CLIENT_ID` to the OAuth App's client ID.
