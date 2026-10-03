# Submission endpoint

The `registry` Supabase Edge Function provides the submission endpoint for the registry. The service is stateless. The function does not use Supabase database, authentication, or storage services.

Base URL: `https://<project-ref>.supabase.co/functions/v1/registry`

Endpoints:
- `GET /auth/callback`: GitHub redirects to this route after user authentication on `/submit/`. The route exchanges the code for a user token and returns the token in the URL fragment.
- `POST /submit`: Accepts payload `{"release_url": "...", "accept_terms": true, "authors_permission": false}` with header `Authorization: Bearer <token>`. The token must originate from the registry GitHub App through web sign-in or device flow. The endpoint validates the token against the GitHub API and rejects unauthorized tokens. The endpoint verifies user write permissions (`permissions.push`). If the submitter lacks write permission, the payload must set `"authors_permission": true`. The GitHub App creates the submission issue.

A single GitHub App performs two functions:
1. Authenticates users. The user token reads only user identity and public repository write permissions.
2. Creates submission issues in the registry repository.

Source files: `supabase/functions/_shared/handler.ts` (routes), `supabase/functions/_shared/submission.ts` (validation helpers), `supabase/functions/registry/index.ts` (entry point).

```bash
npm install
npm test        # Unit tests and mocked GitHub API tests under Node
```

## Setup

1. **GitHub App** (Settings → Developer settings → GitHub Apps → New):
   - Callback URL: `https://<project-ref>.supabase.co/functions/v1/registry/auth/callback`. Enable Device Flow.
   - Webhook: Disabled.
   - Repository permissions: Issues (read and write). No other permissions.
   - Installation scope: Any account (public App). Install the App on the registry repository only.
   - Generate a client secret and a private key.
2. The GitHub App installation creates submission issues. User authentication does not require installation on author repositories.
3. **Supabase project**: Configure any Supabase project with Edge Functions enabled. From this directory:

   ```bash
   supabase login
   supabase secrets set --project-ref <project-ref> \
     GITHUB_APP_ID=<app id> \
     GITHUB_APP_CLIENT_ID=<client id> \
     GITHUB_APP_CLIENT_SECRET=<client secret> \
     GITHUB_APP_PRIVATE_KEY="$(cat path/to/private-key.pem)" \
     REGISTRY_REPO=LionSR/app-registry \
     SITE_URL=https://agenticpapers.app
   supabase functions deploy registry --project-ref <project-ref> --no-verify-jwt
   ```

   `--no-verify-jwt` is required because requests provide GitHub tokens instead of Supabase API keys.
4. **Registry repository variables and secrets** (Settings → Secrets and variables → Actions → Variables):
   - `REGISTRY_BOT_LOGIN`: GitHub App bot username (`<app-slug>[bot]`).
   - `SITE_URL`: Registry URL for links in bot comments.
   - Secret `COPILOT_PAT`: Optional personal access token for automated AI review.
5. **Website configuration**: Set `PUBLIC_SUBMIT_API` to the base URL above. Set `PUBLIC_GITHUB_APP_CLIENT_ID` to the GitHub App client ID.
