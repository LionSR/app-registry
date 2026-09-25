#!/usr/bin/env python3
"""Handle one GitHub event on a registry submission issue.

Submission issues are opened by the registry's GitHub App (the submit endpoint),
never by hand. The body carries a marker and a JSON block with the release URL,
the submitter's verified GitHub login, and their relationship to the work.

Events handled:
  issues/opened             run the checks and post the result
  issue_comment  /recheck   the submitter or an editor re-runs the checks
  issue_comment  /accept    an editor lists the paper (writes the entry)
  issue_comment  /decline   an editor declines, with a reason

This script only decides. It prints a JSON plan (comment, labels, close, entry
file) that the workflow applies with `gh` and `git`, so the logic can be tested
offline with a saved event payload:

    python registry/scripts/submission.py --event event.json --event-name issues
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from registry import ENTRIES, ROOT, add, check_release, github_token, load_entries

MARKER = "<!-- app-registry-submission -->"
DATA_RE = re.compile(r"```json app-registry-submission\n(.*?)\n```", re.S)
STATE_LABELS = ["checks-failed", "awaiting-editor", "already-listed", "accepted", "declined"]
EDITORS_FILE = ROOT / "registry" / "editors.txt"


def editors() -> set[str]:
    lines = EDITORS_FILE.read_text().splitlines() if EDITORS_FILE.exists() else []
    return {ln.strip().lower() for ln in lines if ln.strip() and not ln.startswith("#")}


def parse_submission(body: str) -> dict[str, Any] | None:
    if MARKER not in (body or ""):
        return None
    m = DATA_RE.search(body)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) and data.get("release_url") and data.get("submitter") else None


def status_block(state: str, checks: list[dict[str, Any]], entry_id: str | None = None) -> str:
    """Machine-readable summary at the end of every bot comment, for agents."""
    data: dict[str, Any] = {"state": state, "checks": checks}
    if entry_id:
        data["id"] = entry_id
    return "```json app-registry-status\n" + json.dumps(data, indent=2) + "\n```"


def submitter_check(sub: dict[str, Any], verified: dict[str, Any]) -> dict[str, Any]:
    """On what basis the submitter may submit. Write access was checked by the submit endpoint."""
    who = f"@{sub['submitter']}"
    repo = verified["owner_repo"]
    handles = {(a.get("github") or "").lower() for a in verified.get("authors") or []} - {""}
    if sub.get("write_access"):
        return {"name": "submitter", "ok": True, "detail": f"{who} has write access to {repo}."}
    if sub["submitter"].lower() in handles:
        return {"name": "submitter", "ok": True, "detail": f"{who} is listed as an author in AGENTS.md."}
    return {
        "name": "submitter",
        "ok": False,
        "detail": f"{who} does not have write access to {repo} and says they have the authors' permission. An editor will confirm.",
    }


def run_checks(sub: dict[str, Any], token: str | None) -> dict[str, Any]:
    """Protocol checks, submitter identity, and duplicate listing."""
    verified = check_release(sub["release_url"], token)
    checks: list[dict[str, Any]] = [
        {
            "name": "verified-release",
            "ok": verified["ok"],
            "detail": "The release is a verified APP publication."
            if verified["ok"]
            else "; ".join(verified.get("errors") or ["verification failed"]),
        }
    ]
    listed_as = None
    if verified["ok"]:
        checks.append(submitter_check(sub, verified))
        repo_url = f"https://github.com/{verified['owner_repo']}".lower()
        for e in load_entries():
            if e["repo_url"].lower() == repo_url and any(v["tag"] == verified["tag"] for v in e["versions"]):
                listed_as = e["id"]
        checks.append(
            {
                "name": "not-listed",
                "ok": listed_as is None,
                "detail": "This release is not listed yet." if listed_as is None else f"This release is already listed as {listed_as}.",
            }
        )
    if listed_as:
        # Nothing for an editor to confirm when the release is already listed.
        for c in checks:
            if c["name"] == "submitter" and not c["ok"]:
                c["detail"] = f"@{sub['submitter']} does not have write access to {verified['owner_repo']}."
    if not verified["ok"]:
        state = "checks-failed"
    elif listed_as:
        state = "already-listed"
    else:
        state = "awaiting-editor"
    return {"state": state, "checks": checks, "verified": verified, "listed_as": listed_as}


def checklist(checks: list[dict[str, Any]]) -> str:
    lines = []
    for c in checks:
        if c["ok"]:
            mark = "✅"
        elif c["name"] == "submitter":
            mark = "⚠️"  # an editor confirms; not a failure
        elif c["name"] == "not-listed":
            mark = "ℹ️"
        else:
            mark = "❌"
        lines.append(f"- {mark} {c['detail']}")
    return "\n".join(lines)


def plan_for_checks(sub: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    state = result["state"]
    who = f"@{sub['submitter']}"
    next_step = {
        "checks-failed": f"{who}, fix the release and comment `/recheck` to run the checks again. "
        "The protocol explains each requirement: https://github.com/LionSR/AgenticPublicationProtocol/blob/main/PROTOCOL.md",
        "awaiting-editor": "All checks passed. An editor will review the submission and comment `/accept` to list it.",
        "already-listed": f"Nothing to do: this release is already listed as {result['listed_as']}.",
    }[state]
    comment = f"### Submission checks\n\n{checklist(result['checks'])}\n\n{next_step}\n\n{status_block(state, result['checks'])}"
    plan = {"act": True, "comment": comment, "state": state}
    if state == "already-listed":
        plan["close"] = "completed"
    return plan


def site_link(entry_id: str) -> str:
    base = os.environ.get("SITE_URL", "").rstrip("/")
    return f"{base}/papers/{entry_id}/" if base else f"registry/entries/{entry_id}.json"


@dataclass
class Command:
    """A slash command in a submission issue."""

    run: Callable[[dict[str, Any], str, str, dict[str, Any]], dict[str, Any]]  # (submission, actor, argument, context)
    allowed: frozenset[str]  # "submitter" and/or "editor"
    denied: str  # shown to anyone else
    needs_argument: str = ""  # usage hint when the argument is required


def recheck(sub: dict[str, Any], actor: str, arg: str, ctx: dict[str, Any]) -> dict[str, Any]:
    return plan_for_checks(sub, run_checks(sub, ctx["token"]))


def decline(sub: dict[str, Any], actor: str, reason: str, ctx: dict[str, Any]) -> dict[str, Any]:
    return {
        "act": True,
        "state": "declined",
        "close": "not planned",
        "comment": f"### Declined\n\n@{sub['submitter']}, an editor declined this submission:\n\n> {reason}\n\n"
        "Reply here if you want to respond. An editor can reopen the submission.\n\n"
        + status_block("declined", [{"name": "editor-decision", "ok": False, "detail": reason}]),
    }


def accept(sub: dict[str, Any], actor: str, arg: str, ctx: dict[str, Any]) -> dict[str, Any]:
    result = run_checks(sub, ctx["token"])
    if result["state"] != "awaiting-editor":
        return plan_for_checks(sub, result)
    entry, what = add(result["verified"], ctx["today"])
    v = entry["versions"][-1]
    cite_id = entry["id"] if v["v"] == 1 else f"{entry['id']}v{v['v']}"
    title = f"Add {entry['id']}: {entry['title']}" if what == "new" else f"Add {v['tag']} to {entry['id']}: {entry['title']}"
    return {
        "act": True,
        "state": "accepted",
        "close": "completed",
        "entry_path": str((ENTRIES / f"{entry['id']}.json").relative_to(ROOT)),
        "commit_message": f"{title}\n\nAccepted by @{actor} in #{ctx['issue_number']}.",
        "comment": f"### Listed as {cite_id}\n\n@{sub['submitter']}, your paper is now in the registry: {site_link(entry['id'])}\n\n"
        + status_block("accepted", result["checks"], entry["id"]),
    }


COMMANDS: dict[str, Command] = {
    "/recheck": Command(recheck, frozenset({"submitter", "editor"}), "only the submitter or an editor can run `/recheck`."),
    "/accept": Command(accept, frozenset({"editor"}), "only registry editors can use `/accept`."),
    "/decline": Command(decline, frozenset({"editor"}), "only registry editors can use `/decline`.", needs_argument="add a reason: `/decline <reason>`."),
}


def ignore(reason: str) -> dict[str, Any]:
    return {"act": False, "reason": reason}


def decide(event_name: str, event: dict[str, Any], bot_login: str, token: str | None, today: dt.date) -> dict[str, Any]:
    issue = event.get("issue") or {}
    if issue.get("pull_request"):
        return ignore("pull request")
    if (issue.get("user") or {}).get("login", "").lower() != bot_login.lower():
        return ignore("issue was not opened by the registry app")
    sub = parse_submission(issue.get("body") or "")
    if not sub:
        return ignore("no submission data in issue body")

    if (event_name, event.get("action")) == ("issues", "opened"):
        return plan_for_checks(sub, run_checks(sub, token))
    if (event_name, event.get("action")) != ("issue_comment", "created"):
        return ignore(f"{event_name}/{event.get('action')} ignored")

    comment = event.get("comment") or {}
    actor = (comment.get("user") or {}).get("login", "")
    if actor.lower() == bot_login.lower():
        return ignore("own comment")
    word, _, arg = (comment.get("body") or "").strip().partition(" ")
    command = COMMANDS.get(word.lower())
    if not command:
        return ignore("not a command")

    roles = {"editor"} if actor.lower() in editors() else set()
    if actor.lower() == sub["submitter"].lower():
        roles.add("submitter")
    if not roles & command.allowed:
        return {"act": True, "comment": f"@{actor}, {command.denied}"}
    if command.needs_argument and not arg.strip():
        return {"act": True, "comment": f"@{actor}, {command.needs_argument}"}
    return command.run(sub, actor, arg.strip(), {"token": token, "today": today, "issue_number": issue.get("number")})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--event", required=True, help="path to the GitHub event payload (GITHUB_EVENT_PATH)")
    ap.add_argument("--event-name", required=True, help="GITHUB_EVENT_NAME")
    ap.add_argument("--bot-login", default=os.environ.get("REGISTRY_BOT_LOGIN", ""), help="login of the registry app bot")
    ap.add_argument("--today", type=dt.date.fromisoformat, default=None)
    args = ap.parse_args()
    if not args.bot_login:
        print("REGISTRY_BOT_LOGIN is not set", file=sys.stderr)
        return 2
    event = json.loads(Path(args.event).read_text())
    today = args.today or dt.datetime.now(dt.timezone.utc).date()
    plan = decide(args.event_name, event, args.bot_login, github_token(), today)
    if plan.get("act") and plan.get("state"):
        plan["labels_add"] = ["submission", plan["state"]]
        plan["labels_remove"] = [l for l in STATE_LABELS if l != plan["state"]]
    json.dump(plan, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
