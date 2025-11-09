# Contributing to Comick Source API

Thanks for your interest in contributing! Here's what you need to know.

## Before You Start

**Check if the source is Cloudflare-protected 24/7.** If it is, don't bother submitting it - we can't support sources that are constantly behind Cloudflare protection. Test the source multiple times over several hours to confirm it's accessible.

## Adding a New Source

### 1. Check Source Viability

Before writing any code:

- Visit the manga source website
- Check if it's accessible without CAPTCHA or Cloudflare challenges
- Verify it has a search function and chapter listings
- Test it multiple times over different hours/days
- If you hit Cloudflare protection every time, **stop here** - the source isn't viable

### 2. Implement the Scraper

Create a new file in `src/lib/scrapers/your-source.ts`:

```typescript
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";
import * as cheerio from "cheerio";

export class YourSourceScraper extends BaseScraper {
  getName(): string {
    return "YourSource";
  }

  getBaseUrl(): string {
    return "https://yoursource.com";
  }

  canHandle(url: string): boolean {
    return url.includes("yoursource.com");
  }

  async search(query: string): Promise<SearchResult[]> {
    const response = await fetch(
      `${this.getBaseUrl()}/search?q=${encodeURIComponent(query)}`,
    );
    const html = await response.text();
    const $ = cheerio.load(html);

    // Your scraping logic here
    return [];
  }

  async getChapters(url: string): Promise<ScrapedChapter[]> {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Your scraping logic here
    return [];
  }
}
```

### 3. Register Your Scraper

Add it to `src/lib/scrapers/index.ts`:

```typescript
import { YourSourceScraper } from "./your-source";

const scrapers: BaseScraper[] = [
  // ... existing scrapers
  new YourSourceScraper(),
];
```

### 4. Write Tests (Non-Negotiable)

**No tests = no merge.** Add tests in `src/tests/sources/scrapers.test.ts`:

```typescript
describe("YourSource", () => {
  const scraper = new YourSourceScraper();

  it("should handle YourSource URLs", () => {
    expect(scraper.canHandle("https://yoursource.com/manga/123")).toBe(true);
    expect(scraper.canHandle("https://othersource.com/manga/123")).toBe(false);
  });

  it("should search for manga", async () => {
    const results = await scraper.search("one piece");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("title");
    expect(results[0]).toHaveProperty("url");
    expect(results[0].url).toContain("yoursource.com");
  }, 10000);

  it("should get chapter list", async () => {
    const chapters = await scraper.getChapters(
      "https://yoursource.com/manga/one-piece",
    );

    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0]).toHaveProperty("number");
    expect(chapters[0]).toHaveProperty("url");
  }, 10000);
});
```

Run tests before submitting:

```bash
npm test
npm run test:sources  # Must pass
```

### 5. Update Documentation

Add your source to the table in `README.md` under "Supported Sources".

## Code Quality Requirements

- **TypeScript**: No `any` types unless absolutely necessary
- **Error Handling**: Wrap fetch calls in try-catch blocks
- **Consistent Formatting**: Run `npm run lint` before committing
- **No Console Logs**: Remove debugging console.logs before submitting
- **Clear Naming**: Use descriptive variable names, not `x`, `y`, `data`

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b add-yoursource-scraper`
3. Implement scraper + tests
4. Run all tests: `npm test` (must pass)
5. Run linter: `npm run lint` (must pass)
6. Commit with clear message: `feat: add YourSource scraper`
7. Push and create PR

### PR Checklist

Your PR **must** include:

- [ ] New scraper implementation
- [ ] Tests with >80% coverage
- [ ] Proof that source works (screenshot or testing notes)
- [ ] Confirmation that source is not Cloudflare-protected 24/7
- [ ] Updated README with source details
- [ ] All existing tests still pass
- [ ] No TypeScript errors
- [ ] No linter warnings

## What Gets Rejected

PRs will be immediately closed if:

- No tests included
- Tests don't pass
- Source is Cloudflare-protected 24/7
- Code doesn't follow existing patterns
- TypeScript errors present
- Scrapes actual manga images (metadata only!)

## Testing Guidelines

### Manual Testing

Before submitting, manually test:

1. Search functionality returns relevant results
2. Chapter lists are accurate and in order
3. All URLs are valid
4. The source doesn't require login/authentication
5. The source is accessible from different IPs/locations

### Automated Testing

Tests should verify:

- URL pattern matching works
- Search returns array of SearchResult objects
- Chapters returns array of ScrapedChapter objects
- Each result has required fields (title, url, etc.)
- Results are from the correct source

## Common Issues

### "My source works but tests fail"

- Website structure may vary by region/IP
- Try from different network
- Check if you're hitting rate limits
- Verify HTML selectors are correct

### "Source intermittently blocked by Cloudflare"

- If it's blocked >50% of the time, don't submit
- Intermittent protection is okay, but note it in PR
- We may mark it as "unstable" in documentation

## Questions?

Open an issue first if you're unsure about:

- Whether a source is viable
- Implementation approach
- Testing strategy

## Code of Conduct

Be professional. Don't be a jerk. Respect maintainer decisions.

---

That's it. Write good code, write good tests, and we'll merge it.
