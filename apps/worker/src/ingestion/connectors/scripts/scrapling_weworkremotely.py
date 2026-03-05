#!/usr/bin/env python3
"""Scrape WeWorkRemotely listings with Scrapling and print JSON payload for EZJob ingestion."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone


def scrape(url: str) -> dict:
    errors: list[str] = []
    jobs: list[dict] = []

    try:
        from scrapling.fetchers import Fetcher
    except Exception as exc:  # dependency/runtime error
        return {
            "sourceName": "scrapling",
            "jobs": [],
            "errors": [
                f"import:{type(exc).__name__}:{exc}. Install with: pip install scrapling 'scrapling[fetchers]'"
            ],
        }

    try:
        page = Fetcher.get(url)
        cards = page.css("section.jobs article ul li")
        if not cards:
            cards = page.css("li.new-listing-container")

        for card in cards:
            try:
                anchor = card.css("a")
                href = anchor.attrib.get("href") if anchor else None
                if not href:
                    continue

                job_url = href if href.startswith("http") else f"https://weworkremotely.com{href}"
                title = card.css("span.title::text").get() or card.css("h4::text").get() or ""
                company = card.css("span.company::text").get() or "Unknown"
                region = card.css("span.region.company::text").get() or "Remote"

                if not title.strip():
                    continue

                jobs.append(
                    {
                        "id": job_url,
                        "url": job_url,
                        "title": title.strip(),
                        "company_name": company.strip(),
                        "location": region.strip(),
                        "posted_at": datetime.now(timezone.utc).isoformat(),
                        "description": "",
                    }
                )
            except Exception as exc:
                errors.append(f"parse_card:{type(exc).__name__}:{exc}")
    except Exception as exc:
        errors.append(f"fetch:{type(exc).__name__}:{exc}")

    return {"sourceName": "scrapling", "jobs": jobs, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://weworkremotely.com/remote-jobs")
    args = parser.parse_args()
    print(json.dumps(scrape(args.url)))


if __name__ == "__main__":
    main()
