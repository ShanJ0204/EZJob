import { normalizeJobPosting, type JobPosting } from "@ezjob/common";
import type { ConnectorFetchResult, IngestionConnector } from "../types.js";

type RssItem = {
  guid: string;
  link: string;
  title: string;
  pubDate?: string;
  description?: string;
};

const decodeXml = (value: string): string =>
  value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const extractTag = (content: string, tagName: string): string | undefined => {
  const match = content.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match?.[1] ? decodeXml(match[1].trim()) : undefined;
};

const parseItems = (xml: string): RssItem[] => {
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
  return itemMatches
    .map((itemXml) => ({
      guid: extractTag(itemXml, "guid") ?? "",
      link: extractTag(itemXml, "link") ?? "",
      title: extractTag(itemXml, "title") ?? "",
      pubDate: extractTag(itemXml, "pubDate"),
      description: extractTag(itemXml, "description")
    }))
    .filter((item) => item.guid && item.link && item.title);
};

const parseTitle = (rawTitle: string): { title: string; companyName: string } => {
  const segments = rawTitle.split(/:\s+/);
  if (segments.length >= 2) {
    return {
      companyName: segments[0].trim(),
      title: segments.slice(1).join(": ").trim()
    };
  }

  return {
    companyName: "Unknown",
    title: rawTitle
  };
};

export class WeWorkRemotelyRssConnector implements IngestionConnector {
  public readonly sourceName = "weworkremotely";
  public readonly sourceType = "rss" as const;

  async fetchPostings(): Promise<ConnectorFetchResult> {
    const errors: string[] = [];
    const jobs: JobPosting[] = [];

    try {
      const response = await fetch("https://weworkremotely.com/remote-jobs.rss");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      const items = parseItems(xml);

      for (const item of items) {
        try {
          const parsed = parseTitle(item.title);
          jobs.push(
            normalizeJobPosting({
              sourceName: this.sourceName,
              sourceJobId: item.guid,
              sourceUrl: item.link,
              title: parsed.title,
              companyName: parsed.companyName,
              locationText: "Remote",
              locationCountry: "Remote",
              isRemote: true,
              postedAt: item.pubDate ? new Date(item.pubDate) : undefined,
              description: item.description
            })
          );
        } catch (error) {
          errors.push(`normalize:${item.guid}:${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`fetch:${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      sourceName: this.sourceName,
      jobs,
      errors
    };
  }
}
