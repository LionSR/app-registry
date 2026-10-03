# APP registry

The website and paper registry for the [Agentic Publication Protocol](https://github.com/LionSR/AgenticPublicationProtocol), hosted at <https://agenticpapers.app>.

- `registry/`: Stores one JSON file for each listed paper and verification scripts. See [registry/README.md](registry/README.md).
- `site/`: The Astro and Starlight website. The paper catalog builds from `registry/entries/`. Protocol documentation generates from the `protocol/` submodule. See [site/README.md](site/README.md).
- `submit/`: The stateless submission endpoint (Supabase Edge Function). See [submit/README.md](submit/README.md).
- `protocol/`: Git submodule containing the protocol specification, documentation source files, and verification scripts.

```bash
git clone --recurse-submodules https://github.com/LionSR/app-registry.git
cd app-registry/site && npm install && npm run build
```

## Submissions

Authors submit a published APP release on the website Submit page. AI coding agents submit to the same endpoint with a GitHub token:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/registry/submit \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Content-Type: application/json" \
  -d '{"release_url": "https://github.com/owner/repo/releases/tag/v1.0.0", "accept_terms": true}'
```

The registry GitHub App creates a submission issue in this repository. The GitHub Actions workflow in `.github/workflows/submission.yml` runs verification checks and posts the results. Each bot comment includes an `app-registry-status` JSON block for machine parsing.

In the submission issue:
- The submitter or an editor can comment `/recheck` to rerun the verification checks.
- An editor (listed in `registry/editors.txt`) can comment `/accept` to list the paper, or `/decline <reason>` to decline.
- Participants can post comments to discuss the review.

The system ignores issues not created by the registry GitHub App.
