#!/usr/bin/env node

import { getAppIdentity } from "../src/mac-adapter.mjs";
import {
  evaluateAppPolicy,
  grantApproval,
  loadAppPolicy,
} from "../src/policy.mjs";

function usage() {
  console.error(
    "Usage: node scripts/approve-app.mjs <app> [--scope read|actions]",
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const appParts = [];
  let scope = "actions";

  while (args.length) {
    const arg = args.shift();
    if (arg === "--scope") {
      scope = args.shift() || "";
    } else {
      appParts.push(arg);
    }
  }

  return {
    app: appParts.join(" ").trim(),
    scope,
  };
}

async function main() {
  const { app, scope } = parseArgs(process.argv.slice(2));
  if (!app || !["read", "actions"].includes(scope)) {
    usage();
    process.exitCode = 2;
    return;
  }

  const policy = await loadAppPolicy();
  const identity = await getAppIdentity(app);
  if (!identity.ok) {
    throw new Error(identity.error?.message || `Invalid app: ${app}`);
  }

  const policyResult = evaluateAppPolicy(policy, identity.app);
  if (!policyResult.ok) {
    throw new Error(policyResult.message);
  }

  const approval = await grantApproval(
    policy,
    identity.app,
    scope,
    "manual_cli",
  );
  if (!approval.ok) {
    throw new Error(approval.message);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        app: identity.app,
        approval: approval.approval,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
