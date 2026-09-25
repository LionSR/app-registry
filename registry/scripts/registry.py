#!/usr/bin/env python3
"""APP registry: turn a verified release into a registry entry.

Verification and metadata extraction reuse the protocol repo's discussion bot
(`verify`, `resolve_commit_tree`, `parse_ref`), so the registry and the bot can
never disagree about what counts as a verified APP publication.

Entry files live in registry/entries/<ID>.json, one per paper. A new release of
an already-listed repo is appended to that entry's `versions`.

    python registry/scripts/registry.py add <release-url> [--date YYYY-MM-DD] [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ENTRIES = ROOT / "registry" / "entries"
# IDs of removed listings. They are never given out again (see the terms of use).
RETIRED = ROOT / "registry" / "retired-ids.txt"
sys.path.insert(0, str(ROOT / "protocol" / "scripts"))

from app_discussion_bot import parse_ref, resolve_commit_tree, verify  # noqa: E402

ID_RE = re.compile(r"^APP-(\d{6})-(\d{4})$")


def github_token() -> str | None:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token
    try:
        return subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, check=True
        ).stdout.strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def _drop_empty(d: dict[str, Any]) -> dict[str, Any]:
    """Fields the paper repo does not provide are left out, not blanked."""
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}


def readable_error(err: str, owner_repo: str, tag: str) -> str:
    """Turn raw GitHub API failures from verify() into instructions."""
    if err.startswith("HTTP 404"):
        if "/releases/tags/" in err:
            return f"No GitHub release found for tag `{tag}` in {owner_repo}. Check that the repository is public and that a release exists for this tag."
        if "/git/ref/tags/" in err:
            return f"Tag `{tag}` does not exist in {owner_repo}."
        return f"{owner_repo} was not found. The repository must be public."
    if err.startswith("No APP_PUBLICATION.json"):
        return f"The release {tag} has no `APP_PUBLICATION.json` asset. Attach the manifest the release-outcome skill produced."
    return err


def check_release(release: str, token: str | None) -> dict[str, Any]:
    """Run the protocol checks. Returns {ok, errors, ...verify() fields, commit}."""
    ref = parse_ref(release)
    if not ref:
        return {"ok": False, "errors": [f"not a GitHub repo or release URL: {release}"]}
    owner_repo, tag = ref
    result = verify(owner_repo, tag, token)
    result["errors"] = [readable_error(e, owner_repo, tag) for e in result.get("errors") or []]
    if result["ok"]:
        result["commit"], _ = resolve_commit_tree(owner_repo, result["tag"], token)
    return result


def snapshot(verified: dict[str, Any]) -> dict[str, Any]:
    """Paper metadata copied verbatim from AGENTS.md at the verified tag."""
    return _drop_empty(
        {
            "title": verified.get("title"),
            "authors": [_drop_empty(a) for a in verified.get("authors") or []],
            "domain": verified.get("field"),
            "arxiv_id": verified.get("arxiv_id"),
            "tags": verified.get("tags"),
            "paper_summary": verified.get("summary"),
        }
    )


def load_entries() -> list[dict[str, Any]]:
    return [json.loads(p.read_text()) for p in sorted(ENTRIES.glob("APP-*.json"))]


def next_id(date: dt.date) -> str:
    """The day's next free number, counting listed and retired IDs alike."""
    stamp = date.strftime("%y%m%d")
    retired = RETIRED.read_text().split() if RETIRED.exists() else []
    ids = [p.stem for p in ENTRIES.glob(f"APP-{stamp}-*.json")] + [i for i in retired if i.startswith(f"APP-{stamp}-")]
    taken = [int(m.group(2)) for i in ids if (m := ID_RE.match(i))]
    return f"APP-{stamp}-{(max(taken) + 1 if taken else 0):04d}"


def add(verified: dict[str, Any], date: dt.date, dry_run: bool = False) -> tuple[dict[str, Any], str]:
    """Create a new entry, or append a version to the repo's existing one.

    Returns (entry, what_happened) where what_happened is "new", "version" or "duplicate".
    """
    repo_url = f"https://github.com/{verified['owner_repo']}"
    version = {
        "v": 1,
        "tag": verified["tag"],
        "commit": verified["commit"],
        "app_publication_id": verified["app_publication_id"],
        "release_url": verified["release_url"],
        "listed_at": date.isoformat(),
    }
    existing = next(
        (e for e in load_entries() if e["repo_url"].lower() == repo_url.lower()), None
    )
    if existing:
        if any(v["tag"] == version["tag"] for v in existing["versions"]):
            return existing, "duplicate"
        version["v"] = len(existing["versions"]) + 1
        # Top-level metadata always reflects the newest listed version.
        entry = {
            "id": existing["id"],
            "repo_url": existing["repo_url"],
            **snapshot(verified),
            "versions": existing["versions"] + [version],
        }
        what = "version"
    else:
        entry = {
            "id": next_id(date),
            "repo_url": repo_url,
            **snapshot(verified),
            "versions": [version],
        }
        what = "new"
    if not dry_run:
        ENTRIES.mkdir(parents=True, exist_ok=True)
        path = ENTRIES / f"{entry['id']}.json"
        path.write_text(json.dumps(entry, indent=2, ensure_ascii=False) + "\n")
    return entry, what


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_add = sub.add_parser("add", help="verify a release and add it to the registry")
    p_add.add_argument("release", help="release URL, repo URL, or owner/repo@tag")
    p_add.add_argument("--date", type=dt.date.fromisoformat, default=None, help="listing date (default: today, UTC)")
    p_add.add_argument("--dry-run", action="store_true", help="verify and print the entry without writing it")
    p_check = sub.add_parser("check", help="verify a release only")
    p_check.add_argument("release")
    args = ap.parse_args()

    token = github_token()
    verified = check_release(args.release, token)
    if not verified["ok"]:
        print(json.dumps({"ok": False, "errors": verified["errors"]}, indent=2), file=sys.stderr)
        return 1
    if args.cmd == "check":
        print(json.dumps({"ok": True, "owner_repo": verified["owner_repo"], "tag": verified["tag"]}, indent=2))
        return 0
    date = args.date or dt.datetime.now(dt.timezone.utc).date()
    entry, what = add(verified, date, dry_run=args.dry_run)
    print(json.dumps({"result": what, "entry": entry}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
