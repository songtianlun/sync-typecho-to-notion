import { validateConfig, notionConfig, notionLinksConfig, typechoDbConfig } from './config';
import { TypechoClient } from './typecho/client';
import { NotionClient } from './notion/client';
import { NotionLinksClient } from './notion/links-client';
import { SyncResult, TypechoPost } from './types';
import { getCachedPosts, setCachedPosts, clearCache } from './cache';

// 解析命令行参数
function parseArgs(): { noCache: boolean; clearCache: boolean; command: 'posts' | 'links' } {
  const args = process.argv.slice(2);
  const command = args.includes('links') ? 'links' : 'posts';

  return {
    noCache: args.includes('--no-cache'),
    clearCache: args.includes('--clear-cache'),
    command,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 同步文章
async function syncPosts(noCache: boolean): Promise<void> {
  const typechoClient = new TypechoClient(typechoDbConfig);
  const notionClient = new NotionClient(notionConfig);

  const result: SyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  let posts: TypechoPost[] = [];

  try {
    console.log('\nFetching posts...');

    if (!noCache) {
      const cached = getCachedPosts();
      if (cached) {
        posts = cached;
      }
    } else {
      console.log('Cache disabled (--no-cache)');
    }

    if (posts.length === 0) {
      console.log('Connecting to Typecho database...');
      await typechoClient.connect();
      posts = await typechoClient.getPosts();
      await typechoClient.close();

      if (posts.length > 0) {
        setCachedPosts(posts);
      }
    }

    result.total = posts.length;
    console.log(`Total: ${posts.length} posts`);
    console.log();

    if (posts.length === 0) {
      console.log('No posts to sync.');
      return;
    }

    console.log('Checking Notion database properties...');
    await notionClient.ensureDatabaseProperties();
    console.log();

    console.log('Querying existing posts in Notion...');
    const existingPosts = await notionClient.queryExistingPosts();
    console.log(`Found ${Object.keys(existingPosts).length} existing posts in Notion.`);
    console.log();

    console.log('Starting sync...');
    console.log('-'.repeat(50));

    for (const post of posts) {
      try {
        const existing = existingPosts[post.slug];

        if (existing) {
          const postModified = new Date(post.modified * 1000).toISOString();
          if (existing.modified && existing.modified >= postModified) {
            console.log(`[SKIP] "${post.title}" (slug: ${post.slug}) - not modified`);
            result.skipped++;
            continue;
          }

          console.log(`[UPDATE] "${post.title}" (slug: ${post.slug})`);
          await notionClient.updatePage(existing.pageId, post);
          result.updated++;
        } else {
          console.log(`[CREATE] "${post.title}" (slug: ${post.slug})`);
          await notionClient.createPage(post);
          result.created++;
        }

        await sleep(350);
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error(`[FAILED] "${post.title}" - ${errorMessage}`);
        result.failed++;
        result.errors.push({ title: post.title, error: errorMessage });
      }
    }

    console.log('-'.repeat(50));
    console.log();

  } catch (error) {
    console.error('Sync error:', (error as Error).message);
    await typechoClient.close();
    throw error;
  }

  // 打印同步统计
  printSummary(result, 'posts');
}

// 同步友链
async function syncLinks(): Promise<void> {
  if (!notionLinksConfig) {
    console.error('Error: NOTION_LINKS_DATABASE_ID is not configured.');
    console.error('Please set NOTION_LINKS_DATABASE_ID in your .env file.');
    process.exit(1);
  }

  const typechoClient = new TypechoClient(typechoDbConfig);
  const notionLinksClient = new NotionLinksClient(notionLinksConfig);

  const result: SyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    console.log('\nFetching links...');
    console.log('Connecting to Typecho database...');
    await typechoClient.connect();
    const links = await typechoClient.getLinks();
    await typechoClient.close();

    result.total = links.length;
    console.log(`Total: ${links.length} links`);
    console.log();

    if (links.length === 0) {
      console.log('No links to sync.');
      return;
    }

    console.log('Checking Notion database properties...');
    await notionLinksClient.ensureDatabaseProperties();
    console.log();

    console.log('Querying existing links in Notion...');
    const existingLinks = await notionLinksClient.queryExistingLinks();
    console.log(`Found ${Object.keys(existingLinks).length} existing links in Notion.`);
    console.log();

    console.log('Starting sync...');
    console.log('-'.repeat(50));

    for (const link of links) {
      try {
        const existing = existingLinks[link.url];

        if (existing) {
          console.log(`[UPDATE] "${link.name}" (url: ${link.url})`);
          await notionLinksClient.updatePage(existing.pageId, link);
          result.updated++;
        } else {
          console.log(`[CREATE] "${link.name}" (url: ${link.url})`);
          await notionLinksClient.createPage(link);
          result.created++;
        }

        await sleep(350);
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error(`[FAILED] "${link.name}" - ${errorMessage}`);
        result.failed++;
        result.errors.push({ title: link.name, error: errorMessage });
      }
    }

    console.log('-'.repeat(50));
    console.log();

  } catch (error) {
    console.error('Sync error:', (error as Error).message);
    await typechoClient.close();
    throw error;
  }

  printSummary(result, 'links');
}

// 打印同步统计
function printSummary(result: SyncResult, type: string): void {
  console.log('='.repeat(50));
  console.log('Sync Summary');
  console.log('='.repeat(50));
  console.log(`Total ${type}:   ${result.total}`);
  console.log(`Created:        ${result.created}`);
  console.log(`Updated:        ${result.updated}`);
  console.log(`Skipped:        ${result.skipped}`);
  console.log(`Failed:         ${result.failed}`);

  if (result.errors.length > 0) {
    console.log();
    console.log('Errors:');
    for (const { title, error } of result.errors) {
      console.log(`  - ${title}: ${error}`);
    }
  }

  console.log('='.repeat(50));
  console.log('Sync completed!');
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('='.repeat(50));
  console.log('Typecho to Notion Sync Tool');
  console.log('='.repeat(50));
  console.log();

  if (args.clearCache) {
    clearCache();
    if (process.argv.length === 3) {
      return;
    }
  }

  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', (error as Error).message);
    process.exit(1);
  }

  console.log();

  if (args.command === 'links') {
    await syncLinks();
  } else {
    await syncPosts(args.noCache);
  }
}

// 运行主程序
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
