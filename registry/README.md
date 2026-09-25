# APP registry

One JSON file per listed paper, grouped by month like arXiv: `entries/<YYMM>/<ID>.json`, for example `entries/2609/APP-260923-0000.json`. There is no database; git history is the audit log.

## IDs and versions

`APP-YYMMDD-NNNN`: the date the paper was first listed (UTC) and that day's sequence number from `0000`. A later release of the same repository is added to the entry's `versions`. As on arXiv, the bare ID means the latest version, and `APP-YYMMDD-NNNNv1`, `…v2` cite a specific one. IDs of removed listings are kept in `retired-ids.txt` and never given out again.

## Where each field comes from

Each version holds the paper's metadata as released at its own tag, copied without rewording. Fields the repository does not provide are left out.

| Field | Source |
|---|---|
| `id`, `versions[].v`, `versions[].listed_at` | assigned by the registry |
| `repo_url`, `versions[].tag`, `commit`, `app_publication_id`, `release_url` | the release's `APP_PUBLICATION.json`, checked against the real tag |
| `versions[].title`, `authors`, `domain`, `arxiv_id`, `tags` | `AGENTS.md` frontmatter at that tag |
| `versions[].paper_summary` | the `## Paper Summary` section of `AGENTS.md` at that tag |

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
