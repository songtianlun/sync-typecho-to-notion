import { Pool } from 'pg';
import { DatabaseConfig, TypechoPost, TypechoMeta, TypechoLink } from '../types';

export class TypechoClient {
  private pool: Pool;
  private prefix: string;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
    });
    this.prefix = config.prefix;
  }

  private table(name: string): string {
    return `${this.prefix}${name}`;
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('Connected to Typecho database successfully.');
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // 获取所有文章
  async getPosts(): Promise<TypechoPost[]> {
    const contentsTable = this.table('contents');
    const relationshipsTable = this.table('relationships');
    const metasTable = this.table('metas');

    // 查询所有已发布/草稿文章
    const postsResult = await this.pool.query<{
      cid: number;
      title: string;
      slug: string;
      created: number;
      modified: number;
      text: string;
      status: string;
      type: string;
    }>(`
      SELECT cid, title, slug, created, modified, text, status, type
      FROM ${contentsTable}
      WHERE type = 'post'
      ORDER BY created DESC
    `);

    const posts: TypechoPost[] = [];

    for (const row of postsResult.rows) {
      // 获取该文章的分类和标签
      const metasResult = await this.pool.query<TypechoMeta>(`
        SELECT m.mid, m.name, m.slug, m.type, m.description, m.count, m."order"
        FROM ${metasTable} m
        INNER JOIN ${relationshipsTable} r ON m.mid = r.mid
        WHERE r.cid = $1
      `, [row.cid]);

      const categories: string[] = [];
      const tags: string[] = [];

      for (const meta of metasResult.rows) {
        if (meta.type === 'category') {
          categories.push(meta.name);
        } else if (meta.type === 'tag') {
          tags.push(meta.name);
        }
      }

      posts.push({
        cid: row.cid,
        title: row.title,
        slug: row.slug,
        created: row.created,
        modified: row.modified,
        text: this.cleanContent(row.text),
        status: row.status as TypechoPost['status'],
        type: row.type,
        categories,
        tags,
      });
    }

    return posts;
  }

  // 获取所有友链 (handsome 主题)
  async getLinks(): Promise<TypechoLink[]> {
    const linksTable = this.table('links');

    const result = await this.pool.query<{
      lid: number;
      name: string;
      url: string;
      sort: string;
      image: string;
      description: string;
      user: string;
      order: number;
    }>(`
      SELECT lid, name, url, sort, image, description, "user", "order"
      FROM ${linksTable}
      ORDER BY "order" ASC
    `);

    return result.rows.map((row) => ({
      lid: row.lid,
      name: row.name || '',
      url: row.url || '',
      sort: row.sort || '',
      image: row.image || '',
      description: row.description || '',
      user: row.user || '',
      order: row.order || 0,
    }));
  }

  // 清理文章内容（移除 Typecho 特殊标记）
  private cleanContent(text: string): string {
    // 移除 <!--markdown--> 标记
    let content = text.replace(/<!--markdown-->/gi, '');
    // 移除开头的 <!--more--> 之前的内容标记（如果需要的话可以保留）
    // content = content.replace(/<!--more-->/gi, '\n\n---\n\n');
    return content.trim();
  }
}
