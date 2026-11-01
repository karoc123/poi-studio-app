#!/usr/bin/env node
// tests/runner.js
// Standalone automated test runner for Collaborative Trip & POI Planner
// Executes opaque-box E2E test suites across Tiers 1-4 with exit code 0 on pass.

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const TESTS_DIR = path.resolve(__dirname);

// Catalog of all test suites organized by Tier and Feature
const TEST_CATALOG = {
  tier1: [
    { suite: 'Tier 1: Auth & User Profile', file: 'tier1-feature/auth.test.js' },
    { suite: 'Tier 1: Trip Lifecycle & Dashboard', file: 'tier1-feature/trips.test.js' },
    { suite: 'Tier 1: RBAC & Collaboration', file: 'tier1-feature/rbac.test.js' },
    { suite: 'Tier 1: Interactive Map & Search', file: 'tier1-feature/map.test.js' },
    { suite: 'Tier 1: Itinerary & Routing', file: 'tier1-feature/itinerary.test.js' },
    { suite: 'Tier 1: Portability & Exports', file: 'tier1-feature/portability.test.js' },
  ],
  tier2: [
    { suite: 'Tier 2: Auth Boundary & Corner Cases', file: 'tier2-boundary/auth-boundary.test.js' },
    { suite: 'Tier 2: Trip Lifecycle Boundary', file: 'tier2-boundary/trips-boundary.test.js' },
    { suite: 'Tier 2: RBAC Boundary', file: 'tier2-boundary/rbac-boundary.test.js' },
    { suite: 'Tier 2: Map & Search Boundary', file: 'tier2-boundary/map-boundary.test.js' },
    { suite: 'Tier 2: Itinerary Boundary', file: 'tier2-boundary/itinerary-boundary.test.js' },
    { suite: 'Tier 2: Portability Boundary', file: 'tier2-boundary/portability-boundary.test.js' },
  ],
  tier3: [
    { suite: 'Tier 3: Cross-Feature Combinations', file: 'tier3-combination/cross-feature.test.js' },
  ],
  tier4: [
    { suite: 'Tier 4: Real-World Scenarios', file: 'tier4-scenario/real-world-scenarios.test.js' },
  ],
};

function printUsage() {
  console.log(`
POI Studio 2 - E2E Test Suite Runner
Usage:
  node tests/runner.js [options]

Options:
  --tier=<1|2|3|4|all>   Run tests for a specific tier (default: all)
  --target=<url>         Execute tests against a live server (sets APP_URL)
  --filter=<pattern>     Filter test files matching pattern
  --list                 List all available test suites without running
  --help                 Show this help message
`);
}

function parseArgs(args) {
  const options = {
    tier: 'all',
    target: null,
    filter: null,
    list: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--list' || arg === '-l') options.list = true;
    else if (arg.startsWith('--tier=')) options.tier = arg.split('=')[1].toLowerCase();
    else if (arg.startsWith('--target=')) options.target = arg.split('=')[1];
    else if (arg.startsWith('--filter=')) options.filter = arg.split('=')[1];
  }

  return options;
}

function resolveFilesToRun(options) {
  let selected = [];

  if (options.tier === 'all') {
    selected = [
      ...TEST_CATALOG.tier1,
      ...TEST_CATALOG.tier2,
      ...TEST_CATALOG.tier3,
      ...TEST_CATALOG.tier4,
    ];
  } else if (TEST_CATALOG[`tier${options.tier}`]) {
    selected = [...TEST_CATALOG[`tier${options.tier}`]];
  } else {
    console.error(`Error: Unknown tier "${options.tier}". Valid tiers are: 1, 2, 3, 4, all`);
    process.exit(1);
  }

  if (options.filter) {
    selected = selected.filter((item) =>
      item.file.includes(options.filter) || item.suite.toLowerCase().includes(options.filter.toLowerCase())
    );
  }

  return selected;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const selectedSuites = resolveFilesToRun(options);

  if (options.list) {
    console.log('\n=== Available Test Suites in Catalog ===');
    for (const item of selectedSuites) {
      console.log(`- [${item.suite}] -> tests/${item.file}`);
    }
    console.log(`Total suites: ${selectedSuites.length}\n`);
    process.exit(0);
  }

  const targetUrl = options.target || process.env.APP_URL || 'Reference Server (Ephemeral LibSQL :memory:)';

  console.log('================================================================');
  console.log('           POI STUDIO 2 — E2E TEST RUNNER');
  console.log('================================================================');
  console.log(`Target:      ${targetUrl}`);
  console.log(`Tier Filter: ${options.tier.toUpperCase()}`);
  console.log(`Suites:      ${selectedSuites.length} test files queued`);
  console.log('----------------------------------------------------------------\n');

  const files = selectedSuites.map((s) => path.join(TESTS_DIR, s.file));
  const env = { ...process.env };
  if (options.target) {
    env.APP_URL = options.target;
  }

  const startTime = Date.now();
  const runResult = spawnSync('node', ['--test', ...files], {
    cwd: ROOT_DIR,
    env,
    stdio: 'inherit',
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n----------------------------------------------------------------');
  if (runResult.status === 0) {
    console.log(`✅ TEST SUITE SUCCESS: All test assertions passed in ${durationSec}s`);
    console.log('================================================================');
    process.exit(0);
  } else {
    console.error(`❌ TEST SUITE FAILED: Exit code ${runResult.status} in ${durationSec}s`);
    console.log('================================================================');
    process.exit(runResult.status || 1);
  }
}

main();
