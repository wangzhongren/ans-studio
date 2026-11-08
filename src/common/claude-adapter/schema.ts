import type * as Zod from "zod";
import type { JsonSchema } from "../../model/runtime.ts";

// Reject unknown constraints rather than letting a converter silently ignore them.
const supported = new Set([
  "$schema", "title", "description", "type", "properties", "required", "additionalProperties",
  "items", "minItems", "maxItems", "uniqueItems", "enum", "const", "anyOf", "oneOf", "allOf",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern",
]);
// Conditional applicators are converted faithfully (see collectConditionalIssues/matches); they are
// accepted at any depth. `contains` only appears inside a conditional fragment in the public tool
// schemas, so it is accepted there (and evaluated by the same conditional evaluator).
const conditional = new Set(["if", "then", "else", "not"]);

/**
 * Validates the supported subset. `fragment` marks a schema used as a conditional operand
 * (if/then/else/not/contains): its `required` names the *instance's* properties, which are declared
 * by the enclosing schema, so the "required must name declared properties" check only applies to
 * complete schemas. Unknown keywords are still rejected everywhere.
 */
function check(schema: unknown, path: string, fragment = false): void {
  if (typeof schema === "boolean") return;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error(`${path}: invalid JSON Schema`);
  const value = schema as JsonSchema;
  for (const key of Object.keys(value)) {
    if (!supported.has(key) && !conditional.has(key) && !(fragment && key === "contains")) throw new Error(`${path}: unsupported JSON Schema keyword ${key}`);
  }
  if (value.type !== undefined) {
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (!types.length || types.some((type) => !["object", "array", "string", "number", "integer", "boolean", "null"].includes(String(type)))) throw new Error(`${path}: unsupported JSON Schema type`);
  }
  if (value.properties !== undefined) {
    if (!value.properties || typeof value.properties !== "object" || Array.isArray(value.properties)) throw new Error(`${path}: invalid properties`);
    for (const [key, child] of Object.entries(value.properties)) check(child, `${path}.${key}`, fragment);
  }
  if (value.required !== undefined) {
    if (!Array.isArray(value.required) || value.required.some((key) => typeof key !== "string" || (!fragment && !Object.hasOwn((value.properties ?? {}) as object, key)))) {
      throw new Error(`${path}: required must name declared properties`);
    }
  }
  for (const key of ["items", "additionalProperties"]) if (value[key] !== undefined) check(value[key], `${path}.${key}`, fragment);
  if (value.contains !== undefined) check(value.contains, `${path}.contains`, true);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (value[key] === undefined) continue;
    if (!Array.isArray(value[key]) || value[key].length === 0) throw new Error(`${path}: invalid ${key}`);
    for (const child of value[key]) check(child, `${path}.${key}`, fragment);
  }
  for (const key of ["if", "then", "else", "not"]) if (value[key] !== undefined) check(value[key], `${path}.${key}`, true);
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Recursively drops conditional applicators, leaving a base schema for z.fromJSONSchema. */
function stripConditionals(node: unknown): unknown {
  if (!isSchemaObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    if (conditional.has(key)) continue;
    if (key === "properties" && isSchemaObject(child)) {
      out.properties = Object.fromEntries(Object.entries(child).map(([name, schema]) => [name, stripConditionals(schema)]));
    } else if (key === "allOf" && Array.isArray(child)) {
      // Conditional-only entries become empty (always-true) schemas; dropping them is equivalent.
      const kept = child.map(stripConditionals).filter((entry) => !(isSchemaObject(entry) && Object.keys(entry).length === 0));
      if (kept.length > 0) out.allOf = kept;
    } else if ((key === "anyOf" || key === "oneOf") && Array.isArray(child)) {
      out[key] = child.map(stripConditionals);
    } else if (key === "items" || key === "additionalProperties" || key === "contains") {
      out[key] = stripConditionals(child);
    } else {
      out[key] = child;
    }
  }
  return out;
}

function containsConditional(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsConditional);
  if (!isSchemaObject(node)) return false;
  for (const key of conditional) if (node[key] !== undefined) return true;
  if (isSchemaObject(node.properties) && Object.values(node.properties).some(containsConditional)) return true;
  for (const key of ["items", "additionalProperties", "contains", "allOf", "anyOf", "oneOf"]) {
    if (containsConditional(node[key])) return true;
  }
  return false;
}

/** JSON deep equality (const/enum/uniqueItems). */
function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null || typeof left !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return isSchemaObject(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    default: return false;
  }
}

/**
 * Evaluates the supported JSON Schema subset with draft-07 semantics. Used for conditional
 * operands only (if/then/else/not and the branches of a conditional anyOf/oneOf); the base
 * structure is validated by z.fromJSONSchema exactly as before.
 */
function matches(node: unknown, value: unknown): boolean {
  if (node === true) return true;
  if (node === false) return false;
  if (!isSchemaObject(node)) return true;
  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (!types.some((type) => typeof type === "string" && typeMatches(type, value))) return false;
  }
  if (node.const !== undefined && !deepEqual(node.const, value)) return false;
  if (node.enum !== undefined) {
    if (!Array.isArray(node.enum) || !node.enum.some((candidate) => deepEqual(candidate, value))) return false;
  }
  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof node.minLength === "number" && length < node.minLength) return false;
    if (typeof node.maxLength === "number" && length > node.maxLength) return false;
    if (node.pattern !== undefined && !new RegExp(String(node.pattern)).test(value)) return false;
  }
  if (typeof value === "number") {
    if (typeof node.minimum === "number" && value < node.minimum) return false;
    if (typeof node.maximum === "number" && value > node.maximum) return false;
    if (typeof node.exclusiveMinimum === "number" && value <= node.exclusiveMinimum) return false;
    if (typeof node.exclusiveMaximum === "number" && value >= node.exclusiveMaximum) return false;
    if (typeof node.multipleOf === "number" && node.multipleOf > 0) {
      const ratio = value / node.multipleOf;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-9) return false;
    }
  }
  if (isSchemaObject(value)) {
    const properties = isSchemaObject(node.properties) ? node.properties : undefined;
    if (Array.isArray(node.required)) {
      for (const key of node.required) if (typeof key === "string" && !Object.hasOwn(value, key)) return false;
    }
    if (properties) {
      for (const [key, child] of Object.entries(properties)) {
        if (Object.hasOwn(value, key) && !matches(child, value[key])) return false;
      }
    }
    if (node.additionalProperties !== undefined) {
      for (const [key, child] of Object.entries(value)) {
        if (properties && Object.hasOwn(properties, key)) continue;
        if (node.additionalProperties === false) return false;
        if (isSchemaObject(node.additionalProperties) && !matches(node.additionalProperties, child)) return false;
      }
    }
  }
  if (Array.isArray(value)) {
    if (typeof node.minItems === "number" && value.length < node.minItems) return false;
    if (typeof node.maxItems === "number" && value.length > node.maxItems) return false;
    if (node.uniqueItems === true) {
      for (let index = 0; index < value.length; index += 1) {
        for (let other = index + 1; other < value.length; other += 1) if (deepEqual(value[index], value[other])) return false;
      }
    }
    if (node.items !== undefined && !value.every((item) => matches(node.items, item))) return false;
    if (node.contains !== undefined && (value.length === 0 || !value.some((item) => matches(node.contains, item)))) return false;
  }
  if (Array.isArray(node.allOf)) for (const child of node.allOf) if (!matches(child, value)) return false;
  if (Array.isArray(node.anyOf) && !node.anyOf.some((child) => matches(child, value))) return false;
  if (Array.isArray(node.oneOf)) {
    let hits = 0;
    for (const child of node.oneOf) if (matches(child, value)) hits += 1;
    if (hits !== 1) return false;
  }
  if (node.not !== undefined && matches(node.not, value)) return false;
  if (node.if !== undefined) {
    const hit = matches(node.if, value);
    if (hit && node.then !== undefined && !matches(node.then, value)) return false;
    if (!hit && node.else !== undefined && !matches(node.else, value)) return false;
  }
  return true;
}

function collectConditionalIssues(node: unknown, value: unknown, path: Array<string | number>, report: (path: Array<string | number>, message: string) => void): void {
  if (!isSchemaObject(node)) return;
  if (node.if !== undefined) {
    const hit = matches(node.if, value);
    if (hit && node.then !== undefined && !matches(node.then, value)) report(path, "conditional then constraint failed");
    if (!hit && node.else !== undefined && !matches(node.else, value)) report(path, "conditional else constraint failed");
  }
  if (node.not !== undefined && matches(node.not, value)) report(path, "value must not match a negated schema");
  // Conditionals inside anyOf/oneOf can only be judged together with their branch (JSON Schema
  // anyOf/oneOf semantics), so evaluate the whole applicator when any branch carries one.
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = node[key];
    if (Array.isArray(branches) && branches.some(containsConditional)) {
      if (!matches(node, value)) report(path, `${key} constraints including conditionals failed`);
      return;
    }
  }
  if (isSchemaObject(value)) {
    const properties = isSchemaObject(node.properties) ? node.properties : undefined;
    if (properties) {
      for (const [key, child] of Object.entries(properties)) {
        if (Object.hasOwn(value, key)) collectConditionalIssues(child, value[key], [...path, key], report);
      }
    }
    if (isSchemaObject(node.additionalProperties)) {
      for (const [key, child] of Object.entries(value)) {
        if (properties && Object.hasOwn(properties, key)) continue;
        collectConditionalIssues(node.additionalProperties, child, [...path, key], report);
      }
    }
  }
  if (Array.isArray(value) && node.items !== undefined) {
    value.forEach((item, index) => collectConditionalIssues(node.items, item, [...path, index], report));
  }
  if (Array.isArray(node.allOf)) for (const child of node.allOf) collectConditionalIssues(child, value, path, report);
}

/** A complete Zod object is registered with MCP, preserving root additionalProperties. */
export function toClaudeSchema(schema: JsonSchema, z: typeof Zod): Zod.ZodType {
  check(schema, "tool input");
  if (schema.type !== "object") throw new Error("Claude MCP tool input must be an object");
  const converted = z.fromJSONSchema(stripConditionals(schema) as JsonSchema);
  if (!containsConditional(schema)) return converted;
  return converted.superRefine((value, ctx) => {
    collectConditionalIssues(schema, value, [], (path, message) => ctx.addIssue({ code: "custom", message, path }));
  });
}
