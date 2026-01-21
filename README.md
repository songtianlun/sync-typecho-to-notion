# Sync Typecho to Notion

将 Typecho 博客文章同步到 Notion 数据库或导出为 Markdown 文件的命令行工具。

A CLI tool to sync Typecho blog posts to Notion database or export as Markdown files.

## 功能 | Features

- 从 Typecho PostgreSQL 数据库读取文章 | Read posts from Typecho PostgreSQL database
- 同步标题、内容、分类、标签、发布状态到 Notion | Sync title, content, categories, tags, status to Notion
- **导出文章为 Markdown 文件（带 frontmatter）| Export posts as Markdown files with frontmatter**
- 自动创建 Notion 数据库缺失的属性字段 | Auto-create missing Notion database properties
- 通过 slug 判断文章是否已存在，支持增量更新 | Incremental sync based on slug
- 比较修改时间，跳过未变更的文章 | Skip unmodified posts by comparing modification time
- 文章正文作为 Notion 页面内容（支持 Markdown）| Post content as Notion page body (Markdown supported)

## 效果预览 | Screenshot

![效果预览 Screenshot](assets/screenshot1.png)

## 安装 | Installation

```bash
npm install
```

## 配置 | Configuration

复制环境变量示例文件并编辑：

Copy and edit the environment variables file:

```bash
cp .env.example .env
```

配置项说明 | Configuration options:

| 变量 Variable | 说明 Description |
|---------------|------------------|
| `NOTION_KEY` | Notion Integration Token |
| `NOTION_DATABASE_ID` | 目标 Notion 数据库 ID / Target Notion database ID |
| `TYPECHO_DB_ADAPTER` | 数据库类型，目前仅支持 `postgresql` / Database type, only `postgresql` supported |
| `TYPECHO_DB_HOST` | 数据库主机地址 / Database host |
| `TYPECHO_DB_PORT` | 数据库端口 / Database port |
| `TYPECHO_DB_USER` | 数据库用户名 / Database username |
| `TYPECHO_DB_PASSWORD` | 数据库密码 / Database password |
| `TYPECHO_DB_DATABASE` | 数据库名称 / Database name |
| `TYPECHO_DB_PREFIX` | Typecho 表前缀，默认 `typecho_` / Table prefix, default `typecho_` |

**注意：** 导出 Markdown 功能不需要配置 Notion 相关环境变量。

**Note:** Markdown export doesn't require Notion environment variables.

## 使用 | Usage

### 同步到 Notion | Sync to Notion

```bash
# 开发模式运行 | Development mode
npm run dev

# 编译后运行 | Build and run
npm run build
npm start

# 跳过缓存 | Skip cache
npm run dev -- --no-cache

# 清除缓存 | Clear cache
npm run dev -- --clear-cache
```

### 导出为 Markdown | Export as Markdown

将 Typecho 文章导出为 Markdown 文件，每个文章一个 `.md` 文件，文件名格式：`{year}-{month}-{day}-{slug}.md`

Export Typecho posts as Markdown files, one `.md` file per post, filename format: `{year}-{month}-{day}-{slug}.md`

**文件格式示例 | File Format Example:**

```markdown
---
title: "智能生活管家项目之一-系统简介"
postSlug: "1087"
category: "生活笔记"
created: "2018-12-04T02:30:00.000+00:00"
modified: "2024-11-20T08:44:00.000+00:00"
status: "publish"
tags: ["2018"]
---

文章内容...
```

**使用方法 | Usage:**

```bash
# 导出到默认目录 ./posts | Export to default directory ./posts
npm run dev -- markdown

# 或使用 export 命令 | Or use export command
npm run dev -- export

# 指定导出目录 | Specify export directory
npm run dev -- markdown --output-dir=/path/to/export
npm run dev -- markdown -o ./my-posts

# 跳过缓存 | Skip cache
npm run dev -- markdown --no-cache

# 组合使用 | Combined usage
npm run dev -- markdown -o ./blog/posts --no-cache
```

**特性 | Features:**

- ✅ 自动创建导出目录 | Auto-create export directory
- ✅ 文件名格式：`YYYY-MM-DD-slug.md` | Filename format: `YYYY-MM-DD-slug.md`
- ✅ 包含完整 frontmatter 元数据 | Include complete frontmatter metadata
- ✅ 比较修改时间，智能更新 | Compare modification time, smart update
- ✅ 跳过未变更的文章 | Skip unmodified posts

### 本地运行 | Local

```bash
# 开发模式运行 | Development mode
npm run dev

# 编译后运行 | Build and run
npm run build
npm start

# 跳过缓存 | Skip cache
npm run dev -- --no-cache

# 清除缓存 | Clear cache
npm run dev -- --clear-cache
```

### Docker

同步到 Notion | Sync to Notion:

```bash
# 使用环境变量运行 | Run with environment variables
docker run --rm \
  -e NOTION_KEY="secret_xxx" \
  -e NOTION_DATABASE_ID="your_database_id" \
  -e TYPECHO_DB_HOST="your_db_host" \
  -e TYPECHO_DB_PORT="5432" \
  -e TYPECHO_DB_USER="typecho" \
  -e TYPECHO_DB_PASSWORD="your_password" \
  -e TYPECHO_DB_DATABASE="typecho" \
  songtianlun/sync-typecho-to-notion

# 使用 env 文件运行 | Run with env file
docker run --rm --env-file .env songtianlun/sync-typecho-to-notion
```

导出为 Markdown | Export as Markdown:

```bash
# 导出文件到宿主机目录 | Export files to host directory
docker run --rm \
  --env-file .env \
  -v $(pwd)/posts:/app/posts \
  songtianlun/sync-typecho-to-notion markdown -o /app/posts
```

## 缓存 | Cache

为避免调试时频繁查询数据库，工具会将文章数据缓存到 `.cache/` 目录，默认有效期 1 小时。

To avoid frequent database queries during debugging, the tool caches post data in `.cache/` directory with 1-hour expiry.

- 缓存有效时自动使用 | Auto-use when cache is valid
- `--no-cache` 跳过缓存 | Skip cache
- `--clear-cache` 清除缓存 | Clear cache

## 高级功能 | Advanced Features

### 友链同步 | Links Sync (Handsome Theme)

支持同步 Handsome 主题的友链数据到 Notion 数据库。

Sync Handsome theme's links to a separate Notion database.

**配置 | Configuration:**

在 `.env` 中添加友链数据库 ID：

Add links database ID in `.env`:

```env
NOTION_LINKS_DATABASE_ID=your_links_database_id
```

**使用 | Usage:**

```bash
# 本地运行 | Local
npm run dev -- links

# Docker
docker run --rm --env-file .env songtianlun/sync-typecho-to-notion links
```

**友链数据库字段 | Links Database Fields:**

| 字段 Field | 类型 Type | 说明 Description |
|------------|-----------|------------------|
| Name | title | 友链名称 / Link name |
| URL | url | 链接地址，用于去重 / Link URL, for deduplication |
| Sort | select | 分类 / Category |
| Image | files | Logo 图片 / Logo image |
| Description | rich_text | 简介 / Description |

## 命令总览 | Commands Overview

```bash
# 同步文章到 Notion | Sync posts to Notion
npm run dev                         # 默认命令 / Default command
npm run dev -- --no-cache          # 跳过缓存 / Skip cache
npm run dev -- --clear-cache       # 清除缓存 / Clear cache

# 同步友链到 Notion | Sync links to Notion
npm run dev -- links

# 导出文章为 Markdown | Export posts as Markdown
npm run dev -- markdown                          # 导出到默认目录 ./posts / Export to default ./posts
npm run dev -- export                            # 同上 / Same as above
npm run dev -- markdown -o ./my-posts            # 指定导出目录 / Specify directory
npm run dev -- markdown --output-dir=/path/to/export
npm run dev -- markdown --no-cache               # 跳过缓存 / Skip cache
npm run dev -- markdown -o ./blog --no-cache     # 组合使用 / Combined
```

## Notion 数据库字段 | Database Fields

同步时会自动创建以下字段（如不存在）：

The following fields will be auto-created if not exist:

| 字段 Field | 类型 Type | 说明 Description |
|------------|-----------|------------------|
| Title | title | 文章标题 / Post title |
| Slug | rich_text | 文章 slug，用于去重 / For deduplication |
| Category | multi_select | 分类 / Categories |
| Tags | multi_select | 标签 / Tags |
| Status | select | 发布状态 / Publish status |
| Created | date | 创建时间 / Creation time |
| Modified | date | 修改时间 / Modification time |

## 开发 | Development

```bash
# 安装依赖 | Install dependencies
npm install

# 开发模式 | Dev mode
npm run dev

# 编译 | Build
npm run build

# 构建 Docker 镜像 | Build Docker image
docker build -t sync-typecho-to-notion .
```

## License

MIT
