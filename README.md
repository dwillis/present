# Present

How long since your representative voted? A static site that tracks the most recent roll call vote for every U.S. House member.

## How it works

A Python script uses the [Congress.gov API](https://api.congress.gov/) via [PyCongress](https://github.com/dwillis/PyCongress) to fetch House roll call votes and record each member's most recent vote. The results are stored in a single JSON file that powers a static HTML/CSS/JS front end.

A GitHub Actions workflow runs the script daily to keep the data fresh.

## Features

- Leaderboard of the 20 members with the longest voting absences
- Filter by state or zip code
- Sort by absence length, recency, name, or state
- Color-coded urgency indicators based on how long since a member voted

## Setup

Requires a free [Congress.gov API key](https://api.congress.gov/sign-up/).

```bash
# Install dependencies
uv sync

# Fetch vote data
CONGRESS_API_KEY=your_key uv run python scripts/fetch_votes.py

# Preview the site
uv run python -m http.server 8000
```

## Deployment

The site is designed for GitHub Pages, served from the repo root. Add your `CONGRESS_API_KEY` as a repository secret and the daily workflow in `.github/workflows/update.yml` will keep `data/members.json` updated automatically.
