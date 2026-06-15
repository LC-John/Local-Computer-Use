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

function typeName(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function matchesJsonSchemaType(value, expectedType) {
  if (expectedType === "integer") {
    return Number.isInteger(value);
  }
  if (expectedType === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (expectedType === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === expectedType;
}

export function validateArgumentShape(tool, args) {
  const schema = tool.inputSchema || {};
  if (!matchesJsonSchemaType(args, schema.type || "object")) {
    return {
      code: "invalid_arguments",
      message: `Tool arguments must be a ${schema.type || "object"}`,
    };
  }

  const properties = schema.properties || {};
  if (schema.additionalProperties === false) {
    const unknownKeys = Object.keys(args).filter((key) => !(key in properties));
    if (unknownKeys.length > 0) {
      return {
        code: "unexpected_argument",
        message: `Unexpected argument: ${unknownKeys[0]}`,
      };
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const property = properties[key];
    if (!property) continue;

    if (property.type && !matchesJsonSchemaType(value, property.type)) {
      return {
        code: "invalid_argument_type",
        message: `Argument ${key} must be ${property.type}; received ${typeName(value)}`,
      };
    }

    if (property.enum && !property.enum.includes(value)) {
      return {
        code: "invalid_argument_value",
        message: `Argument ${key} must be one of: ${property.enum.join(", ")}`,
      };
    }
  }

  return null;
}
