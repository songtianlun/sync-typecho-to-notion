import { Client } from '@notionhq/client';
import {
  CreatePageParameters,
  UpdatePageParameters,
  BlockObjectRequest,
  UpdateDatabaseParameters,
} from '@notionhq/client/build/src/api-endpoints';
import { NotionConfig, TypechoPost, NotionPageMap } from '../types';

// Notion 支持的代码语言类型（使用 SDK 兼容的定义）
type CodeLanguage =
  | 'abap' | 'agda' | 'arduino' | 'ascii art' | 'assembly' | 'bash' | 'basic' | 'bnf'
  | 'c' | 'c#' | 'c++' | 'clojure' | 'coffeescript' | 'coq' | 'css' | 'dart' | 'dhall' | 'diff'
  | 'docker' | 'ebnf' | 'elixir' | 'elm' | 'erlang' | 'f#' | 'flow' | 'fortran' | 'gherkin'
  | 'glsl' | 'go' | 'graphql' | 'groovy' | 'haskell' | 'hcl' | 'html' | 'idris' | 'java'
  | 'javascript' | 'json' | 'julia' | 'kotlin' | 'latex' | 'less' | 'lisp' | 'livescript'
  | 'llvm ir' | 'lua' | 'makefile' | 'markdown' | 'markup' | 'matlab' | 'mathematica' | 'mermaid'
  | 'nix' | 'notion formula' | 'objective-c' | 'ocaml' | 'pascal' | 'perl' | 'php' | 'plain text'
  | 'powershell' | 'prolog' | 'protobuf' | 'purescript' | 'python' | 'r' | 'racket' | 'reason'
  | 'ruby' | 'rust' | 'sass' | 'scala' | 'scheme' | 'scss' | 'shell' | 'smalltalk' | 'solidity'
  | 'sql' | 'swift' | 'toml' | 'typescript' | 'vb.net' | 'verilog' | 'vhdl' | 'visual basic'
  | 'webassembly' | 'xml' | 'yaml' | 'java/c/c++/c#';

// 需要创建的数据库属性（不包括 title，因为数据库默认有）
const REQUIRED_PROPERTIES = {
  Slug: { rich_text: {} },
  Category: { multi_select: {} },
  Tags: { multi_select: {} },
  Status: {
    select: {
      options: [
        { name: 'publish', color: 'green' as const },
        { name: 'draft', color: 'yellow' as const },
        { name: 'hidden', color: 'gray' as const },
        { name: 'waiting', color: 'orange' as const },
        { name: 'private', color: 'red' as const },
      ],
    },
  },
  Created: { date: {} },
  Modified: { date: {} },
};

export class NotionClient {
  private client: Client;
  private databaseId: string;
  private titlePropertyName: string = 'Name'; // 默认 title 属性名

  constructor(config: NotionConfig) {
    this.client = new Client({ auth: config.apiKey });
    this.databaseId = config.databaseId;
  }

  // 检查并创建缺失的数据库属性
  async ensureDatabaseProperties(): Promise<void> {
    const database = await this.client.databases.retrieve({
      database_id: this.databaseId,
    });

    const existingProperties = database.properties;

    // 找到现有的 title 属性名称
    for (const [name, prop] of Object.entries(existingProperties)) {
      if (prop.type === 'title') {
        this.titlePropertyName = name;
        console.log(`Found title property: "${name}"`);
        break;
      }
    }

    const missingProperties: UpdateDatabaseParameters['properties'] = {};

    for (const [name, config] of Object.entries(REQUIRED_PROPERTIES)) {
      if (!existingProperties[name]) {
        console.log(`Creating missing property: ${name}`);
        missingProperties[name] = config as any;
      }
    }

    if (Object.keys(missingProperties).length > 0) {
      await this.client.databases.update({
        database_id: this.databaseId,
        properties: missingProperties,
      });
      console.log('Database properties updated successfully.');
    } else {
      console.log('All required properties exist.');
    }
  }

  // 查询已存在的文章（通过 slug）
  async queryExistingPosts(): Promise<NotionPageMap> {
    const pageMap: NotionPageMap = {};
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const response = await this.client.databases.query({
        database_id: this.databaseId,
        start_cursor: startCursor,
        page_size: 100,
      });

      for (const page of response.results) {
        if ('properties' in page) {
          const slugProp = page.properties['Slug'];
          if (slugProp && slugProp.type === 'rich_text') {
            const richTextArray = slugProp.rich_text as Array<{ plain_text: string }>;
            if (richTextArray.length > 0) {
              const slug = richTextArray[0].plain_text;
              const modifiedProp = page.properties['Modified'];
              let modified: string | undefined;
              if (modifiedProp && modifiedProp.type === 'date' && modifiedProp.date) {
                modified = modifiedProp.date.start;
              }
              pageMap[slug] = { pageId: page.id, modified };
            }
          }
        }
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }

    return pageMap;
  }

  // 创建新页面
  async createPage(post: TypechoPost): Promise<string> {
    const properties = this.buildProperties(post);
    const children = this.convertContentToBlocks(post.text);

    // Notion API 限制创建页面时最多 100 个子块
    const initialChildren = children.slice(0, 100);

    const response = await this.client.pages.create({
      parent: { database_id: this.databaseId },
      properties,
      children: initialChildren,
    } as CreatePageParameters);

    // 如果有超过 100 个块，使用 append 追加剩余块
    if (children.length > 100) {
      const pageId = response.id;
      for (let i = 100; i < children.length; i += 100) {
        const chunk = children.slice(i, i + 100);
        await this.client.blocks.children.append({
          block_id: pageId,
          children: chunk,
        });
      }
    }

    return response.id;
  }

  // 更新已存在的页面
  async updatePage(pageId: string, post: TypechoPost): Promise<void> {
    const properties = this.buildProperties(post);

    // 更新页面属性
    await this.client.pages.update({
      page_id: pageId,
      properties,
    } as UpdatePageParameters);

    // 删除现有内容块并添加新内容
    await this.replacePageContent(pageId, post.text);
  }

  // 构建页面属性
  private buildProperties(post: TypechoPost): CreatePageParameters['properties'] {
    const createdDate = new Date(post.created * 1000).toISOString();
    const modifiedDate = new Date(post.modified * 1000).toISOString();

    return {
      [this.titlePropertyName]: {
        title: [{ text: { content: post.title } }],
      },
      Slug: {
        rich_text: [{ text: { content: post.slug } }],
      },
      Category: {
        multi_select: post.categories.map((name) => ({ name })),
      },
      Tags: {
        multi_select: post.tags.map((name) => ({ name })),
      },
      Status: {
        select: { name: post.status },
      },
      Created: {
        date: { start: createdDate },
      },
      Modified: {
        date: { start: modifiedDate },
      },
    };
  }

  // Rich text item 类型定义
  private createRichTextItem(
    content: string,
    options: {
      link?: { url: string };
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      code?: boolean;
    } = {}
  ): {
    type: 'text';
    text: { content: string; link?: { url: string } };
    annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
  } {
    const item: {
      type: 'text';
      text: { content: string; link?: { url: string } };
      annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
    } = {
      type: 'text',
      text: { content },
    };

    if (options.link) {
      item.text.link = options.link;
    }

    // 只有当有格式化选项时才添加 annotations
    if (options.bold || options.italic || options.strikethrough || options.code) {
      item.annotations = {};
      if (options.bold) item.annotations.bold = true;
      if (options.italic) item.annotations.italic = true;
      if (options.strikethrough) item.annotations.strikethrough = true;
      if (options.code) item.annotations.code = true;
    }

    return item;
  }

  // 验证并清理 URL
  private sanitizeUrl(url: string): string | null {
    if (!url || !url.trim()) {
      return null;
    }

    // 解码 HTML 实体
    let sanitized = url
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    // 跳过空 URL、纯锚点、相对路径
    if (!sanitized || sanitized.startsWith('#') || sanitized.startsWith('/')) {
      return null;
    }

    // 验证是否是有效的 URL 格式
    try {
      // 如果不是完整 URL，尝试添加协议
      if (!sanitized.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
        // 可能是省略协议的 URL，如 "example.com"
        if (sanitized.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/)) {
          sanitized = 'https://' + sanitized;
        } else {
          return null;
        }
      }

      // 验证 URL 格式
      new URL(sanitized);
      return sanitized;
    } catch {
      return null;
    }
  }

  // 解析文本中的 Markdown 格式（加粗、斜体、删除线、内联代码、链接），返回 Notion rich_text 数组
  private parseRichText(
    text: string
  ): Array<{
    type: 'text';
    text: { content: string; link?: { url: string } };
    annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
  }> {
    const result: Array<{
      type: 'text';
      text: { content: string; link?: { url: string } };
      annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
    }> = [];

    // 综合正则匹配：内联代码、链接、加粗、斜体、删除线
    // 顺序很重要：先匹配内联代码（避免内部格式被解析），再匹配链接，再匹配其他格式
    const tokenRegex =
      /`([^`]+)`|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<(https?:\/\/[^>]+)>|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*([^*]+)\*(?!\*)|\b_([^_]+)_\b|~~(.+?)~~/g;

    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      // 添加匹配前的普通文本
      if (match.index > lastIndex) {
        const plainText = text.slice(lastIndex, match.index);
        if (plainText) {
          result.push(this.createRichTextItem(plainText));
        }
      }

      if (match[1] !== undefined) {
        // `code` 内联代码
        result.push(this.createRichTextItem(match[1], { code: true }));
      } else if (match[2] !== undefined && match[3] !== undefined) {
        // [text](url) 格式链接
        const linkText = match[2] || match[3];
        const rawUrl = match[3];
        const sanitizedUrl = this.sanitizeUrl(rawUrl);

        // 递归解析链接文本中的格式（如加粗）
        const parsedLinkText = this.parseInlineFormat(linkText);

        // 如果 URL 无效，转换为普通文本而不是链接
        if (sanitizedUrl) {
          for (const item of parsedLinkText) {
            result.push(
              this.createRichTextItem(item.content, {
                link: { url: sanitizedUrl },
                bold: item.bold,
                italic: item.italic,
                strikethrough: item.strikethrough,
                code: item.code,
              })
            );
          }
        } else {
          // URL 无效，作为普通文本处理
          for (const item of parsedLinkText) {
            result.push(
              this.createRichTextItem(item.content, {
                bold: item.bold,
                italic: item.italic,
                strikethrough: item.strikethrough,
                code: item.code,
              })
            );
          }
        }
      } else if (match[4] !== undefined) {
        // <url> 自动链接格式
        const sanitizedUrl = this.sanitizeUrl(match[4]);
        if (sanitizedUrl) {
          result.push(this.createRichTextItem(match[4], { link: { url: sanitizedUrl } }));
        } else {
          result.push(this.createRichTextItem(match[4]));
        }
      } else if (match[5] !== undefined) {
        // **text** 加粗
        const parsedContent = this.parseInlineFormat(match[5], { bold: true });
        for (const item of parsedContent) {
          result.push(
            this.createRichTextItem(item.content, {
              bold: true,
              italic: item.italic,
              strikethrough: item.strikethrough,
              code: item.code,
            })
          );
        }
      } else if (match[6] !== undefined) {
        // __text__ 加粗
        const parsedContent = this.parseInlineFormat(match[6], { bold: true });
        for (const item of parsedContent) {
          result.push(
            this.createRichTextItem(item.content, {
              bold: true,
              italic: item.italic,
              strikethrough: item.strikethrough,
              code: item.code,
            })
          );
        }
      } else if (match[7] !== undefined) {
        // *text* 斜体
        const parsedContent = this.parseInlineFormat(match[7], { italic: true });
        for (const item of parsedContent) {
          result.push(
            this.createRichTextItem(item.content, {
              bold: item.bold,
              italic: true,
              strikethrough: item.strikethrough,
              code: item.code,
            })
          );
        }
      } else if (match[8] !== undefined) {
        // _text_ 斜体
        const parsedContent = this.parseInlineFormat(match[8], { italic: true });
        for (const item of parsedContent) {
          result.push(
            this.createRichTextItem(item.content, {
              bold: item.bold,
              italic: true,
              strikethrough: item.strikethrough,
              code: item.code,
            })
          );
        }
      } else if (match[9] !== undefined) {
        // ~~text~~ 删除线
        const parsedContent = this.parseInlineFormat(match[9], { strikethrough: true });
        for (const item of parsedContent) {
          result.push(
            this.createRichTextItem(item.content, {
              bold: item.bold,
              italic: item.italic,
              strikethrough: true,
              code: item.code,
            })
          );
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // 添加最后剩余的普通文本
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      if (remainingText) {
        result.push(this.createRichTextItem(remainingText));
      }
    }

    // 如果没有任何匹配，返回原始文本
    if (result.length === 0) {
      result.push(this.createRichTextItem(text));
    }

    return result;
  }

  // 解析内联格式（用于递归解析嵌套格式）
  private parseInlineFormat(
    text: string,
    inherited: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean } = {}
  ): Array<{
    content: string;
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  }> {
    const result: Array<{
      content: string;
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      code?: boolean;
    }> = [];

    // 简化的内联格式匹配（不包括链接，避免循环）
    const inlineRegex = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*([^*]+)\*(?!\*)|\b_([^_]+)_\b|~~(.+?)~~/g;

    let lastIndex = 0;
    let match;

    while ((match = inlineRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const plainText = text.slice(lastIndex, match.index);
        if (plainText) {
          result.push({ content: plainText, ...inherited });
        }
      }

      if (match[1] !== undefined) {
        // `code`
        result.push({ content: match[1], ...inherited, code: true });
      } else if (match[2] !== undefined) {
        // **bold**
        result.push({ content: match[2], ...inherited, bold: true });
      } else if (match[3] !== undefined) {
        // __bold__
        result.push({ content: match[3], ...inherited, bold: true });
      } else if (match[4] !== undefined) {
        // *italic*
        result.push({ content: match[4], ...inherited, italic: true });
      } else if (match[5] !== undefined) {
        // _italic_
        result.push({ content: match[5], ...inherited, italic: true });
      } else if (match[6] !== undefined) {
        // ~~strikethrough~~
        result.push({ content: match[6], ...inherited, strikethrough: true });
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      if (remainingText) {
        result.push({ content: remainingText, ...inherited });
      }
    }

    if (result.length === 0) {
      result.push({ content: text, ...inherited });
    }

    return result;
  }

  // 将 Markdown 内容转换为 Notion blocks
  private convertContentToBlocks(content: string): BlockObjectRequest[] {
    const blocks: BlockObjectRequest[] = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 代码块（不解析链接）
      if (line.startsWith('```')) {
        const language = line.slice(3).trim() || 'plain text';
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        blocks.push({
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: codeLines.join('\n').substring(0, 2000) } }],
            language: this.mapLanguage(language),
          },
        });
        i++;
        continue;
      }

      // 标题（从多到少匹配，避免 #### 被 ### 误匹配）
      // Notion 只支持 h1-h3，h4-h6 映射到 h3
      if (line.startsWith('###### ')) {
        blocks.push({
          type: 'heading_3',
          heading_3: {
            rich_text: this.parseRichText(line.slice(7)),
          },
        });
        i++;
        continue;
      }

      if (line.startsWith('##### ')) {
        blocks.push({
          type: 'heading_3',
          heading_3: {
            rich_text: this.parseRichText(line.slice(6)),
          },
        });
        i++;
        continue;
      }

      if (line.startsWith('#### ')) {
        blocks.push({
          type: 'heading_3',
          heading_3: {
            rich_text: this.parseRichText(line.slice(5)),
          },
        });
        i++;
        continue;
      }

      if (line.startsWith('### ')) {
        blocks.push({
          type: 'heading_3',
          heading_3: {
            rich_text: this.parseRichText(line.slice(4)),
          },
        });
        i++;
        continue;
      }

      if (line.startsWith('## ')) {
        blocks.push({
          type: 'heading_2',
          heading_2: {
            rich_text: this.parseRichText(line.slice(3)),
          },
        });
        i++;
        continue;
      }

      if (line.startsWith('# ')) {
        blocks.push({
          type: 'heading_1',
          heading_1: {
            rich_text: this.parseRichText(line.slice(2)),
          },
        });
        i++;
        continue;
      }

      // 引用
      if (line.startsWith('> ')) {
        blocks.push({
          type: 'quote',
          quote: {
            rich_text: this.parseRichText(line.slice(2)),
          },
        });
        i++;
        continue;
      }

      // 无序列表
      if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: this.parseRichText(line.slice(2)),
          },
        });
        i++;
        continue;
      }

      // 有序列表
      const orderedMatch = line.match(/^\d+\.\s/);
      if (orderedMatch) {
        blocks.push({
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: this.parseRichText(line.slice(orderedMatch[0].length)),
          },
        });
        i++;
        continue;
      }

      // 分割线
      if (line === '---' || line === '***' || line === '___') {
        blocks.push({
          type: 'divider',
          divider: {},
        });
        i++;
        continue;
      }

      // 图片（独立一行的图片转换为 image block）
      const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
      if (imageMatch) {
        const altText = imageMatch[1];
        const imageUrl = imageMatch[2];
        blocks.push({
          type: 'image',
          image: {
            type: 'external',
            external: { url: imageUrl },
            caption: altText ? [{ type: 'text', text: { content: altText } }] : [],
          },
        } as BlockObjectRequest);
        i++;
        continue;
      }

      // 普通段落（跳过空行）
      if (line.trim()) {
        // Notion rich_text 有 2000 字符限制
        const truncatedContent = line.substring(0, 2000);
        blocks.push({
          type: 'paragraph',
          paragraph: {
            rich_text: this.parseRichText(truncatedContent),
          },
        });
      }

      i++;
    }

    return blocks;
  }

  // Notion 支持的所有语言
  private static readonly SUPPORTED_LANGUAGES = new Set([
    'abap', 'agda', 'arduino', 'ascii art', 'assembly', 'bash', 'basic', 'bnf',
    'c', 'c#', 'c++', 'clojure', 'coffeescript', 'coq', 'css', 'dart', 'dhall', 'diff',
    'docker', 'ebnf', 'elixir', 'elm', 'erlang', 'f#', 'flow', 'fortran', 'gherkin',
    'glsl', 'go', 'graphql', 'groovy', 'haskell', 'hcl', 'html', 'idris', 'java',
    'javascript', 'json', 'julia', 'kotlin', 'latex', 'less', 'lisp', 'livescript',
    'llvm ir', 'lua', 'makefile', 'markdown', 'markup', 'matlab', 'mathematica', 'mermaid',
    'nix', 'notion formula', 'objective-c', 'ocaml', 'pascal', 'perl', 'php', 'plain text',
    'powershell', 'prolog', 'protobuf', 'purescript', 'python', 'r', 'racket', 'reason',
    'ruby', 'rust', 'sass', 'scala', 'scheme', 'scss', 'shell', 'smalltalk', 'solidity',
    'sql', 'swift', 'toml', 'typescript', 'vb.net', 'verilog', 'vhdl', 'visual basic',
    'webassembly', 'xml', 'yaml', 'java/c/c++/c#',
  ]);

  // 映射编程语言到 Notion 支持的语言
  private mapLanguage(lang: string): CodeLanguage {
    const languageMap: { [key: string]: CodeLanguage } = {
      // 常见别名
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      rb: 'ruby',
      sh: 'bash',
      zsh: 'bash',
      fish: 'bash',
      yml: 'yaml',
      dockerfile: 'docker',
      md: 'markdown',
      // 不支持的语言映射到相近语言
      ini: 'toml',
      conf: 'toml',
      cfg: 'toml',
      properties: 'toml',
      env: 'shell',
      dotenv: 'shell',
      vim: 'plain text',
      viml: 'plain text',
      vimscript: 'plain text',
      reg: 'plain text',
      nginx: 'plain text',
      apache: 'plain text',
      htaccess: 'plain text',
      http: 'plain text',
      console: 'shell',
      terminal: 'shell',
      text: 'plain text',
      txt: 'plain text',
      log: 'plain text',
      asm: 'assembly',
      nasm: 'assembly',
      terraform: 'hcl',
      tf: 'hcl',
      jsonc: 'json',
      json5: 'json',
      jsx: 'javascript',
      tsx: 'typescript',
      cjs: 'javascript',
      mjs: 'javascript',
      mts: 'typescript',
      cts: 'typescript',
      vue: 'html',
      svelte: 'html',
      astro: 'html',
      objc: 'objective-c',
      objectivec: 'objective-c',
      cs: 'c#',
      csharp: 'c#',
      cpp: 'c++',
      cc: 'c++',
      cxx: 'c++',
      h: 'c',
      hpp: 'c++',
      rs: 'rust',
      kt: 'kotlin',
      kts: 'kotlin',
      ex: 'elixir',
      exs: 'elixir',
      erl: 'erlang',
      hs: 'haskell',
      ml: 'ocaml',
      fs: 'f#',
      fsharp: 'f#',
      pl: 'perl',
      pm: 'perl',
      psm1: 'powershell',
      ps1: 'powershell',
      bat: 'powershell',
      cmd: 'powershell',
    };
    const normalized = lang.toLowerCase().trim();
    // 先查映射表
    if (languageMap[normalized]) {
      return languageMap[normalized];
    }
    // 再检查是否是 Notion 直接支持的语言
    if (NotionClient.SUPPORTED_LANGUAGES.has(normalized)) {
      return normalized as CodeLanguage;
    }
    // 都不匹配则使用 plain text
    return 'plain text';
  }

  // 替换页面内容
  private async replacePageContent(pageId: string, content: string): Promise<void> {
    // 获取并删除所有现有块（处理分页）
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const existingBlocks = await this.client.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        start_cursor: startCursor,
      });

      // 删除当前批次的块
      for (const block of existingBlocks.results) {
        if ('id' in block) {
          await this.client.blocks.delete({ block_id: block.id });
        }
      }

      hasMore = existingBlocks.has_more;
      startCursor = existingBlocks.next_cursor ?? undefined;
    }

    // 添加新内容
    const newBlocks = this.convertContentToBlocks(content);
    if (newBlocks.length > 0) {
      // Notion API 限制每次最多添加 100 个块
      for (let i = 0; i < newBlocks.length; i += 100) {
        const chunk = newBlocks.slice(i, i + 100);
        await this.client.blocks.children.append({
          block_id: pageId,
          children: chunk,
        });
      }
    }
  }
}
