export interface ScrapedChapter {
  id: string;
  number: number;
  title?: string;
  url: string;
  isDownloaded?: boolean;
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

export interface SourceInfo {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
}
