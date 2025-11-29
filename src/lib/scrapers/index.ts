import { BaseScraper } from "./base";
import { MangaParkScraper } from "./mangapark";
import { AtsuMoeScraper } from "./atsumoe";
import { LikeMangaScraper } from "./likemanga";
import { ManhuausScraper } from "./manhuaus";
import { MangaReadScraper } from "./mangaread";
import { MgekoScraper } from "./mgeko";
import { NovelCoolScraper } from "./novelcool";
import { AsuraScanScraper } from "./asurascan";
import { WeebCentralScraper } from "./weebcentral";
import { FlameComicsScraper } from "./flamecomics";
import { BatoScraper } from "./bato";
import { MangaloomScraper } from "./mangaloom";
import { MangayyScraper } from "./mangayy";
import { TopManhuaScraper } from "./topmanhua";
import { LagoonScansScraper } from "./lagoonscans";
import { StonescapeScraper } from "./stonescape";
import { RizzFablesScraper } from "./rizzfables";
import { FalconscansScraper } from "./falconscans";
import { ComixScraper } from "./comix";
import { RavenScansScraper } from "./ravenscans";
import { SourceInfo } from "@/types";

const scrapers: BaseScraper[] = [
  new MangaParkScraper(),
  new AtsuMoeScraper(),
  new LikeMangaScraper(),
  new ManhuausScraper(),
  new MangaReadScraper(),
  new MgekoScraper(),
  new NovelCoolScraper(),
  new AsuraScanScraper(),
  new WeebCentralScraper(),
  new FlameComicsScraper(),
  new BatoScraper(),
  new MangaloomScraper(),
  new MangayyScraper(),
  new TopManhuaScraper(),
  new LagoonScansScraper(),
  new StonescapeScraper(),
  new RizzFablesScraper(),
  new FalconscansScraper(),
  new ComixScraper(),
  new RavenScansScraper(),
];

export function getScraper(url: string): BaseScraper | null {
  return scrapers.find((scraper) => scraper.canHandle(url)) || null;
}

export function getScraperByName(name: string): BaseScraper | null {
  return (
    scrapers.find(
      (scraper) => scraper.getName().toLowerCase() === name.toLowerCase(),
    ) || null
  );
}

export function getAllScrapers(): BaseScraper[] {
  return scrapers;
}

export function getClientOnlyScrapers(): BaseScraper[] {
  return scrapers.filter((scraper) => scraper.isClientOnly());
}

export function getAllSourceInfo(): SourceInfo[] {
  return scrapers.map((scraper) => ({
    id: scraper.getName().toLowerCase().replace(/\s+/g, "-"),
    name: scraper.getName(),
    baseUrl: scraper.getBaseUrl(),
    description: scraper.getDescription(),
    clientOnly: scraper.isClientOnly(),
    type: scraper.getType(),
  }));
}

export {
  BaseScraper,
  MangaParkScraper,
  AtsuMoeScraper,
  LikeMangaScraper,
  ManhuausScraper,
  MangaReadScraper,
  MgekoScraper,
  NovelCoolScraper,
  AsuraScanScraper,
  WeebCentralScraper,
  FlameComicsScraper,
  BatoScraper,
  MangaloomScraper,
  MangayyScraper,
  TopManhuaScraper,
  LagoonScansScraper,
  StonescapeScraper,
  RizzFablesScraper,
  FalconscansScraper,
  ComixScraper,
  RavenScansScraper,
};
