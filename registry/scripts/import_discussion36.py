#!/usr/bin/env python3
"""One-off seed: import the papers listed in Discussion #36 into registry/entries.

Each release is re-verified with the same checks as a new submission. Its
listing date is the first time its release URL appeared in the discussion body,
taken from the discussion's edit history. Releases are added oldest first, in
list order within a day, so IDs follow the original listing order.

    python registry/scripts/import_discussion36.py [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys

from registry import add, check_release, github_token

QUERY = """
query {
  repository(owner: "LionSR", name: "AgenticPublicationProtocol") {
    discussion(number: 36) {
      body
      userContentEdits(first: 100) { nodes { editedAt diff } }
    }
  }
}
"""
RELEASE_RE = re.compile(r"github\.com/([^/\s)]+/[^/\s)]+)/releases/tag/([^\s)]+)")


def listed_releases() -> list[tuple[str, dt.date]]:
    out = subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={QUERY}"],
        capture_output=True, text=True, check=True,
    ).stdout
    disc = json.loads(out)["data"]["repository"]["discussion"]
    first_seen: dict[str, str] = {}
    for edit in sorted(disc["userContentEdits"]["nodes"], key=lambda n: n["editedAt"]):
        for m in RELEASE_RE.finditer(edit.get("diff") or ""):
            first_seen.setdefault(f"{m.group(1)}@{m.group(2)}", edit["editedAt"])
    # Keep only releases still in the current body, in list order.
    current = [f"{m.group(1)}@{m.group(2)}" for m in RELEASE_RE.finditer(disc["body"])]
    ordered = sorted(current, key=lambda r: first_seen[r])  # stable: list order within ties
    return [(r, dt.date.fromisoformat(first_seen[r][:10])) for r in ordered]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    token = github_token()
    failed = 0
    for release, date in listed_releases():
        verified = check_release(release, token)
        if not verified["ok"]:
            failed += 1
            print(f"FAIL {release}: {'; '.join(verified['errors'])}", file=sys.stderr)
            continue
        entry, what = add(verified, date, dry_run=args.dry_run)
        print(f"{what:9} {entry['id']}  {release}  (listed {date})")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
