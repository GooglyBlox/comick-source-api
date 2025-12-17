# Comick Source API

A RESTful API built with Next.js 14 for scraping manga and comic metadata from multiple sources. Search across various manga websites, retrieve chapter lists, and monitor source health - all through a unified API interface.

> **Looking for the userscript?** Check out the [Comick Source Linker on GreasyFork](https://greasyfork.org/en/scripts/555280-comick-source-linker)

| Source       | ID             | Base URL                  | Status |
| -----------  | -------------  | ------------------------- | ------ |
| MangaPark | `mangapark` | https://mangapark.io | Active |
| AsuraScan | `asurascan` | https://asuracomic.net | Active |
| AtsuMoe      | `atsumoe`      | https://atsumoe.com       | Active |
| WeebCentral | `weebcentral` | https://weebcentral.com | Unstable | 
| LikeManga | `likemanga` | https://likemanga.io | Active |
| ManhuaUS | `manhuaus` | https://manhuaus.com | Unstable |
| MangaRead    | `mangaread`    | https://mangaread.org     | Active |
| Mgeko | `mgeko` | https://mgeko.cc | Active |
| NovelCool    | `novelcool`    | https://www.novelcool.com | Active |
| FlameComics | `flamecomics` | https://flamecomics.xyz | Active |
| Bato | `bato` | https://bato.to | Unstable |
| Mangaloom | `mangaloom` | https://mangaloom.com | Active |
| MangaYY | `mangayy` | https://mangayy.org | Active |
| TopManhua | `topmanhua` | https://manhuatop.org | Active |
| LagoonScans  | `lagoonscans`  | https://lagoonscans.com   | Active |
| Stonescape   | `stonescape`   | https://stonescape.xyz    | Active |
| Rizz Fables  | `rizz-fables`  | https://rizzfables.com    | Active |
| Falcon Scans | `falcon-scans` | https://falconscans.com | Unstable |
| Raven Scans | `raven-scans` | https://ravenscans.com | Active |
| Comix        | `comix`        | https://comix.to          | Active |

## Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm/yarn
- Internet connection for scraping sources

### Installation

```bash
# Clone the repository
git clone https://github.com/GooglyBlox/comick-source-api.git
cd comick-source-api

# Install dependencies
npm install

# Run development server
npm run dev
```

The API will be available at [http://localhost:3000](http://localhost:3000) (or live at [https://comick-source-api.notaspider.dev](https://comick-source-api.notaspider.dev))

### Production Build

```bash
npm run build
npm start
```

## API Documentation

All endpoints return JSON responses. The API is self-documenting with an interactive UI at the root path.

### 1. Get Available Sources

```http
GET /api/sources
```

Returns a list of all supported manga sources.

**Response:**

```json
{
  "sources": [
    {
      "id": "mangapark",
      "name": "MangaPark",
      "baseUrl": "https://mangapark.io",
      "description": "MangaPark - https://mangapark.io"
    }
  ]
}
```

### 2. Search for Manga

```http
POST /api/search
Content-Type: application/json
```

Search for manga across one or all sources.

**Request Body:**

```json
{
  "query": "solo leveling",
  "source": "mangapark" // or "all" for all sources
}
```

**Response (single source):**

```json
{
  "results": [
    {
      "id": "343921",
      "title": "Solo Leveling",
      "url": "https://mangapark.io/title/75577-en-solo-leveling",
      "coverImage": "https://...",
      "latestChapter": 179,
      "lastUpdated": "2 days ago",
      "rating": 4.8,
      "followers": "1.2M"
    }
  ],
  "source": "MangaPark"
}
```

**Response (all sources):**

```json
{
  "sources": [
    {
      "source": "MangaPark",
      "results": [
        /* search results */
      ]
    },
    {
      "source": "AsuraScan",
      "results": [
        /* search results */
      ]
    }
  ]
}
```

### 3. Get Chapter List

```http
POST /api/chapters
Content-Type: application/json
```

Retrieve all chapters for a specific manga.

**Request Body:**

```json
{
  "url": "https://mangapark.io/title/75577-en-solo-leveling",
  "source": "mangapark" // optional, auto-detected from URL
}
```

**Response:**

```json
{
  "chapters": [
    {
      "id": "1",
      "number": 1,
      "title": "Chapter 1",
      "url": "https://mangapark.io/title/75577-en-solo-leveling/2633607-vol-1-ch-1"
    },
    {
      "id": "2",
      "number": 2,
      "title": "Chapter 2",
      "url": "https://mangapark.io/title/75577-en-solo-leveling/1703522-ch-2"
    }
  ],
  "source": "MangaPark",
  "totalChapters": 179
}
```

### 4. Health Check

```http
GET /api/health
```

Check the operational status of all sources. Results are cached for 5 minutes.

**Response:**

```json
{
  "sources": {
    "mangapark": {
      "status": "healthy",
      "message": "Source is operational",
      "responseTime": 1234,
      "lastChecked": "2025-01-08T12:34:56.789Z"
    },
    "asurascan": {
      "status": "cloudflare",
      "message": "Cloudflare protection detected",
      "responseTime": 2456,
      "lastChecked": "2025-01-08T12:34:56.789Z"
    }
  }
}
```

**Status Types:**

- `healthy` - Source is operational
- `cloudflare` - Cloudflare protection detected
- `timeout` - Response time exceeded threshold
- `error` - Source returned an error

## Usage Examples

### cURL

```bash
# Search all sources
curl -X POST https://comick-source-api.notaspider.dev/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "one piece", "source": "all"}'

# Get chapters from specific manga
curl -X POST https://comick-source-api.notaspider.dev/api/chapters \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mangapark.io/title/75577-en-solo-leveling"}'

# Check source health
curl https://comick-source-api.notaspider.dev/api/health
```

### JavaScript/TypeScript

```typescript
// Search for manga
const searchResponse = await fetch("https://comick-source-api.notaspider.dev/api/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "chainsaw man",
    source: "mangapark",
  }),
});
const searchData = await searchResponse.json();

// Get chapters
const chaptersResponse = await fetch("https://comick-source-api.notaspider.dev/api/chapters", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "https://mangapark.io/title/75577-en-solo-leveling",
    source: "mangapark",
  }),
});
const chaptersData = await chaptersResponse.json();
```

### Python

```python
import requests

# Search manga
response = requests.post('https://comick-source-api.notaspider.dev/api/search', json={
    'query': 'jujutsu kaisen',
    'source': 'all'
})
results = response.json()

# Get chapters
response = requests.post('https://comick-source-api.notaspider.dev/api/chapters', json={
    'url': 'https://mangapark.io/title/75577-en-solo-leveling'
})
chapters = response.json()
```

## Development

Want to add a new manga source or contribute? See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.


**Quick Commands:**
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm test             # Run tests
npm run test:sources # Test scrapers
npm run lint         # Run ESLint
```

## Important Notes

- **Metadata only** - No images or copyrighted content scraped
- **Cloudflare-protected sources** return `cloudflare` status
- **Health checks** cached for 5 minutes
- Educational and personal use only

## Deployment

**Vercel:** 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/GooglyBlox/comick-source-api)

**Docker:**
```bash
docker build -t comick-source-api .
docker run -p 3000:3000 comick-source-api
```

No environment variables required.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. PRs must include tests.

## License

Educational purposes only. Respect source website terms of service.
