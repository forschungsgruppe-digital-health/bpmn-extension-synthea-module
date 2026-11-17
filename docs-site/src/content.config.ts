import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// English only: no i18n collection is declared, so Starlight serves a single locale.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() })
};
