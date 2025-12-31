import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const leetcode = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: "./src/content/leetcode" }),
  schema: z.object({
    title: z.string(),
    problemUrl: z.string().url(),
    difficulty: z.enum(['Easy', 'Medium', 'Hard']),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    complexity: z.object({
      time: z.string(),
      space: z.string(),
    }).optional(),
  }),
});

export const collections = { blog, leetcode };
