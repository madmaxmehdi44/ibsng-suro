import { readFile, readdir } from 'node:fs/promises';
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
    if (properties && typeof properties === 'object' && Object.keys(properties as object).length > 0) {
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

const stripUndefined = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

export function paramsToZod(method: OpenRpcMethod): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const param of method.params ?? []) {
    let schema = schemaToZod(param.schema);
    const description = param.description?.trim();
    if (description) schema = schema.describe(description);
    if (param.required === false) schema = schema.optional();
    shape[param.name] = schema;
  }
  return z.object(shape).passthrough();
}

export async function loadOpenRpcDocuments(root = path.resolve(process.cwd(), 'schemas/ibsng-e')): Promise<OpenRpcDocument[]> {
  let names: string[];
  try {
    names = (await readdir(root)).filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    throw new Error(`IBSng E schemas are missing at ${root}. Run: npm run sync:docs`, { cause: error });
  }

  const documents: OpenRpcDocument[] = [];
  for (const name of names) {
    const text = await readFile(path.join(root, name), 'utf8');
    const parsed = JSON.parse(text) as OpenRpcDocument;
    if (!Array.isArray(parsed.methods)) throw new Error(`Invalid IBSng E OpenRPC document: ${name}`);
    documents.push(parsed);
  }
  return documents;
}

export function mergeMethods(documents: OpenRpcDocument[]): OpenRpcMethod[] {
  const merged = new Map<string, OpenRpcMethod>();

  for (const document of documents) {
    for (const method of document.methods) {
      const current = merged.get(method.name);
      if (!current) {
        merged.set(method.name, { ...method, params: [...(method.params ?? [])] });
        continue;
      }

      const params = new Map<string, OpenRpcParam>();
      for (const param of [...(current.params ?? []), ...(method.params ?? [])]) {
        const existing = params.get(param.name);
        if (!existing) {
          params.set(param.name, { ...param });
        } else if (JSON.stringify(existing.schema) !== JSON.stringify(param.schema)) {
          params.set(param.name, {
            ...existing,
            description: existing.description ?? param.description,
            required: existing.required === true && param.required !== false,
            schema: { type: 'object', properties: {} }
          });
        }
      }

      current.params = [...params.values()];
      current.description = current.description ?? method.description;
      current.auth_type = [...new Set([...(current.auth_type ?? []), ...(method.auth_type ?? [])])];
      current.requires_perm = [...new Set([...(current.requires_perm ?? []), ...(method.requires_perm ?? [])])];
      current.result = current.result ?? method.result;
    }
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sanitizeToolName(method: string): string {
  return `ibsng_rpc_${method.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export function methodDescription(method: OpenRpcMethod): string {
  const parts = [method.description?.trim() || `Invoke IBSng E method ${method.name}.`];
  if (method.auth_type?.length) parts.push(`Auth: ${method.auth_type.join(', ')}.`);
  if (method.requires_perm?.length) parts.push(`Required permissions: ${method.requires_perm.join(', ')}.`);
  parts.push('This tool calls the documented IBSng Branch E JSON-RPC method and injects authentication server-side.');
  return parts.join(' ');
}

export { stripUndefined };
