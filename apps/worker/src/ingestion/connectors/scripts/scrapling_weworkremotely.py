#!/usr/bin/env python3
"""Scrape WeWorkRemotely listings for EZJob ingestion.

Prefers Scrapling when available; otherwise falls back to the WWR RSS feed so
this script still returns job data in constrained environments.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scrape_with_scrapling(url: str) -> tuple[list[dict[str, Any]], list[str]]:
    from scrapling.fetchers import Fetcher

    errors: list[str] = []
    jobs: list[dict[str, Any]] = []

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
                    "posted_at": _now_iso(),
                    "description": "",
                }
            )
        except Exception as exc:
            errors.append(f"parse_card:{type(exc).__name__}:{exc}")

    return jobs, errors


def _rss_url(url: str) -> str:
    if url.endswith(".rss"):
        return url
    if "weworkremotely.com" in url:
        return "https://weworkremotely.com/remote-jobs.rss"
    return f"{url.rstrip('/')}.rss"


def _scrape_with_rss(url: str) -> tuple[list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    jobs: list[dict[str, Any]] = []

    feed_url = _rss_url(url)
    req = Request(feed_url, headers={"User-Agent": "EZJobBot/1.0 (+https://example.com)"})
    with urlopen(req, timeout=30) as response:
        xml = response.read()

    root = ET.fromstring(xml)
    channel = root.find("channel")
    if channel is None:
        return jobs, [f"rss:invalid_feed:{feed_url}"]

    for item in channel.findall("item"):
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or link).strip()
        raw_title = (item.findtext("title") or "").strip()
        description = (item.findtext("description") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()

        if not link or not raw_title:
            continue

        if ": " in raw_title:
            company, title = raw_title.split(": ", 1)
        else:
            company, title = "Unknown", raw_title

        posted_at = _now_iso()
        if pub_date:
            try:
                posted_at = parsedate_to_datetime(pub_date).astimezone(timezone.utc).isoformat()
            except Exception:
                errors.append(f"rss:invalid_pub_date:{pub_date}")

        jobs.append(
            {
                "id": guid or link,
                "url": urljoin("https://weworkremotely.com", link),
                "title": title.strip(),
                "company_name": company.strip() or "Unknown",
                "location": "Remote",
                "posted_at": posted_at,
                "description": description,
            }
        )

    return jobs, errors


def scrape(url: str) -> dict[str, Any]:
    errors: list[str] = []

    try:
        jobs, scrape_errors = _scrape_with_scrapling(url)
        errors.extend(scrape_errors)
        return {"sourceName": "scrapling", "jobs": jobs, "errors": errors}
    except Exception as exc:
        errors.append(f"scrapling_unavailable:{type(exc).__name__}:{exc}")

    try:
        jobs, rss_errors = _scrape_with_rss(url)
        errors.extend(rss_errors)
        return {"sourceName": "scrapling", "jobs": jobs, "errors": errors}
    except Exception as exc:
        errors.append(f"rss_fallback_failed:{type(exc).__name__}:{exc}")
        return {"sourceName": "scrapling", "jobs": [], "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://weworkremotely.com/remote-jobs")
    args = parser.parse_args()
    print(json.dumps(scrape(args.url)))


if __name__ == "__main__":
    main()
