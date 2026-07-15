#!/usr/bin/env python3
"""Fetch the most recent vote for every current House member."""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from pycongress import Client, CURRENT_CONGRESS

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MEMBERS_FILE = DATA_DIR / "members.json"


def get_session():
    """Session 1 in odd years, session 2 in even years."""
    return 1 if datetime.now().year % 2 == 1 else 2


def fetch_current_house_members(client):
    """Return dict of bioguide_id -> member info for current House members."""
    members = {}
    offset = 0
    while True:
        resp = client.members(CURRENT_CONGRESS, limit=250, offset=offset, currentMember=True)
        for m in resp.get("members", []):
            terms = m.get("terms", {}).get("item", [])
            if not terms:
                continue
            last_term = terms[-1]
            if last_term.get("chamber") != "House of Representatives":
                continue
            members[m["bioguideId"]] = {
                "name": m["name"],
                "state": m.get("state", ""),
                "district": m.get("district"),
                "party": m.get("partyName", "")[0] if m.get("partyName") else "",
            }
        pagination = resp.get("pagination", {})
        if pagination.get("next"):
            offset += 250
            time.sleep(0.5)
        else:
            break
    return members


def fetch_vote_members(client, congress, session, vote_number):
    """Fetch member positions for a specific vote."""
    resp = client.house_vote(congress, session, vote_number, item="members")
    return resp.get("houseRollCallVoteMemberVotes", {}).get("results", [])


def load_existing():
    """Load existing members.json if present."""
    if MEMBERS_FILE.exists():
        with open(MEMBERS_FILE) as f:
            return json.load(f)
    return None


def build_vote_description(vote):
    leg_type = vote.get("legislationType", "")
    leg_num = vote.get("legislationNumber", "")
    result = vote.get("result", "")
    if leg_type and leg_num:
        return f"{leg_type} {leg_num} — {result}"
    return result or "Roll Call Vote"


def main():
    client = Client(timeout=60.0)
    congress = CURRENT_CONGRESS
    session = get_session()

    print(f"Fetching data for Congress {congress}, Session {session}")

    existing = load_existing()
    existing_members = existing.get("members", {}) if existing else {}

    # Backfill congress/session on entries written before those fields existed
    if existing:
        for m in existing_members.values():
            lv = m.get("last_vote")
            if lv:
                lv.setdefault("congress", existing.get("congress"))
                lv.setdefault("session", existing.get("session"))

    # Roll call numbers reset each session, so only entries from the current
    # congress and session can anchor the incremental checks below
    newest_recorded_vote = 0
    for m in existing_members.values():
        lv = m.get("last_vote")
        if lv and lv.get("congress") == congress and lv.get("session") == session:
            newest_recorded_vote = max(newest_recorded_vote, lv.get("vote_number", 0))

    print(f"Newest previously recorded vote: {newest_recorded_vote}")

    # Quick check: fetch just the most recent vote to see if anything is new
    if existing and newest_recorded_vote > 0:
        try:
            resp = client.house_votes(congress, session, limit=1, offset=0)
            latest_batch = resp.get("houseRollCallVotes", [])
            if latest_batch:
                current_latest = latest_batch[0].get("rollCallNumber", 0)
                if current_latest <= newest_recorded_vote:
                    existing["updated_at"] = datetime.now(timezone.utc).isoformat()
                    with open(MEMBERS_FILE, "w") as f:
                        json.dump(existing, f, indent=2)
                    print(f"No new votes (latest is still {current_latest}). Updated timestamp only.")
                    return
                print(f"New votes found: {current_latest} > {newest_recorded_vote}")
            time.sleep(0.5)
        except httpx.TimeoutException:
            print("Quick check timed out; proceeding with full fetch.")

    print("Fetching current House members...")
    current_members = fetch_current_house_members(client)
    print(f"Found {len(current_members)} House members")
    time.sleep(0.5)

    # Carry over vote records for members we already know about
    vote_map = {}
    for bio_id, info in existing_members.items():
        if bio_id in current_members and info.get("last_vote"):
            vote_map[bio_id] = info["last_vote"]

    # Every member gets checked against votes newer than the last run; members
    # we have never seen before also get a search back through older votes.
    # Members already searched without success (e.g. delegates who never cast
    # a floor vote) are only checked against new votes.
    pending_new = set(current_members.keys())
    missing = {
        bio_id for bio_id in current_members
        if bio_id not in vote_map and bio_id not in existing_members
    }
    print(f"{len(missing)} members need a full vote search")

    # Fetch votes newest-first
    print("Fetching House votes...")
    all_votes = []
    offset = 0
    while True:
        resp = client.house_votes(congress, session, limit=250, offset=offset)
        batch = resp.get("houseRollCallVotes", [])
        if not batch:
            break
        all_votes.extend(batch)
        pagination = resp.get("pagination", {})
        if pagination.get("next"):
            offset += 250
            time.sleep(0.5)
        else:
            break

    # Sort by rollCallNumber descending (newest first)
    all_votes.sort(key=lambda v: v.get("rollCallNumber", 0), reverse=True)
    latest_vote_number = all_votes[0].get("rollCallNumber", 0) if all_votes else 0
    print(f"Found {len(all_votes)} total votes (latest: {latest_vote_number})")

    for vote in all_votes:
        vote_number = vote.get("rollCallNumber", 0)
        if vote_number <= newest_recorded_vote:
            # Past the new votes: members still pending simply haven't voted
            # since the last run; keep walking older votes only for members
            # with no record at all
            pending_new = set()

        targets = pending_new | missing
        if not targets:
            print("All members accounted for!")
            break

        vote_date = vote.get("startDate", "")
        description = build_vote_description(vote)

        print(f"  Processing vote {vote_number} ({vote_date})... ", end="", flush=True)
        time.sleep(0.5)

        positions = fetch_vote_members(client, congress, session, vote_number)
        found = 0
        for pos in positions:
            bio_id = pos.get("bioguideID")
            if bio_id not in targets:
                continue
            if pos.get("voteCast") in ("Not Voting",):
                continue

            vote_map[bio_id] = {
                "date": vote_date,
                "vote_number": vote_number,
                "congress": congress,
                "session": session,
                "description": description,
                "position": pos.get("voteCast", ""),
            }
            pending_new.discard(bio_id)
            missing.discard(bio_id)
            found += 1

        print(f"found {found} members, {len(pending_new | missing)} unresolved")

    # Build final output
    output_members = {}
    for bio_id, info in current_members.items():
        entry = dict(info)
        entry["last_vote"] = vote_map.get(bio_id)
        output_members[bio_id] = entry

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "congress": congress,
        "session": session,
        "latest_vote_number": latest_vote_number,
        "members": output_members,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(MEMBERS_FILE, "w") as f:
        json.dump(output, f, indent=2)

    voted = sum(1 for m in output_members.values() if m.get("last_vote"))
    print(f"\nDone! {voted}/{len(output_members)} members have vote records.")
    print(f"Written to {MEMBERS_FILE}")

    unfound = sorted(bio_id for bio_id in current_members if not vote_map.get(bio_id))
    if unfound:
        print(f"\n{len(unfound)} members with no vote found:")
        for bio_id in unfound:
            print(f"  {bio_id}: {current_members[bio_id]['name']}")


if __name__ == "__main__":
    main()
