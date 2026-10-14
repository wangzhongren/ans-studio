import type * as Zod from "zod";
import type { JsonSchema } from "../../model/runtime.ts";

// Reject unknown constraints rather than letting a converter silently ignore them.
const supported = new Set([
  "$schema", "title", "description", "type", "properties", "required", "additionalProperties",
  "items", "minItems", "maxItems", "uniqueItems", "enum", "const", "anyOf", "oneOf", "allOf",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern",
]);
function check(schema: unknown, path: string): void {
  if (typeof schema === "boolean") return;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error(`${path}: invalid JSON Schema`);
  const value = schema as JsonSchema;
  for (const key of Object.keys(value)) {
    if (!supported.has(key)) throw new Error(`${path}: unsupported JSON Schema keyword ${key}`);
  }
  if (value.type !== undefined) {
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (!types.length || types.some((type) => !["object", "array", "string", "number", "integer", "boolean", "null"].includes(String(type)))) throw new Error(`${path}: unsupported JSON Schema type`);
  }
  if (value.properties !== undefined) {
    if (!value.properties || typeof value.properties !== "object" || Array.isArray(value.properties)) throw new Error(`${path}: invalid properties`);
    for (const [key, child] of Object.entries(value.properties)) check(child, `${path}.${key}`);
  }
  if (value.required !== undefined) {
    if (!Array.isArray(value.required) || value.required.some((key) => typeof key !== "string" || !Object.hasOwn((value.properties ?? {}) as object, key))) {
      throw new Error(`${path}: required must name declared properties`);
    }
  }
  for (const key of ["items", "additionalProperties"]) if (value[key] !== undefined) check(value[key], `${path}.${key}`);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key]) || value[key].length === 0) throw new Error(`${path}: invalid ${key}`);
    for (const child of value[key]) check(child, `${path}.${key}`);
  }
}

/** A complete Zod object is registered with MCP, preserving root additionalProperties. */
export function toClaudeSchema(schema: JsonSchema, z: typeof Zod): Zod.ZodType {
  check(schema, "tool input");
  if (schema.type !== "object") throw new Error("Claude MCP tool input must be an object");
  return z.fromJSONSchema(schema);
}
