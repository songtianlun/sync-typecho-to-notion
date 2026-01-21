import * as dotenv from 'dotenv';
import { DatabaseConfig, NotionConfig } from './types';

// 加载 .env 文件
dotenv.config();

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

// Notion 配置
export const notionConfig: NotionConfig = {
  apiKey: getEnvOrThrow('NOTION_KEY'),
  databaseId: getEnvOrThrow('NOTION_DATABASE_ID'),
};

// Notion 友链数据库配置（可选）
export const notionLinksConfig: NotionConfig | null = process.env.NOTION_LINKS_DATABASE_ID
  ? {
      apiKey: getEnvOrThrow('NOTION_KEY'),
      databaseId: process.env.NOTION_LINKS_DATABASE_ID,
    }
  : null;

// Typecho 数据库配置
export const typechoDbConfig: DatabaseConfig = {
  host: getEnvOrThrow('TYPECHO_DB_HOST'),
  port: parseInt(getEnvOrDefault('TYPECHO_DB_PORT', '5432'), 10),
  user: getEnvOrThrow('TYPECHO_DB_USER'),
  password: getEnvOrThrow('TYPECHO_DB_PASSWORD'),
  database: getEnvOrThrow('TYPECHO_DB_DATABASE'),
  prefix: getEnvOrDefault('TYPECHO_DB_PREFIX', 'typecho_'),
};

// 数据库适配器（目前仅支持 postgresql）
export const dbAdapter = getEnvOrDefault('TYPECHO_DB_ADAPTER', 'postgresql');

// Markdown 导出目录配置
export const markdownExportDir = getEnvOrDefault('MARKDOWN_EXPORT_DIR', './posts');

// 验证配置
export function validateConfig(): void {
  if (dbAdapter !== 'postgresql') {
    throw new Error(`Unsupported database adapter: ${dbAdapter}. Currently only 'postgresql' is supported.`);
  }

  console.log('Configuration loaded successfully:');
  console.log(`  - Notion Database ID: ${notionConfig.databaseId.substring(0, 8)}...`);
  console.log(`  - Typecho DB: ${typechoDbConfig.host}:${typechoDbConfig.port}/${typechoDbConfig.database}`);
  console.log(`  - Table Prefix: ${typechoDbConfig.prefix}`);
}

// 验证导出配置
export function validateExportConfig(): void {
  console.log('Configuration loaded successfully:');
  console.log(`  - Markdown Export Dir: ${markdownExportDir}`);
  console.log(`  - Typecho DB: ${typechoDbConfig.host}:${typechoDbConfig.port}/${typechoDbConfig.database}`);
  console.log(`  - Table Prefix: ${typechoDbConfig.prefix}`);
}
