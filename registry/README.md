# APP registry entries

The registry stores one JSON file for each listed paper in `entries/<YYMM>/<ID>.json` (for example, `entries/2609/APP-260923-0000.json`). The repository uses Git commit history as the audit log. There is no external database.

## Identifiers and versions

Identifier format: `APP-YYMMDD-NNNN`. The identifier includes the UTC listing date and a daily sequence number starting at `0000`.

Subsequent releases of the same repository are added to the `versions` array in the existing entry. The base identifier references the latest version. Suffixes (such as `v1` or `v2`) reference specific versions. Retired identifiers are recorded in `retired-ids.txt` and are not reused.

## Field sources

Each version record contains metadata extracted directly from the release tag. Fields not provided by the repository are omitted.

| Field | Source |
|---|---|
| `id`, `versions[].v`, `versions[].listed_at` | Assigned by the registry |
| `repo_url`, `versions[].tag`, `commit`, `app_publication_id`, `release_url` | Extracted from `APP_PUBLICATION.json` and verified against the Git tag |
| `versions[].title`, `authors`, `domain`, `arxiv_id`, `tags` | Extracted from `AGENTS.md` frontmatter at that tag |
| `versions[].paper_summary` | Extracted from `## Paper Summary` in `AGENTS.md` at that tag |

## Scripts

Release verification uses `verify()` from `protocol/scripts/app_discussion_bot.py`.

```bash
python registry/scripts/registry.py check <release-url>          # Run verification checks only
python registry/scripts/registry.py add <release-url> [--dry-run]  # Verify release and write entry
python registry/scripts/test_submission.py                         # Test review bot with test releases
```

The workflow in `.github/workflows/submission.yml` executes `submission.py` on submission issues. The `COMMANDS` dictionary defines available slash commands (`/recheck`, `/accept`, `/decline`) and access permissions. The `editors.txt` file lists authorized editors.

Initial entries were imported from Discussion #36 in the protocol repository. Dates match initial release dates in that discussion.

Set a GitHub token (`GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`) to prevent API rate limits.
