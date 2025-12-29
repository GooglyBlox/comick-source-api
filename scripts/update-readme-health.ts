import * as fs from "fs";
import * as path from "path";

const API_URL =
  process.env.API_URL || "https://comick-source-api.notaspider.dev";

interface SourceHealthResult {
  status: "healthy" | "cloudflare" | "timeout" | "error";
  message: string;
  responseTime?: number;
  lastChecked: string;
}

interface HealthResponse {
  sources: {
    [sourceId: string]: SourceHealthResult;
  };
  cached?: boolean;
  cacheAge?: number;
}

async function fetchHealthFromAPI(): Promise<HealthResponse["sources"]> {
  console.log(`Fetching health status from ${API_URL}/api/health...`);

  const response = await fetch(`${API_URL}/api/health`, {
    headers: {
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch health: HTTP ${response.status}`);
  }

  const data: HealthResponse = await response.json();
  console.log(
    `Received health data for ${Object.keys(data.sources).length} sources`,
  );

  if (data.cached) {
    console.log(`  (cached response, age: ${data.cacheAge}s)`);
  }

  return data.sources;
}

interface TableRow {
  sourceName: string;
  sourceId: string;
  baseUrl: string;
  status: string;
}

function updateReadme(healthResults: HealthResponse["sources"]): boolean {
  const readmePath = path.join(process.cwd(), "README.md");
  let readme = fs.readFileSync(readmePath, "utf-8");
  let hasChanges = false;

  // Status mapping: healthy = Active, anything else = Unstable
  const getStatusText = (status: string): string => {
    return status === "healthy" ? "Active" : "Unstable";
  };

  // Table format: | Source | ID | Base URL | Status |
  const tableRowRegex =
    /^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*(Active|Unstable)\s*\|$/gm;

  const rows: TableRow[] = [];
  let match;
  while ((match = tableRowRegex.exec(readme)) !== null) {
    const [, sourceName, sourceId, baseUrl, currentStatus] = match;
    const health = healthResults[sourceId];
    let newStatus = currentStatus.trim();

    if (health) {
      const computedStatus = getStatusText(health.status);
      if (currentStatus.trim() !== computedStatus) {
        console.log(
          `  Updating ${sourceId}: ${currentStatus.trim()} -> ${computedStatus} (${health.status}: ${health.message})`,
        );
        hasChanges = true;
        newStatus = computedStatus;
      }
    } else {
      console.log(`  No health data for ${sourceId}, keeping current status`);
    }

    rows.push({
      sourceName: sourceName.trim(),
      sourceId,
      baseUrl: baseUrl.trim(),
      status: newStatus,
    });
  }

  const originalOrder = rows.map((r) => r.sourceName).join(",");
  rows.sort((a, b) =>
    a.sourceName.toLowerCase().localeCompare(b.sourceName.toLowerCase()),
  );
  const sortedOrder = rows.map((r) => r.sourceName).join(",");

  if (originalOrder !== sortedOrder) {
    console.log("  Reordering sources alphabetically");
    hasChanges = true;
  }

  const colWidths = {
    source: Math.max(12, ...rows.map((r) => r.sourceName.length)),
    id: Math.max(14, ...rows.map((r) => r.sourceId.length + 2)),
    url: Math.max(25, ...rows.map((r) => r.baseUrl.length)),
    status: 8,
  };

  const header = `| ${"Source".padEnd(colWidths.source)} | ${"ID".padEnd(colWidths.id)} | ${"Base URL".padEnd(colWidths.url)} | ${"Status".padEnd(colWidths.status)} |`;
  const separator = `| ${"-".repeat(colWidths.source)} | ${"-".repeat(colWidths.id)} | ${"-".repeat(colWidths.url)} | ${"-".repeat(colWidths.status)} |`;
  const tableRows = rows.map((row) => {
    const id = `\`${row.sourceId}\``;
    return `| ${row.sourceName.padEnd(colWidths.source)} | ${id.padEnd(colWidths.id)} | ${row.baseUrl.padEnd(colWidths.url)} | ${row.status.padEnd(colWidths.status)} |`;
  });

  const newTable = [header, separator, ...tableRows].join("\n");

  const fullTableRegex =
    /\| Source\s*\| ID\s*\| Base URL\s*\| Status\s*\|[\s\S]*?(?=\n\n)/;
  readme = readme.replace(fullTableRegex, newTable);

  if (hasChanges) {
    fs.writeFileSync(readmePath, readme);
    console.log("\nREADME.md updated with new health statuses.");
  } else {
    console.log("\nNo changes needed in README.md.");
  }

  return hasChanges;
}

async function main() {
  console.log("=== Source Health Check ===\n");

  const healthResults = await fetchHealthFromAPI();

  console.log("\n=== Current Health Status ===\n");
  for (const [sourceId, health] of Object.entries(healthResults)) {
    const icon = health.status === "healthy" ? "✓" : "✗";
    console.log(`  ${icon} ${sourceId}: ${health.status} - ${health.message}`);
  }

  console.log("\n=== Updating README ===\n");

  const hasChanges = updateReadme(healthResults);

  console.log("\n=== Summary ===");
  const healthy = Object.values(healthResults).filter(
    (r) => r.status === "healthy",
  ).length;
  const unhealthy = Object.values(healthResults).length - healthy;

  console.log(`  Healthy: ${healthy}`);
  console.log(`  Unhealthy: ${unhealthy}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_changes=${hasChanges}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `healthy_count=${healthy}\n`);
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `unhealthy_count=${unhealthy}\n`,
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Error running health check:", error);
  process.exit(1);
});
