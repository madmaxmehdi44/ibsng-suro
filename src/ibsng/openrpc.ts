import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';

export interface OpenRpcParam {
  name: string;
  description?: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}

export interface OpenRpcMethod {
  name: string;
  description?: string;
  auth_type?: string[];
  requires_perm?: string[];
  params?: OpenRpcParam[];
  result?: Record<string, unknown>;
}

export interface OpenRpcDocument {
  openrpc?: string;
  info?: Record<string, unknown>;
  methods: OpenRpcMethod[];
}

const schemaToZod = (schema?: Record<string, unknown>): z.ZodTypeAny => {
  if (!schema) return z.unknown();
  const type = schema.type;
  const enumValue = schema.enum;
  if (Array.isArray(enumValue) && enumValue.length > 0 && enumValue.every((v) => typeof v === 'string')) {
    const values = enumValue as string[];
    if (values.length === 1) return z.literal(values[0]!);
    return z.enum(values as [string, ...string[]]);
  }
  if (type === 'string' || type === 'str') return z.string();
  if (type === 'integer') return z.number().int();
  if (type === 'number') return z.number();
  if (type === 'boolean') return z.boolean();
  if (type === 'null') return z.null();
  if (type === 'array') {
    const items = schema.items && typeof schema.items === 'object' ? schema.items as Record<string, unknown> : undefined;
    return z.array(schemaToZod(items));
  }
  if (type === 'object') {
    const properties = schema.properties;
    if (properties && typeof properties === 'object' && Object.keys(properties as Record<string, unknown>).length > 0) {
      const shape: z.ZodRawShape = {};
      for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
        shape[key] = schemaToZod(value && typeof value === 'object' ? value as Record<string, unknown> : undefined);
      }
      return z.object(shape).passthrough();
    }
    return z.record(z.string(), z.unknown());
  }
  return z.unknown();
};

export function paramsToZod(method: OpenRpcMethod): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const param of method.params ?? []) {
    let schema = schemaToZod(param.schema);
    if (param.description?.trim()) schema = schema.describe(param.description.trim());
    if (param.required === false) schema = schema.optional();
    shape[param.name] = schema;
  }
  return z.object(shape).passthrough();
}

export function loadOpenRpcDocumentsSync(root = path.resolve(process.cwd(), 'schemas/ibsng-e')): OpenRpcDocument[] {
  let names: string[];
  try {
    names = readdirSync(root).filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    throw new Error(`IBSng E schemas are missing at ${root}. Run: npm run sync:docs`, { cause: error });
  }
  if (names.length === 0) throw new Error(`No IBSng E schemas found at ${root}. Run: npm run sync:docs`);
  return names.map((name) => {
    const parsed = JSON.parse(readFileSync(path.join(root, name), 'utf8')) as OpenRpcDocument;
    if (!Array.isArray(parsed.methods)) throw new Error(`Invalid IBSng E OpenRPC document: ${name}`);
    return parsed;
  });
}

/** Preserve overloaded method definitions instead of merging different auth/schema variants. */
export function expandMethods(documents: OpenRpcDocument[]): OpenRpcMethod[] {
  const output: OpenRpcMethod[] = [];
  const fingerprints = new Set<string>();
  for (const document of documents) {
    for (const method of document.methods) {
      const fingerprint = JSON.stringify({
        name: method.name,
        params: method.params ?? [],
        auth_type: method.auth_type ?? [],
        requires_perm: method.requires_perm ?? [],
        result: method.result ?? null,
        description: method.description ?? ''
      });
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      output.push({ ...method, params: [...(method.params ?? [])] });
    }
  }
  return output;
}

export function sanitizeToolName(method: string): string {
  return `ibsng_rpc_${method.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export function methodVariantSuffix(method: OpenRpcMethod, index: number): string {
  const auth = method.auth_type?.length ? method.auth_type.join('_').toLowerCase() : 'default';
  const perm = method.requires_perm?.length
    ? method.requires_perm.join('_').toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    : '';
  const raw = `${auth}${perm ? `_${perm}` : ''}`.replace(/_+/g, '_').replace(/^_|_$/g, '');
  return raw || `variant_${index}`;
}

export function methodDescription(method: OpenRpcMethod): string {
  const parts = [method.description?.trim() || `Invoke IBSng E method ${method.name}.`];
  if (method.auth_type?.length) parts.push(`Auth: ${method.auth_type.join(', ')}.`);
  if (method.requires_perm?.length) parts.push(`Required permissions: ${method.requires_perm.join(', ')}.`);
  parts.push('Calls the documented IBSng Branch E JSON-RPC method; authentication is injected server-side.');
  return parts.join(' ');
}
