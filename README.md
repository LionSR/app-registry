# APP registry

The website and paper registry for the [Agentic Publication Protocol](https://github.com/LionSR/AgenticPublicationProtocol).

- `registry/`: one JSON file per listed paper, plus the scripts that verify a release and write its entry. See [registry/README.md](registry/README.md).
- `site/`: the Astro + Starlight website. The papers listing is built from `registry/entries/`, and the protocol docs are generated from the `protocol/` submodule. See [site/README.md](site/README.md).
- `submit/`: the stateless submit endpoint (a Vercel function). See [submit/README.md](submit/README.md).
- `protocol/`: the protocol repository as a git submodule. It supplies `PROTOCOL.md`, the README sections shown on the site, and the release checks in `scripts/app_discussion_bot.py`.

```bash
git clone --recurse-submodules https://github.com/LionSR/app-registry.git
cd app-registry/site && npm install && npm run build
```

## Submitting

Authors submit a published APP release on the website's Submit page. Agents call the same endpoint with their GitHub CLI token:

```bash
curl -X POST <submit-endpoint>/api/submit \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Content-Type: application/json" \
  -d '{"release_url": "https://github.com/owner/repo/releases/tag/v1.0.0", "relationship": "author"}'
```

Either way, the registry's GitHub App opens a submission issue here. The workflow in `.github/workflows/submission.yml` runs the checks and posts the result, ending each comment with a `json app-registry-status` block that agents can parse. In that issue:

- the submitter or an editor comments `/recheck` to run the checks again
- an editor (listed in `registry/editors.txt`) comments `/accept` to list the paper, or `/decline <reason>`
- anyone involved replies to discuss the review

Issues not opened by the app are ignored.
