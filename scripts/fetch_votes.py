#!/usr/bin/env python3
"""Fetch the most recent vote for every current House member."""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

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
    client = Client()
    congress = CURRENT_CONGRESS
    session = get_session()

    print(f"Fetching data for Congress {congress}, Session {session}")

    existing = load_existing()
    existing_members = existing.get("members", {}) if existing else {}
    newest_recorded_vote = 0
    if existing_members:
        for m in existing_members.values():
            lv = m.get("last_vote")
            if lv and lv.get("vote_number", 0) > newest_recorded_vote:
                newest_recorded_vote = lv["vote_number"]

    print(f"Newest previously recorded vote: {newest_recorded_vote}")

    print("Fetching current House members...")
    current_members = fetch_current_house_members(client)
    print(f"Found {len(current_members)} House members")
    time.sleep(0.5)

    # Determine which members still need a vote record
    vote_map = {}
    for bio_id, info in existing_members.items():
        if bio_id in current_members and info.get("last_vote"):
            vote_map[bio_id] = info["last_vote"]

    needed = set(current_members.keys()) - set(vote_map.keys())
    print(f"{len(needed)} members still need a vote record")

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

    # On incremental runs, only process votes newer than what we have
    if newest_recorded_vote > 0 and needed == set():
        all_votes = [v for v in all_votes if v.get("rollCallNumber", 0) > newest_recorded_vote]
        # Re-check all members for these new votes
        needed = set(current_members.keys())
        print(f"Incremental mode: checking {len(all_votes)} new votes")

    for vote in all_votes:
        if not needed:
            print("All members accounted for!")
            break

        vote_number = vote.get("rollCallNumber")
        vote_date = vote.get("startDate", "")
        description = build_vote_description(vote)

        print(f"  Processing vote {vote_number} ({vote_date})... ", end="", flush=True)
        time.sleep(0.5)

        positions = fetch_vote_members(client, congress, session, vote_number)
        found = 0
        for pos in positions:
            bio_id = pos.get("bioguideID")
            if bio_id not in needed:
                continue
            if pos.get("voteCast") in ("Not Voting",):
                continue

            vote_map[bio_id] = {
                "date": vote_date,
                "vote_number": vote_number,
                "description": description,
                "position": pos.get("voteCast", ""),
            }
            needed.discard(bio_id)
            found += 1

        print(f"found {found} members, {len(needed)} remaining")

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

    if needed:
        print(f"\n{len(needed)} members with no vote found:")
        for bio_id in sorted(needed):
            print(f"  {bio_id}: {current_members[bio_id]['name']}")


if __name__ == "__main__":
    main()
