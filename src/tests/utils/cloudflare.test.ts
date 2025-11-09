import { describe, it, expect } from "vitest";
import { detectCloudflare } from "@/lib/utils/source-health";

describe("Cloudflare Detection", () => {
  it("should detect Cloudflare challenge page", () => {
    const html = `
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <h1>Checking your browser before accessing the website.</h1>
          <p>This process is automatic. Your browser will redirect to your requested content shortly.</p>
          <div id="cf-chl-bypass"></div>
        </body>
      </html>
    `;

    expect(detectCloudflare(html)).toBe(true);
  });

  it("should detect Cloudflare DDoS protection", () => {
    const html = `
      <html>
        <head><title>DDoS protection by Cloudflare</title></head>
        <body>
          <h1>Please enable JavaScript and cookies to continue</h1>
        </body>
      </html>
    `;

    expect(detectCloudflare(html)).toBe(true);
  });

  it("should detect Cloudflare attention required page", () => {
    const html = `
      <html>
        <body>
          <h1>Attention Required! | Cloudflare</h1>
          <div class="challenge-platform">
            <p>Please complete the security check to access the website</p>
          </div>
        </body>
      </html>
    `;

    expect(detectCloudflare(html)).toBe(true);
  });

  it("should not detect Cloudflare on normal page", () => {
    const html = `
      <html>
        <head><title>Solo Leveling - Chapter 1</title></head>
        <body>
          <h1>Solo Leveling</h1>
          <div class="chapter-list">
            <a href="/chapter-1">Chapter 1</a>
          </div>
        </body>
      </html>
    `;

    expect(detectCloudflare(html)).toBe(false);
  });

  it("should not false positive on pages mentioning cloudflare in content", () => {
    const html = `
      <html>
        <head><title>My Website</title></head>
        <body>
          <h1>Welcome</h1>
          <p>This site is protected by various services, but is currently accessible.</p>
          <div class="content">Normal content here</div>
        </body>
      </html>
    `;

    expect(detectCloudflare(html)).toBe(false);
  });
});
