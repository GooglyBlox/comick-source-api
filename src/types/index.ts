export interface ScrapedChapter {
  id: string;
  number: number;
  title?: string;
  url: string;
  isDownloaded?: boolean;
  lastUpdated?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  coverImage?: string;
  latestChapter: number;
  lastUpdated: string;
  lastUpdatedTimestamp?: number;
  rating?: number;
  followers?: string;
}

export type SourceType = "scanlator" | "aggregator";

export interface SourceInfo {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
  clientOnly?: boolean;
  type: SourceType;
}
