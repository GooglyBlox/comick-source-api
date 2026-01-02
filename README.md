# Comick Source API

Next.js API for scraping manga metadata from multiple sources.

[Live API](https://comick-source-api.notaspider.dev) | [Userscript](https://greasyfork.org/en/scripts/555280-comick-source-linker)

| Source       | ID             | Base URL                  | Status   |
| ------------ | -------------- | ------------------------- | -------- |
| AsuraScan    | `asurascan`    | https://asuracomic.net    | Active   |
| AtsuMoe      | `atsumoe`      | https://atsumoe.com       | Active   |
| Bato         | `bato`         | https://bato.to           | Unstable |
| Comix        | `comix`        | https://comix.to          | Active   |
| Falcon Scans | `falcon-scans` | https://falconscans.com   | Unstable |
| FlameComics  | `flamecomics`  | https://flamecomics.xyz   | Active   |
| KaliScan     | `kaliscan`     | https://kaliscan.com      | Active   |
| LagoonScans  | `lagoonscans`  | https://lagoonscans.com   | Active   |
| LikeManga    | `likemanga`    | https://likemanga.io      | Active   |
| Mangago      | `mangago`      | https://www.mangago.zone  | Active   |
| Mangaloom    | `mangaloom`    | https://mangaloom.com     | Active   |
| MangaPark    | `mangapark`    | https://mangapark.io      | Active   |
| MangaRead    | `mangaread`    | https://mangaread.org     | Active   |
| Mangataro    | `mangataro`    | https://mangataro.org     | Active   |
| MangaYY      | `mangayy`      | https://mangayy.org       | Active   |
| ManhuaUS     | `manhuaus`     | https://manhuaus.com      | Unstable |
| Mgeko        | `mgeko`        | https://mgeko.cc          | Active   |
| NovelCool    | `novelcool`    | https://www.novelcool.com | Active   |
| Project Suki | `project-suki` | https://projectsuki.com   | Active   |
| Raven Scans  | `raven-scans`  | https://ravenscans.org    | Active   |
| Rizz Fables  | `rizz-fables`  | https://rizzfables.com    | Active   |
| Stonescape   | `stonescape`   | https://stonescape.xyz    | Unstable |
| TopManhua    | `topmanhua`    | https://manhuatop.org     | Active   |
| WeebCentral  | `weebcentral`  | https://weebcentral.com   | Unstable |
| Weebdex      | `weebdex`      | https://weebdex.org       | Active   |

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
