# APP registry

One JSON file per listed paper in `entries/<ID>.json`. There is no database; git history is the audit log.

## IDs

`APP-YYMMDD-NNNN`: the date the paper was first listed (UTC) and that day's sequence number from `0000`. A later release of the same repo is added to the entry's `versions`; version 2 is cited as `APP-YYMMDD-NNNNv2`.

## Where each field comes from

Everything is read from the paper repo at the verified tag and copied without rewording. Fields the repo does not provide are left out.

| Field | Source |
|---|---|
| `id`, `versions[].v`, `versions[].listed_at` | assigned by the registry |
| `repo_url`, `versions[].tag`, `commit`, `app_publication_id`, `release_url` | the release's `APP_PUBLICATION.json`, checked against the real tag |
| `title`, `authors`, `domain`, `arxiv_id`, `tags` | `AGENTS.md` frontmatter at the tag |
| `paper_summary` | the `## Paper Summary` section of `AGENTS.md` at the tag |

Top-level metadata reflects the newest listed version.

## Scripts

Verification reuses `verify()` from `protocol/scripts/app_discussion_bot.py`.

```bash
python registry/scripts/registry.py check <release-url>          # run the checks only
python registry/scripts/registry.py add <release-url> [--dry-run]  # check and write the entry
python registry/scripts/test_submission.py                         # review-bot tests against real releases
```

`submission.py` is the review bot that `.github/workflows/submission.yml` runs on submission issues. Its slash commands (`/recheck`, `/accept`, `/decline`) and who may use them are declared in its `COMMANDS` table; editors are listed in `editors.txt`.

The first entries were imported from the list in Discussion #36 of the protocol repository, dated by when each release first appeared there (see the commit history for the import script).

A GitHub token (from `GITHUB_TOKEN`, `GH_TOKEN` or `gh auth token`) avoids API rate limits.
