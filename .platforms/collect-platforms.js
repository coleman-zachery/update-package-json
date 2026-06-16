// collect-platforms.js

const { writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");

const TARGETS = ["esbuild", "rolldown", "rollup", "@swc/core"];
const REGISTRY_URL = "https://registry.npmjs.org";
const CONCURRENCY = 16;
const OUTPUT_JSON_FILE = "platforms.json";
const OUTPUT_TS_FILE = resolve(
  __dirname,
  "../web/src/lib/resolver/platform-targets/catalog.generated.ts"
);

const toArray = value =>
  value == null ? [] : Array.isArray(value) ? value : [value];

const getLatestManifest = packument => {
  const latest = packument?.["dist-tags"]?.latest;
  return latest ? packument.versions?.[latest] ?? null : null;
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }

  return response.json();
}

async function fetchLatestManifest(pkg) {
  const packument = await fetchJson(
    `${REGISTRY_URL}/${encodeURIComponent(pkg)}`
  );

  return packument ? getLatestManifest(packument) : null;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      worker
    )
  );

  return results;
}

function getPlatformKeys(manifest) {
  const os = toArray(manifest?.os);
  const cpu = toArray(manifest?.cpu);
  const libc = toArray(manifest?.libc);

  if (os.length === 0 || cpu.length === 0) return [];

  return os.flatMap(osValue =>
    cpu.flatMap(cpuValue =>
      libc.length === 0
        ? [`${osValue}-${cpuValue}`]
        : libc.map(libcValue => `${osValue}-${cpuValue}-${libcValue}`)
    )
  );
}

async function collectPlatformPackages(targets) {
  const packages = new Set();

  for (const target of targets) {
    console.error(`Scanning ${target}...`);

    const manifest = await fetchLatestManifest(target);

    if (!manifest) {
      console.warn(`Skipping unavailable package: ${target}`);
      continue;
    }

    for (const pkg of Object.keys(manifest.optionalDependencies ?? {})) {
      packages.add(pkg);
    }
  }

  return [...packages].sort();
}

async function collectPlatforms(platformPackages) {
  const manifests = await mapLimit(
    platformPackages,
    CONCURRENCY,
    fetchLatestManifest
  );

  const platforms = new Set();

  for (const manifest of manifests) {
    for (const key of getPlatformKeys(manifest)) {
      platforms.add(key);
    }
  }

  return [...platforms].sort((a, b) => a.localeCompare(b));
}

function formatTsModule(platforms) {
  const lines = [
    "export const HISTORICAL_PLATFORM_TARGETS = [",
    ...platforms.map(platform => `  '${platform}',`),
    "] as const",
    "",
  ];

  return lines.join("\n");
}

async function main() {
  const platformPackages = await collectPlatformPackages(TARGETS);

  console.error(`Found ${platformPackages.length} unique platform packages`);

  const platforms = await collectPlatforms(platformPackages);

  await Promise.all([
    writeFile(OUTPUT_JSON_FILE, `${JSON.stringify(platforms, null, 2)}\n`),
    writeFile(OUTPUT_TS_FILE, formatTsModule(platforms)),
  ]);

  console.error(`Wrote ${platforms.length} unique platforms to ${OUTPUT_JSON_FILE}`);
  console.error(`Updated generated catalog at ${OUTPUT_TS_FILE}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
