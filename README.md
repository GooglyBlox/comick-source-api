# Comick Source API

Next.js API for scraping manga metadata from multiple sources.

[Live API](https://comick-source-api.notaspider.dev) | [Userscript](https://greasyfork.org/en/scripts/555280-comick-source-linker)

| Source             | ID                   | Base URL                    | Status   |
| ------------------ | -------------------- | --------------------------- | -------- |
| Arven Comics       | `arven-comics`       | https://arvencomics.com     | Active   |
| Arya Scans         | `arya-scans`         | https://brainrotcomics.com  | Active   |
| Asmodeus Scans     | `asmodeus-scans`     | https://asmotoon.com        | Active   |
| AsuraScan          | `asurascan`          | https://asuracomic.net      | Active   |
| Athrea Scans       | `athrea-scans`       | https://athreascans.com     | Active   |
| AtsuMoe            | `atsumoe`            | https://atsumoe.com         | Active   |
| Bato               | `bato`               | https://bato.to             | Shutdown |
| Comix              | `comix`              | https://comix.to            | Unstable |
| DemonicScans       | `demonicscans`       | https://demonicscans.org    | Unstable |
| Diva Scans         | `diva-scans`         | https://divatoon.com        | Unstable |
| Elf Toon           | `elf-toon`           | https://elftoon.com         | Active   |
| Eva Scans          | `eva-scans`          | https://evascans.org        | Active   |
| Falcon Scans       | `falcon-scans`       | https://falconscans.com     | Shutdown |
| Firescans          | `firescans`          | https://firescans.xyz       | Active   |
| FlameComics        | `flamecomics`        | https://flamecomics.xyz     | Active   |
| Galaxy Degen Scans | `galaxy-degen-scans` | https://gdscans.com         | Active   |
| Greed Scans        | `greed-scans`        | https://greedscans.com      | Active   |
| Hades Scans        | `hades-scans`        | https://hadesscans.com      | Active   |
| KaliScan           | `kaliscan`           | https://kaliscan.com        | Active   |
| KappaBeast         | `kappabeast`         | https://kappabeast.com      | Unstable |
| KDT Scans          | `kdt-scans`          | https://www.silentquill.net | Active   |
| Kenscans           | `kenscans`           | https://kencomics.com       | Active   |
| KS Group           | `ks-group-scans`     | https://ksgroupscans.com    | Active   |
| KuraManga          | `kuramanga`          | https://kuramanga.com       | Active   |
| LagoonScans        | `lagoonscans`        | https://lagoonscans.com     | Active   |
| LHTranslation      | `lhtranslation`      | https://lhtranslation.net   | Active   |
| LikeManga          | `likemanga`          | https://likemanga.io        | Unstable |
| Lua Comic          | `lua-comic`          | https://luacomic.org        | Active   |
| Madarascans        | `madarascans`        | https://madarascans.com     | Active   |
| Magus Manga        | `magus-manga`        | https://magustoon.org       | Active   |
| MangaCloud         | `mangacloud`         | https://mangacloud.org      | Active   |
| Mangago            | `mangago`            | https://www.mangago.zone    | Active   |
| MangaKatana        | `mangakatana`        | https://mangakatana.com     | Active   |
| Mangaloom          | `mangaloom`          | https://mangaloom.com       | Active   |
| MangaPark          | `mangapark`          | https://mangapark.io        | Shutdown |
| MangaRead          | `mangaread`          | https://mangaread.org       | Active   |
| Mangasushi         | `mangasushi`         | https://mangasushi.org      | Active   |
| Mangataro          | `mangataro`          | https://mangataro.org       | Unstable |
| MangaYY            | `mangayy`            | https://mangayy.org         | Unstable |
| Manhuaplus         | `manhuaplus`         | https://manhuaplus.top      | Active   |
| ManhuaUS           | `manhuaus`           | https://manhuaus.com        | Unstable |
| Mgeko              | `mgeko`              | https://mgeko.cc            | Active   |
| Mist Scans         | `mist-scans`         | https://mistscans.com       | Active   |
| NovelCool          | `novelcool`          | https://www.novelcool.com   | Active   |
| Philia Scans       | `philia-scans`       | https://philiascans.org     | Unstable |
| Project Suki       | `project-suki`       | https://projectsuki.com     | Active   |
| Qi Scans           | `qi-scans`           | https://qiscans.org         | Active   |
| Rage Scans         | `rage-scans`         | https://ragescans.com       | Active   |
| Raven Scans        | `raven-scans`        | https://ravenscans.org      | Active   |
| RD Scans           | `rd-scans`           | https://rdscans.com         | Active   |
| Ritharscans        | `ritharscans`        | https://ritharscans.com     | Active   |
| Rizz Fables        | `rizz-fables`        | https://rizzfables.com      | Active   |
| Rokari Comics      | `rokari-comics`      | https://rokaricomics.com    | Active   |
| Spider Scans       | `spider-scans`       | https://spiderscans.xyz     | Active   |
| Stonescape         | `stonescape`         | https://stonescape.xyz      | Active   |
| Temple Scan        | `temple-scan`        | https://templetoons.com     | Active   |
| Thunderscans       | `thunderscans`       | https://en-thunderscans.com | Active   |
| TopManhua          | `topmanhua`          | https://manhuatop.org       | Active   |
| UTOON              | `utoon`              | https://utoon.net           | Active   |
| Violetscans        | `violetscans`        | https://violetscans.org     | Active   |
| Vortex Scans       | `vortex-scans`       | https://vortexscans.org     | Active   |
| WEBTOON            | `webtoon`            | https://www.webtoons.com    | Active   |
| WeebCentral        | `weebcentral`        | https://weebcentral.com     | Active   |
| Weebdex            | `weebdex`            | https://weebdex.org         | Active   |
| WitchScans         | `witchscans`         | https://witchscans.com      | Active   |
| Writers' Scans     | `writers-scans`      | https://writerscans.com     | Active   |
| Yaksha Comics      | `yaksha-comics`      | https://yakshacomics.com    | Active   |
| Yaksha Scans       | `yaksha-scans`       | https://yakshascans.com     | Active   |

## Setup

```bash
git clone https://github.com/GooglyBlox/comick-source-api.git
cd comick-source-api
npm install
npm run dev
```

Runs on http://localhost:3000

**Production:**
```bash
npm run build
npm start
```

## API

### GET /api/sources

List all supported sources.

```json
{
  "sources": [
    {
      "id": "mangapark",
      "name": "MangaPark",
      "baseUrl": "https://mangapark.io",
      "description": "MangaPark - https://mangapark.io",
      "clientOnly": false,
      "type": "aggregator"
    }
  ]
}
```

### POST /api/search

Search manga across sources.

```json
{
  "query": "solo leveling",
  "source": "mangapark"  // or "all"
}
```

### POST /api/chapters

Get chapter list for a manga.

```json
{
  "url": "https://mangapark.io/title/75577-en-solo-leveling",
  "source": "mangapark"  // optional, auto-detected
}
```

### GET /api/health

Check source status. Cached for 5 minutes. Returns `cached` and `cacheAge` fields.

### POST /api/health

Force refresh health check cache.

### GET /api/frontpage

List sources with frontpage support and their available sections.

```json
{
  "sources": [
    {
      "sourceId": "comix",
      "sourceName": "Comix",
      "availableSections": [
        {
          "id": "trending",
          "title": "Most Recent Popular",
          "type": "trending",
          "supportsTimeFilter": true,
          "availableTimeFilters": [1, 7, 30, 90, 180, 365]
        }
      ]
    }
  ],
  "sourceIds": ["comix"]
}
```

### POST /api/frontpage

Fetch frontpage section data from a source.

```json
{
  "source": "comix",
  "section": "trending",
  "page": 1,
  "limit": 30,
  "days": 7
}
```

**Available sections for Comix:**
- `trending` - Most Recent Popular (supports time filter)
- `most_followed` - Most Followed New Comics (supports time filter)
- `latest_hot` - Latest Updates (Hot)
- `latest_new` - Latest Updates (New)
- `recently_added` - Recently Added
- `completed` - Complete Series

### GET /api/proxy/html

Proxy requests to AsuraScans and WeebCentral (CORS workaround).

```
GET /api/proxy/html?url=https://asuracomic.net/...
```

## Usage

```bash
curl -X POST https://comick-source-api.notaspider.dev/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "one piece", "source": "all"}'
```

```javascript
const res = await fetch("https://comick-source-api.notaspider.dev/api/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "chainsaw man", source: "all" })
});
```

## Development

```bash
npm run dev          # dev server
npm run build        # production build
npm test             # run tests
npm run test:sources # test scrapers
npm run lint         # eslint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding sources.

## Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/GooglyBlox/comick-source-api)

```bash
docker build -t comick-source-api .
docker run -p 3000:3000 comick-source-api
```

No environment variables required.

## License

For educational purposes. Respect source website ToS.
