#!/usr/bin/env python3
"""Handle one GitHub event on a registry submission issue.

Submission issues are opened by the registry's GitHub App (the submit endpoint),
never by hand. The body carries a marker and a JSON block with the release URL,
the submitter's verified GitHub login, and whether they can write to the paper's
repository (checked by the endpoint).

Events handled:
  issues/opened             run the checks and post the result
  issue_comment  /recheck   the submitter or an editor re-runs the checks
  issue_comment  /accept    an editor lists the paper (writes the entry)
  issue_comment  /decline   an editor declines, with a reason

A submission is listed without an editor when every check passes and an AI
review by GitHub Copilot raises no flag. That takes two steps: the first run
writes the review prompt and a plan marked "review"; the workflow runs Copilot
(actions/ai-inference); the second run (--finalize) reads the reply and lists
the paper or hands it to an editor. Set AUTO_LIST=false to always ask an editor.

This script only decides. It prints a JSON plan (comment, labels, close, entry
file) that the workflow applies with `gh` and `git`, so the logic can be tested
offline with a saved event payload:

    python registry/scripts/submission.py --event event.json --event-name issues
    python registry/scripts/submission.py --finalize plan.json --review reply.txt
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
from review import compliance, fetch, read_review, review_prompt

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
    agents_md = ""
    if verified["ok"]:
        checks.append(submitter_check(sub, verified))
        agents_md = fetch(verified["owner_repo"], verified["tag"], "AGENTS.md", token)
        problems = compliance(agents_md, verified["tag"])
        checks.append(
            {
                "name": "agents-md",
                "ok": not problems,
                "detail": "AGENTS.md has every field and section the protocol requires."
                if not problems
                else "AGENTS.md: " + "; ".join(problems) + ". An editor will decide.",
            }
        )
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
    return {"state": state, "checks": checks, "verified": verified, "listed_as": listed_as, "agents_md": agents_md}


def checklist(checks: list[dict[str, Any]]) -> str:
    lines = []
    for c in checks:
        if c["ok"]:
            mark = "✅"
        elif c["name"] in ("submitter", "agents-md", "ai-review"):
            mark = "⚠️"  # an editor decides; not a failure
        elif c["name"] == "not-listed":
            mark = "ℹ️"
        else:
            mark = "❌"
        lines.append(f"- {mark} {c['detail']}")
    return "\n".join(lines)


def auto_listing(result: dict[str, Any]) -> bool:
    """Listed without an editor only when every check passed (then the AI review decides)."""
    return result["state"] == "awaiting-editor" and all(c["ok"] for c in result["checks"]) and os.environ.get("AUTO_LIST", "true") != "false"


def plan_for_checks(sub: dict[str, Any], result: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    if auto_listing(result):
        readme = fetch(result["verified"]["owner_repo"], result["verified"]["tag"], "README.md", ctx["token"])
        return {
            "act": True,
            "review_prompt": review_prompt(result["verified"], result["agents_md"], readme),
            "pending": {"sub": sub, "result": {k: v for k, v in result.items() if k != "agents_md"}, "issue_number": ctx["issue_number"]},
        }
    state = result["state"]
    who = f"@{sub['submitter']}"
    next_step = {
        "checks-failed": f"{who}, fix the release and comment `/recheck` to run the checks again. "
        "The protocol explains each requirement: https://github.com/LionSR/AgenticPublicationProtocol/blob/main/PROTOCOL.md",
        "awaiting-editor": "The release is valid, but an editor needs to look at the points marked ⚠️ before listing it. The editor will comment `/accept` or explain what is missing.",
        "already-listed": f"Nothing to do: this release is already listed as {result['listed_as']}.",
    }[state]
    comment = f"### Submission checks\n\n{checklist(result['checks'])}\n\n{next_step}\n\n{status_block(state, result['checks'])}"
    plan = {"act": True, "comment": comment, "state": state}
    if state == "already-listed":
        plan["close"] = "completed"
    return plan


def finalize(pending: dict[str, Any], review_text: str | None, today: dt.date) -> dict[str, Any]:
    """After the AI review: list the paper, or hand it to an editor with the review's points."""
    sub, result = pending["sub"], pending["result"]
    review = read_review(review_text)
    checks = result["checks"] + [
        {
            "name": "ai-review",
            "ok": not review["flag"],
            "detail": "The automatic review found nothing for an editor to check." if not review["flag"] else "The automatic review asks an editor to look: " + " ".join(review["reasons"]),
        }
    ]
    if not review["flag"]:
        note = "Every check and the automatic review passed, so the paper was listed without waiting for an editor. Editors can still review and remove listings."
        return list_paper(sub, {**result, "checks": checks}, today, "the automatic checks", pending["issue_number"], note)
    comment = (
        f"### Submission checks\n\n{checklist(checks)}\n\n"
        "The release is valid. Because of the automatic review's points above, an editor will look at it before listing. "
        "The editor will comment `/accept` or explain what is missing.\n\n" + status_block("awaiting-editor", checks)
    )
    return {"act": True, "state": "awaiting-editor", "comment": comment}


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
    return plan_for_checks(sub, run_checks(sub, ctx["token"]), ctx)


def decline(sub: dict[str, Any], actor: str, reason: str, ctx: dict[str, Any]) -> dict[str, Any]:
    return {
        "act": True,
        "state": "declined",
        "close": "not planned",
        "comment": f"### Declined\n\n@{sub['submitter']}, an editor declined this submission:\n\n> {reason}\n\n"
        "Reply here if you want to respond. An editor can reopen the submission.\n\n"
        + status_block("declined", [{"name": "editor-decision", "ok": False, "detail": reason}]),
    }


def list_paper(sub: dict[str, Any], result: dict[str, Any], today: dt.date, accepted_by: str, issue_number: Any, note: str = "") -> dict[str, Any]:
    entry, what = add(result["verified"], today)
    v = entry["versions"][-1]
    cite_id = entry["id"] if v["v"] == 1 else f"{entry['id']}v{v['v']}"
    title = f"Add {entry['id']}: {entry['title']}" if what == "new" else f"Add {v['tag']} to {entry['id']}: {entry['title']}"
    return {
        "act": True,
        "state": "accepted",
        "close": "completed",
        "entry_path": str((ENTRIES / f"{entry['id']}.json").relative_to(ROOT)),
        "commit_message": f"{title}\n\nAccepted by {accepted_by} in #{issue_number}.",
        "comment": f"### Listed as {cite_id}\n\n@{sub['submitter']}, your paper is now in the registry: {site_link(entry['id'])}\n\n"
        + (f"{checklist(result['checks'])}\n\n{note}\n\n" if note else "")
        + status_block("accepted", result["checks"], entry["id"]),
    }


def accept(sub: dict[str, Any], actor: str, arg: str, ctx: dict[str, Any]) -> dict[str, Any]:
    """An editor lists the paper. The protocol checks must pass; ⚠️ points and the AI review do not block an editor."""
    result = run_checks(sub, ctx["token"])
    if result["state"] != "awaiting-editor":
        return plan_for_checks(sub, result, ctx)
    return list_paper(sub, result, ctx["today"], f"@{actor}", ctx["issue_number"])


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

    ctx = {"token": token, "today": today, "issue_number": issue.get("number")}
    if (event_name, event.get("action")) == ("issues", "opened"):
        return plan_for_checks(sub, run_checks(sub, token), ctx)
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
    return command.run(sub, actor, arg.strip(), ctx)


def with_labels(plan: dict[str, Any]) -> dict[str, Any]:
    if plan.get("act") and plan.get("state"):
        plan["labels_add"] = ["submission", plan["state"]]
        plan["labels_remove"] = [l for l in STATE_LABELS if l != plan["state"]]
    return plan


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--event", help="path to the GitHub event payload (GITHUB_EVENT_PATH)")
    ap.add_argument("--event-name", help="GITHUB_EVENT_NAME")
    ap.add_argument("--bot-login", default=os.environ.get("REGISTRY_BOT_LOGIN", ""), help="login of the registry app bot")
    ap.add_argument("--review-prompt-out", default="review-input.txt", help="where to write the AI review prompt, when one is needed")
    ap.add_argument("--finalize", metavar="PLAN", help="second step: finish a plan that waited for the AI review")
    ap.add_argument("--review", metavar="FILE", help="with --finalize: the AI review's reply (missing or empty: no review)")
    ap.add_argument("--today", type=dt.date.fromisoformat, default=None)
    args = ap.parse_args()
    today = args.today or dt.datetime.now(dt.timezone.utc).date()

    if args.finalize:
        pending = json.loads(Path(args.finalize).read_text())["pending"]
        review_text = Path(args.review).read_text() if args.review and Path(args.review).is_file() else None
        plan = finalize(pending, review_text, today)
    else:
        if not (args.event and args.event_name and args.bot_login):
            print("--event, --event-name and REGISTRY_BOT_LOGIN are required", file=sys.stderr)
            return 2
        plan = decide(args.event_name, json.loads(Path(args.event).read_text()), args.bot_login, github_token(), today)
        if "review_prompt" in plan:
            Path(args.review_prompt_out).write_text(plan.pop("review_prompt"))
            plan["review"] = args.review_prompt_out
    json.dump(with_labels(plan), sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
