// Media Compiler CLI — thin wrapper over the Media Compiler HTTP API.
// Same engine as the web app; no duplicated logic.
// Usage: node scripts/mc-check.mjs --url http://localhost:3000 --contract <id> --asset <id>
// Exit 0 when the build passes, 1 otherwise (suitable for CI gates).
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const base = (args.url ?? process.env.MEDIA_COMPILER_URL ?? "").replace(/\/$/, "");
const contractId = args.contract ?? process.env.MEDIA_COMPILER_CONTRACT;
const sourceAssetId = args.asset ?? process.env.MEDIA_COMPILER_ASSET;

if (!base || !contractId || !sourceAssetId) {
  console.error("Usage: mc-check --url <app-url> --contract <id> --asset <id>");
  process.exit(2);
}

const post = async (path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { build } = await post("/api/builds", { sourceAssetId, contractId });
console.log(`Build #${build.number} queued (${build.id}) — ${build.contractName}`);

const deadline = Date.now() + 5 * 60 * 1000;
let detail;
for (;;) {
  const res = await fetch(`${base}/api/builds/${build.id}`);
  if (!res.ok) throw new Error(`build poll → HTTP ${res.status}`);
  detail = await res.json();
  if (["PASSED", "REVIEW_REQUIRED", "FAILED", "RELEASED"].includes(detail.build.status)) break;
  if (Date.now() > deadline) throw new Error("timed out waiting for build");
  await sleep(2000);
}

console.log("\nMedia Compiler");
console.log(`\nContract:\n${detail.build.contractName} v${detail.build.contractVersion}`);
console.log("\nArtifacts:");
const latest = new Map(detail.artifacts.map((a) => [a.variant, a]));
for (const [v, a] of [...latest.values()].map((a) => [a.variant, a])) {
  const fails = detail.qa.filter((q) => q.artifactId === a.id && q.status === "FAIL");
  console.log(`${fails.length === 0 ? "✓" : "✕"} ${v}${a.version > 1 ? ` (v${a.version})` : ""}`);
  for (const f of fails) console.log(`  ${f.rule}: ${f.message}`);
}
console.log(`\nRepairs: ${detail.repairs.length}`);
console.log(`\nBuild:\n${detail.build.status}`);

if (detail.build.status === "PASSED" || detail.build.status === "RELEASED") {
  process.exit(0);
}
process.exit(1);
