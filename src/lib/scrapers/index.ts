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
import { DemonicscansScraper } from "./demonicscans";
import { DivaScansScraper } from "./divascans";
import { EvaScansScraper } from "./evascans";
import { RavenScansScraper } from "./ravenscans";
import { RdscansScraper } from "./rdscans";
import { RitharscansScraper } from "./ritharscans";
import { RokariComicsScraper } from "./rokaricomics";
import { MangataroScraper } from "./mangataro";
import { KaliScanScraper } from "./kaliscan";
import { MangagoScraper } from "./mangago";
import { PhiliascansScraper } from "./philiascans";
import { ProjectSukiScraper } from "./projectsuki";
import { WeebdexScraper } from "./weebdex";
import { QiScansScraper } from "./qiscans";
import { ThunderscansScraper } from "./thunderscans";
import { UtoonScraper } from "./utoon";
import { VortexScansScraper } from "./vortexscans";
import { ArvenComicsScraper } from "./arvencomics";
import { AryaScansScraper } from "./arya-scans";
import { LuaComicScraper } from "./luacomic";
import { VioletscansScraper } from "./violetscans";
import { WitchscansScraper } from "./witchscans";
import { ElfToonScraper } from "./elftoon";
import { WritersScansScraper } from "./writerscans";
import { MadaraScansScraper } from "./madarascans";
import { ManhuaPlusScraper } from "./manhuaplus";
import { SilentQuillScraper } from "./silentquill";
import { TempleToonsScraper } from "./templetoons";
import { AsmotoonScraper } from "./asmotoon";
import { SpiderScansScraper } from "./spiderscans";
import { GDScansScraper } from "./gdscans";
import { GreedScansScraper } from "./greedscans";
import { KappaBeastScraper } from "./kappabeast";
import { MagusToonScraper } from "./magustoon";
import { FirescansScraper } from "./firescans";
import { YakshascansScraper } from "./yakshascans";
import { YakshacomicsScraper } from "./yakshacomics";
import { MangasushiScraper } from "./mangasushi";
import { KsgroupscansScraper } from "./ksgroupscans";
import { KuramangaScraper } from "./kuramanga";
import { LHTranslationScraper } from "./lhtranslation";
import { KenscansScraper } from "./kenscans";
import { MangaKatanaScraper } from "./mangakatana";
import { MangaCloudScraper } from "./mangacloud";
import { MistScansScraper } from "./mistscans";
import { RageScansScraper } from "./ragescans";
import { AthreaScansScraper } from "./athreascans";
import { HadesScansScraper } from "./hadesscans";
import { ScytheScansScraper } from "./scythescans";
import { WebtoonScraper } from "./webtoon";
import { MangaDexScraper } from "./mangadex";
import { DynastyScansScraper } from "./dynastyscans";
import { MangaballScraper } from "./mangaball";
import { SwarmScraper } from "./swarm";
import { HiveToonScraper } from "./hivetoons";
import { MKissaScraper } from "./mkissa";
import { ChikariScraper } from "./chikari";
import { WebtoonClubScraper } from "./webtoonclub";
import { BaeToonScraper } from "./baetoon";
import { NyxScansScraper } from "./nyxscans";
import { MangaKScraper } from "./mangak";
import { XComicScraper } from "./xcomic";
import { ReiMangaScraper } from "./reimanga";
import { HachirumiScraper } from "./hachirumi";
import { DankeScraper } from "./danke";
import { TCBScansScraper } from "./tcbscans";
import { KaynScansScraper } from "./kaynscans";
import { DrakeScansScraper } from "./drakescans";
import { ValirScansScraper } from "./valirscans";
import { GenzToonsScraper } from "./genztoons";
import { OrionScansScraper } from "./orionscans";
import { SanaScansScraper } from "./sanascans";
import { KeroScansScraper } from "./keroscans";
import { RoliaScanScraper } from "./roliascan";
import { RinkoComicsScraper } from "./rinkocomics";
import { LuminareScraper } from "./luminare";
import { SirenScansScraper } from "./sirenscans";
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
  new DemonicscansScraper(),
  new RavenScansScraper(),
  new RdscansScraper(),
  new RitharscansScraper(),
  new RokariComicsScraper(),
  new MangataroScraper(),
  new KaliScanScraper(),
  new MangagoScraper(),
  new PhiliascansScraper(),
  new ProjectSukiScraper(),
  new WeebdexScraper(),
  new QiScansScraper(),
  new ThunderscansScraper(),
  new UtoonScraper(),
  new VortexScansScraper(),
  new ArvenComicsScraper(),
  new AryaScansScraper(),
  new LuaComicScraper(),
  new VioletscansScraper(),
  new WitchscansScraper(),
  new ElfToonScraper(),
  new WritersScansScraper(),
  new MadaraScansScraper(),
  new ManhuaPlusScraper(),
  new SilentQuillScraper(),
  new TempleToonsScraper(),
  new AsmotoonScraper(),
  new SpiderScansScraper(),
  new GDScansScraper(),
  new GreedScansScraper(),
  new KappaBeastScraper(),
  new MagusToonScraper(),
  new FirescansScraper(),
  new YakshascansScraper(),
  new YakshacomicsScraper(),
  new MangasushiScraper(),
  new KsgroupscansScraper(),
  new KuramangaScraper(),
  new LHTranslationScraper(),
  new KenscansScraper(),
  new MangaKatanaScraper(),
  new MangaCloudScraper(),
  new MistScansScraper(),
  new RageScansScraper(),
  new AthreaScansScraper(),
  new DivaScansScraper(),
  new EvaScansScraper(),
  new HadesScansScraper(),
  new ScytheScansScraper(),
  new WebtoonScraper(),
  new MangaDexScraper(),
  new DynastyScansScraper(),
  new MangaballScraper(),
  new SwarmScraper(),
  new HiveToonScraper(),
  new MKissaScraper(),
  new ChikariScraper(),
  new WebtoonClubScraper(),
  new BaeToonScraper(),
  new NyxScansScraper(),
  new MangaKScraper(),
  new XComicScraper(),
  new ReiMangaScraper(),
  new HachirumiScraper(),
  new DankeScraper(),
  new TCBScansScraper(),
  new KaynScansScraper(),
  new DrakeScansScraper(),
  new ValirScansScraper(),
  new GenzToonsScraper(),
  new OrionScansScraper(),
  new SanaScansScraper(),
  new KeroScansScraper(),
  new RoliaScanScraper(),
  new RinkoComicsScraper(),
  new LuminareScraper(),
  new SirenScansScraper(),
];

export function getScraper(url: string): BaseScraper | null {
  return scrapers.find((scraper) => scraper.canHandle(url)) || null;
}

export function getScraperByName(name: string): BaseScraper | null {
  const key = name.trim().toLowerCase();
  return (
    scrapers.find(
      (scraper) =>
        scraper.getId() === key || scraper.getName().toLowerCase() === key,
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
    id: scraper.getId(),
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
  DemonicscansScraper,
  RavenScansScraper,
  RdscansScraper,
  RitharscansScraper,
  RokariComicsScraper,
  MangataroScraper,
  KaliScanScraper,
  MangagoScraper,
  PhiliascansScraper,
  ProjectSukiScraper,
  WeebdexScraper,
  QiScansScraper,
  ThunderscansScraper,
  UtoonScraper,
  VortexScansScraper,
  ArvenComicsScraper,
  AryaScansScraper,
  LuaComicScraper,
  VioletscansScraper,
  WitchscansScraper,
  ElfToonScraper,
  WritersScansScraper,
  MadaraScansScraper,
  ManhuaPlusScraper,
  SilentQuillScraper,
  TempleToonsScraper,
  AsmotoonScraper,
  SpiderScansScraper,
  GDScansScraper,
  GreedScansScraper,
  KappaBeastScraper,
  MagusToonScraper,
  FirescansScraper,
  YakshascansScraper,
  YakshacomicsScraper,
  MangasushiScraper,
  KsgroupscansScraper,
  KuramangaScraper,
  LHTranslationScraper,
  KenscansScraper,
  MangaKatanaScraper,
  MangaCloudScraper,
  MistScansScraper,
  RageScansScraper,
  AthreaScansScraper,
  DivaScansScraper,
  EvaScansScraper,
  HadesScansScraper,
  ScytheScansScraper,
  WebtoonScraper,
  MangaDexScraper,
  DynastyScansScraper,
  MangaballScraper,
  SwarmScraper,
  HiveToonScraper,
  MKissaScraper,
  ChikariScraper,
  WebtoonClubScraper,
  BaeToonScraper,
  NyxScansScraper,
  MangaKScraper,
  XComicScraper,
  ReiMangaScraper,
  HachirumiScraper,
  DankeScraper,
  TCBScansScraper,
  KaynScansScraper,
  DrakeScansScraper,
  ValirScansScraper,
  GenzToonsScraper,
  OrionScansScraper,
  SanaScansScraper,
  KeroScansScraper,
  RoliaScanScraper,
  RinkoComicsScraper,
  LuminareScraper,
  SirenScansScraper,
};
