import "./env.js";
import { db } from "@workspace/db";
import { runCleanup, ABANDONED_USER_DAYS_DEFAULT } from "./lib/maintenance-cleanup.js";

function parseArgs(argv) {
  const args = {
    scopes: [],
    dryRun: true,
    secret: process.env.MAINTENANCE_SECRET,
    agedDays: ABANDONED_USER_DAYS_DEFAULT,
    now: new Date(),
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const [flag, value] = raw.split("=");
    switch (flag) {
      case "--scope":
      case "-s":
        args.scopes.push(value ?? argv[++i]);
        break;
      case "--aged-days":
        args.agedDays = Number(value ?? argv[++i]);
        break;
      case "--secret":
        args.secret = value ?? argv[++i];
        break;
      case "--yes":
      case "--run":
        args.dryRun = false;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${raw}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage: node src/maintenance-cli.js [options]",
    "",
    "Permanently deletes maintenance-selected data. Requires MAINTENANCE_SECRET",
    "(via --secret or environment). Refuses to run without it.",
    "",
    "Options:",
    "  -s, --scope <name>     Cleanup scope (repeatable).",
    "                         Available: soft-deleted-sessions, abandoned-users",
    "  --aged-days <n>        Abandoned-users cutoff age in days (default 30).",
    "  --secret <value>       Maintenance secret (default: env MAINTENANCE_SECRET).",
    "  --dry-run              Print counts without deleting (default).",
    "  --yes, --run           Execute the deletions.",
    "  -h, --help             Show this help.",
  ].join("\n");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.log(usage());
    return;
  }

  const result = await runCleanup({
    secret: args.secret,
    dryRun: args.dryRun,
    scopes: args.scopes,
    agedDays: args.agedDays,
    now: args.now,
    db,
  });

  console.log(JSON.stringify({ mode: result.dryRun ? "dry-run" : "run", scopes: result.scopes }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});