import { z } from 'zod';
import { houseLayout } from './houseLayout.ts';
import { manifest } from './manifest.ts';
import { motion } from './motion.ts';
import { screenLayout } from './screenLayout.ts';
import { tokens } from './tokens.ts';

/** The file each schema describes, for editors and for the generated schema's description. */
export const CONTRACT_SCHEMAS = {
  manifest: { schema: manifest, describes: 'assets/manifest.json' },
  'house-layout': { schema: houseLayout, describes: 'assets/house/layout.json' },
  'screen-layout': { schema: screenLayout, describes: 'design/layouts/<screen-id>.json' },
  tokens: { schema: tokens, describes: 'design/tokens.json' },
  motion: { schema: motion, describes: 'design/motion.json' },
} as const;

export type ContractName = keyof typeof CONTRACT_SCHEMAS;

/**
 * JSON Schema for editor completion and quick checks. It covers structure only: the semantic
 * rules (reachability, sizes, contrast, closure) run in `npm run validate:design` / `validate:assets`.
 */
export function jsonSchema(name: ContractName): Record<string, unknown> {
  const { schema, describes } = CONTRACT_SCHEMAS[name];
  return {
    ...z.toJSONSchema(schema, { io: 'input' }),
    title: name,
    description: `${describes}. Structure only; run npm run validate:design / validate:assets for the full contract.`,
  };
}
