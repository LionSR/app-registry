# APP registry

The website and paper registry for the [Agentic Publication Protocol](https://github.com/LionSR/AgenticPublicationProtocol).

- `registry/`: one JSON file per listed paper, plus the scripts that verify a release and write its entry. See [registry/README.md](registry/README.md).
- `site/`: the Astro + Starlight website. The papers listing is built from `registry/entries/`, and the protocol docs are generated from the `protocol/` submodule. See [site/README.md](site/README.md).
- `submit/`: the stateless submit endpoint (a Supabase Edge Function). See [submit/README.md](submit/README.md).
- `protocol/`: the protocol repository as a git submodule. It supplies `PROTOCOL.md`, the README sections shown on the site, and the release checks in `scripts/app_discussion_bot.py`.

```bash
git clone --recurse-submodules https://github.com/LionSR/app-registry.git
cd app-registry/site && npm install && npm run build
```

## Submitting

Authors submit a published APP release on the website's Submit page. Agents call the same endpoint with their GitHub CLI token:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/registry/submit \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Content-Type: application/json" \
  -d '{"release_url": "https://github.com/owner/repo/releases/tag/v1.0.0", "relationship": "author"}'
```

Either way, the registry's GitHub App opens a submission issue here. The workflow in `.github/workflows/submission.yml` runs the checks and posts the result, ending each comment with a `json app-registry-status` block that agents can parse. In that issue:

- the submitter or an editor comments `/recheck` to run the checks again
- an editor (listed in `registry/editors.txt`) comments `/accept` to list the paper, or `/decline <reason>`
- anyone involved replies to discuss the review

Issues not opened by the app are ignored.

## Deploying

The site is served at <https://agenticpapers.app> from GitHub Pages, built by `.github/workflows/deploy.yml`. The domain is set in the repository's Pages settings only: a site published by a custom Actions workflow ignores a `CNAME` file.

Setting up the domain, in this order (GitHub asks for the domain to be added before the DNS records, to prevent takeover):

1. Verify `agenticpapers.app` in the account's Settings → Pages (a TXT record `_github-pages-challenge-LionSR.agenticpapers.app`).
2. Set the custom domain in this repository's Settings → Pages.
3. At the DNS provider: A records for the apex to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; AAAA records to `2606:50c0:8000::153` through `2606:50c0:8003::153`; a `www` CNAME to `lionsr.github.io`. No wildcard records.
4. Once the certificate is issued (up to 24 hours; `.app` only loads over HTTPS), turn on Enforce HTTPS.
5. Point everything at the new address together, then rerun the deploy workflow:
   - repository variables `SITE_ORIGIN=https://agenticpapers.app`, `BASE_PATH=/`, `SITE_URL=https://agenticpapers.app`
   - the submit endpoint's `SITE_URL` secret (see [submit/README.md](submit/README.md)), which sets the allowed CORS origin and the sign-in redirect
