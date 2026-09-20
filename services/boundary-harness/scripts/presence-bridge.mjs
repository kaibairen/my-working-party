#!/usr/bin/env node
/**
 * Dogfood presence bridge: agent-data dirs → POST /v1/agents/heartbeat.
 * Interim until an official Grok Bot roster API exists. Not SoT.
 *
 * SKIP any directory that contains group.json (CreateChannel).
 * SKIP empty names and names that start with "New ".
 * Never invent 交付同事 / Cursor 同事.
 *
 *   AGENT_DATA_ROOT=/home/box/agent-data/agents \
 *   HARNESS_API_URL=http://127.0.0.1:8080 \
 *   node scripts/presence-bridge.mjs
 *
 *   node scripts/presence-bridge.mjs --once --dry-run
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_AGENT_DATA_ROOT = "/home/box/agent-data/agents";
export const DEFAULT_API_URL = "http://127.0.0.1:8080";
export const DEFAULT_INTERVAL_SECONDS = 30;
export const DEFAULT_TTL_SECONDS = 90;

/** Sidebar section "bot harness" → office 2048工作组. Override via PRESENCE_SECTION_ALIASES_JSON. */
export const DEFAULT_SECTION_ALIASES = {
  "bot harness": "2048工作组",
  botharness: "2048工作组",
  harness: "harness开发",
  "harness-dev": "harness开发",
  "harness开发": "harness开发",
  "2048": "2048工作组",
  "2048工作组": "2048工作组",
};

/** Known 2048 dogfood bots when profile has no group/section. */
export const DEFAULT_NAME_GROUPS = {
  CTO统筹bot: "2048工作组",
  HarnessTechLead: "2048工作组",
  HarnessFrontend: "2048工作组",
  HarnessBackend: "2048工作组",
  HarnessBridge: "2048工作组",
  HarnessQA: "2048工作组",
  Harness体验: "2048工作组",
  Harness调研: "2048工作组",
};

export function parseJsonObject(raw, fallback = {}) {
  if (!raw || typeof raw !== "string") return { ...fallback };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...fallback };
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}

export function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function profileDisplayName(profile) {
  if (!profile || typeof profile !== "object") return "";
  for (const key of ["display_name", "name", "nickname", "title"]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function shouldSkipAgentDir(dirPath, displayName) {
  if (existsSync(join(dirPath, "group.json"))) {
    return { skip: true, reason: "group.json" };
  }
  const name = String(displayName ?? "").trim();
  if (!name) return { skip: true, reason: "empty_name" };
  if (/^New\s/i.test(name)) return { skip: true, reason: "new_placeholder" };
  if (/交付同事|Cursor 同事|群组同事/.test(name)) return { skip: true, reason: "fake_colleague" };
  return { skip: false, reason: "" };
}

export function mapOfficeGroup(profile, displayName, opts = {}) {
  const nameGroups = opts.nameGroups ?? DEFAULT_NAME_GROUPS;
  const sectionAliases = opts.sectionAliases ?? DEFAULT_SECTION_ALIASES;
  const fromProfile = [profile?.group, profile?.section, profile?.team_group]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find(Boolean);
  if (fromProfile) {
    return sectionAliases[fromProfile] ?? sectionAliases[fromProfile.toLowerCase()] ?? fromProfile;
  }
  const name = String(displayName ?? "").trim();
  if (nameGroups[name]) return nameGroups[name];
  if (/^Harness/i.test(name) && !/2048|CTO/i.test(name)) return "harness开发";
  return "其他";
}

export function asciiActor(dirName, displayName) {
  const raw = String(dirName || displayName || "bot");
  const ascii = raw
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return ascii || "bot";
}

export function scanAgentDirs(root, opts = {}) {
  if (!root || !existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = join(root, entry.name);
    const profilePath = join(dirPath, "profile.json");
    if (!existsSync(profilePath)) continue;
    const profile = readJsonFile(profilePath) ?? {};
    const displayName = profileDisplayName(profile);
    const skip = shouldSkipAgentDir(dirPath, displayName);
    const group = skip.skip ? null : mapOfficeGroup(profile, displayName, opts);
    out.push({
      dir: entry.name,
      dirPath,
      displayName,
      group,
      skip: skip.skip,
      reason: skip.reason,
      actor: asciiActor(entry.name, displayName),
    });
  }
  return out;
}

export function heartbeatPayload(agent, ttlSeconds = DEFAULT_TTL_SECONDS) {
  return {
    display_name: agent.displayName,
    group: agent.group,
    kind: "bot",
    ttl_seconds: ttlSeconds,
  };
}

export function loadBridgeConfig(env = process.env) {
  return {
    agentDataRoot: env.AGENT_DATA_ROOT || DEFAULT_AGENT_DATA_ROOT,
    apiUrl: (env.HARNESS_API_URL || DEFAULT_API_URL).replace(/\/$/, ""),
    intervalSeconds: Number(env.INTERVAL_SECONDS || DEFAULT_INTERVAL_SECONDS) || DEFAULT_INTERVAL_SECONDS,
    ttlSeconds: Number(env.HEARTBEAT_TTL_SECONDS || DEFAULT_TTL_SECONDS) || DEFAULT_TTL_SECONDS,
    nameGroups: parseJsonObject(env.PRESENCE_GROUP_MAP_JSON, DEFAULT_NAME_GROUPS),
    sectionAliases: parseJsonObject(env.PRESENCE_SECTION_ALIASES_JSON, DEFAULT_SECTION_ALIASES),
    token: env.HARNESS_BOT_TOKEN || "",
  };
}

export async function postHeartbeat(apiUrl, agent, ttlSeconds, token) {
  const actor = agent.actor;
  const headers = {
    "content-type": "application/json",
    authorization: token ? `Bearer ${token}` : `Bearer coordinator:${actor}`,
    "x-harness-role": "coordinator",
    "x-harness-actor": actor,
    "x-harness-entry": "mcp",
  };
  const res = await fetch(`${apiUrl}/v1/agents/heartbeat`, {
    method: "POST",
    headers,
    body: JSON.stringify(heartbeatPayload(agent, ttlSeconds)),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function runBridgeTick(config, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const log = opts.log ?? console;
  const agents = scanAgentDirs(config.agentDataRoot, {
    nameGroups: config.nameGroups,
    sectionAliases: config.sectionAliases,
  });
  const posted = [];
  const skipped = [];
  for (const agent of agents) {
    if (agent.skip) {
      skipped.push(agent);
      log.info?.(`[presence-bridge] skip ${agent.dir} (${agent.reason})`);
      continue;
    }
    if (dryRun) {
      posted.push(agent);
      log.info?.(`[presence-bridge] dry-run ${agent.displayName} group=${agent.group} actor=${agent.actor}`);
      continue;
    }
    const result = await postHeartbeat(config.apiUrl, agent, config.ttlSeconds, config.token);
    if (result.ok) {
      posted.push(agent);
      log.info?.(`[presence-bridge] heartbeat ${agent.displayName} group=${agent.group}`);
    } else {
      log.error?.(`[presence-bridge] fail ${agent.displayName} ${result.status} ${JSON.stringify(result.body)}`);
    }
  }
  return { posted, skipped, scanned: agents.length };
}

function parseArgs(argv) {
  return {
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run") || argv.includes("--dryrun"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadBridgeConfig();
  const tick = () =>
    runBridgeTick(config, { dryRun: args.dryRun, log: console }).catch((err) => {
      console.error("[presence-bridge] tick failed", err);
    });
  await tick();
  if (args.once) return;
  const ms = Math.max(5, config.intervalSeconds) * 1000;
  console.info(`[presence-bridge] watching ${config.agentDataRoot} every ${config.intervalSeconds}s → ${config.apiUrl}`);
  setInterval(() => {
    void tick();
  }, ms);
}

const launchedDirectly = process.argv[1] && process.argv[1].endsWith("presence-bridge.mjs");
if (launchedDirectly) {
  void main();
}
