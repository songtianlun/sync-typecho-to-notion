# Sync Typecho to Notion

将 Typecho 博客文章同步到 Notion 数据库的命令行工具。

## 功能

- 从 Typecho PostgreSQL 数据库读取文章
- 同步文章的标题、内容、分类、标签、发布状态到 Notion
- 自动创建 Notion 数据库缺失的属性字段
- 通过 slug 判断文章是否已存在，支持增量更新
- 比较修改时间，跳过未变更的文章
- 文章正文作为 Notion 页面内容（支持 Markdown 格式）

## 安装

```bash
npm install
```

## 配置

复制环境变量示例文件并编辑：

```bash
cp .env.example .env
```

配置项说明：

| 变量 | 说明 |
|------|------|
| `NOTION_KEY` | Notion Integration Token |
| `NOTION_DATABASE_ID` | 目标 Notion 数据库 ID |
| `TYPECHO_DB_ADAPTER` | 数据库类型（目前仅支持 `postgresql`） |
| `TYPECHO_DB_HOST` | 数据库主机地址 |
| `TYPECHO_DB_PORT` | 数据库端口 |
| `TYPECHO_DB_USER` | 数据库用户名 |
| `TYPECHO_DB_PASSWORD` | 数据库密码 |
| `TYPECHO_DB_DATABASE` | 数据库名称 |
| `TYPECHO_DB_PREFIX` | Typecho 表前缀（默认 `typecho_`） |

## 使用

```bash
# 开发模式运行
npm run dev

# 或编译后运行
npm run build
npm start

# 跳过缓存，强制从数据库获取
npm run dev -- --no-cache

# 清除缓存
npm run dev -- --clear-cache
```

## 缓存

为避免调试时频繁查询数据库，工具会将文章数据缓存到 `.cache/` 目录，默认有效期 1 小时。

- 缓存有效时自动使用缓存数据
- 使用 `--no-cache` 跳过缓存
- 使用 `--clear-cache` 清除缓存

## Notion 数据库字段

同步时会自动创建以下字段（如不存在）：

| 字段 | 类型 | 说明 |
|------|------|------|
| Title | title | 文章标题 |
| Slug | rich_text | 文章 slug（用于去重） |
| Category | multi_select | 分类 |
| Tags | multi_select | 标签 |
| Status | select | 发布状态 |
| Created | date | 创建时间 |
| Modified | date | 修改时间 |

## 输出示例

```
==================================================
Typecho to Notion Sync Tool
==================================================

Configuration loaded successfully:
  - Notion Database ID: abc12345...
  - Typecho DB: localhost:5432/typecho
  - Table Prefix: typecho_

Connected to Typecho database successfully.

Fetching posts from Typecho...
Found 42 posts in Typecho database.

Checking Notion database properties...
All required properties exist.

Querying existing posts in Notion...
Found 30 existing posts in Notion.

Starting sync...
--------------------------------------------------
[CREATE] "新文章标题" (slug: new-post)
[UPDATE] "已更新文章" (slug: updated-post)
[SKIP] "未修改文章" (slug: unchanged-post) - not modified
--------------------------------------------------

==================================================
Sync Summary
==================================================
Total posts:    42
Created:        5
Updated:        7
Skipped:        30
Failed:         0
==================================================
Sync completed!
```

## License

MIT
