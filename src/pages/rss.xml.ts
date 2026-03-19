import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const blogPosts = await getCollection('blog', ({ id, data }) =>
    id.startsWith('en/') && !data.draft
  );
  const articles = await getCollection('articles', ({ id, data }) =>
    id.startsWith('en/') && !data.draft
  );

  const items = [
    ...blogPosts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.id.replace(/^en\//, '').replace(/\.(md|mdx)$/, '')}/`,
      categories: post.data.tags,
    })),
    ...articles.map((post) => ({
      title: post.data.title,
      description: post.data.abstract || post.data.description,
      pubDate: post.data.pubDate,
      link: `/articles/${post.id.replace(/^en\//, '').replace(/\.(md|mdx)$/, '')}/`,
      categories: post.data.tags,
    })),
  ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: 'eddn.dev',
    description: 'Engineering notes: decisions, technical trade-offs, and learning.',
    site: context.site!,
    items,
    customData: '<language>en</language>',
  });
}
