// Typecho 文章数据结构
export interface TypechoPost {
  cid: number;
  title: string;
  slug: string;
  created: number; // Unix timestamp
  modified: number; // Unix timestamp
  text: string;
  status: 'publish' | 'draft' | 'hidden' | 'waiting' | 'private';
  type: string;
  categories: string[];
  tags: string[];
}

// Typecho 友链数据结构 (handsome 主题)
export interface TypechoLink {
  lid: number;
  name: string;
  url: string;
  sort: string; // 分类
  image: string; // logo 图
  description: string;
  user: string;
  order: number;
}

// Typecho 元数据（分类/标签）
export interface TypechoMeta {
  mid: number;
  name: string;
  slug: string;
  type: 'category' | 'tag';
  description?: string;
  count: number;
  order: number;
}

// 同步统计结果
export interface SyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ title: string; error: string }>;
}

// Notion 页面映射（slug -> pageId）
export interface NotionPageMap {
  [slug: string]: {
    pageId: string;
    modified?: string;
  };
}

// 数据库配置
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  prefix: string;
}

// Notion 配置
export interface NotionConfig {
  apiKey: string;
  databaseId: string;
}
