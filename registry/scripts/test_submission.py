# Offline tests of the review bot (submission.py) against real GitHub releases.
import datetime as dt, json, shutil, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
import registry, submission
from registry import ROOT

BOT = 'app-registry-submit[bot]'
TOKEN = registry.github_token()
TODAY = dt.date(2026, 9, 24)

def issue(release, submitter, user=BOT, number=7, write_access=True):
    data = {"release_url": release, "submitter": submitter, "write_access": write_access, "authors_permission": not write_access, "terms": "2026-09-24"}
    body = f"{submission.MARKER}\n@{submitter} submitted {release}\n\n```json app-registry-submission\n" + json.dumps(data) + "\n```"
    return {"number": number, "user": {"login": user}, "body": body}

def ev_open(i): return ('issues', {"action": "opened", "issue": i})
def ev_comment(i, who, text): return ('issue_comment', {"action": "created", "issue": i, "comment": {"user": {"login": who}, "body": text}})

def run(label, ev):
    plan = submission.decide(ev[0], ev[1], BOT, TOKEN, TODAY)
    summary = {k: plan.get(k) for k in ('act', 'state', 'close', 'entry_path', 'reason') if plan.get(k)}
    first = (plan.get('comment') or '').split('\n```json')[0].strip().replace('\n', ' | ')[:230]
    print(f"{label}\n   {summary}\n   {first}")
    return plan

GOOD = 'https://github.com/shoaibphysics/blast-freezing-black-hole/releases/tag/v1.0.1'
BAD = 'https://github.com/shoaibphysics/blast-freezing-black-hole/releases/tag/v9.9.9'

print("== against the real registry ==")
run("1 listed release", ev_open(issue(GOOD, 'shoaibphysics')))
run("2 not opened by bot", ev_open(issue(GOOD, 'shoaibphysics', user='someone')))

tmp = ROOT / 'registry' / '.test-entries'
shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
registry.ENTRIES = submission.ENTRIES = tmp
try:
    print("== against an empty registry ==")
    run("3 fresh release", ev_open(issue(GOOD, 'shoaibphysics')))
    run("4a no write access, listed author", ev_open(issue(GOOD, 'shoaibphysics', write_access=False)))
    run("4b no write access, not an author", ev_open(issue(GOOD, 'randomperson', write_access=False)))
    run("5 bad tag", ev_open(issue(BAD, 'shoaibphysics')))
    i = issue(GOOD, 'shoaibphysics')
    run("6 /recheck by stranger", ev_comment(i, 'stranger', '/recheck'))
    run("7 /accept by submitter (not editor)", ev_comment(i, 'shoaibphysics', '/accept'))
    run("8 /decline no reason", ev_comment(i, 'LionSR', '/decline'))
    run("9 /decline with reason", ev_comment(i, 'LionSR', '/decline Out of scope for the registry.'))
    run("10 plain reply", ev_comment(i, 'shoaibphysics', 'Thanks!'))
    p = run("11 /accept by editor", ev_comment(i, 'LionSR', '/accept'))
    print("   commit:", p.get('commit_message', '').split('\n')[0], "| files:", [f.name for f in tmp.iterdir()])
    run("12 /recheck after accept", ev_comment(i, 'shoaibphysics', '/recheck'))
    i2 = issue('https://github.com/shoaibphysics/blast-freezing-black-hole/releases/tag/v1.0.0', 'shoaibphysics')
    p = run("13 /accept older tag of same repo", ev_comment(i2, 'XiaoliangQi', '/accept'))
    print("   commit:", p.get('commit_message', '').split('\n')[0])
    print("   status block:", p['comment'].split('```json app-registry-status\n')[1].split('```')[0].replace('\n', ' ')[:200])
finally:
    shutil.rmtree(tmp, ignore_errors=True)
