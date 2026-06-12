import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const toolsListPath = path.join(repoRoot, "protocol", "tools-list.json");

export async function loadNativeToolCatalog() {
  const raw = await readFile(toolsListPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed.result?.tools || [];
}

export function findTool(tools, name) {
  return tools.find((tool) => tool.name === name) || null;
}

export function validateRequiredArguments(tool, args) {
  const required = tool.inputSchema?.required || [];
  for (const key of required) {
    if (!(key in args)) {
      return `Missing required argument: ${key}`;
    }
  }
  return null;
}
