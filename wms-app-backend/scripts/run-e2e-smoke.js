/**
 * Run full in-process E2E smoke suite (no HTTP server required).
 *
 *   node scripts/run-e2e-smoke.js
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const suites = [
  { name: "Routing matrix", file: "routing-settings-unit-smoke.js" },
  { name: "ModernWMS + closed loops", file: "modernwms-closed-loop-smoke.js" },
  { name: "E2E extended cases", file: "e2e-extended-smoke.js" },
];

const summary = [];

console.log("\n╔══════════════════════════════════════════╗");
console.log("║  WMS Linker — full E2E smoke (in-process) ║");
console.log("╚══════════════════════════════════════════╝\n");

for (const suite of suites) {
  console.log(`\n▶ ${suite.name}\n${"─".repeat(44)}`);
  const script = path.join(__dirname, suite.file);
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MOCK_MODERNWMS: process.env.MOCK_MODERNWMS || "1" },
  });
  const pass = result.status === 0;
  summary.push({ name: suite.name, pass });
  if (!pass) {
    console.error(`\n✗ ${suite.name} FAILED (exit ${result.status})\n`);
  } else {
    console.log(`\n✓ ${suite.name} passed\n`);
  }
}

console.log("\n════════════════ SUMMARY ════════════════\n");
let failed = 0;
for (const row of summary) {
  const mark = row.pass ? "PASS" : "FAIL";
  console.log(`  ${mark}  ${row.name}`);
  if (!row.pass) failed += 1;
}
console.log(`\n${summary.length - failed}/${summary.length} suites passed\n`);
process.exit(failed ? 1 : 0);
