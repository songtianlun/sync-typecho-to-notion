import * as fs from 'fs';
import * as path from 'path';
import { TypechoPost } from '../types';

export class MarkdownExporter {
  private exportDir: string;

  constructor(exportDir: string) {
    this.exportDir = exportDir;
  }

  /**
   * 导出文章到 Markdown 文件
   */
  async exportPost(post: TypechoPost): Promise<{ action: 'created' | 'updated' | 'skipped'; filename: string }> {
    // 确保导出目录存在
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }

    // 生成文件名：{{year}}-{{month}}-{{day}}-{{slug}}.md
    const filename = this.generateFilename(post);
    const filepath = path.join(this.exportDir, filename);

    // 检查文件是否存在
    if (fs.existsSync(filepath)) {
      // 读取现有文件的 frontmatter
      const existingContent = fs.readFileSync(filepath, 'utf-8');
      const existingModified = this.extractModifiedFromFrontmatter(existingContent);

      if (existingModified) {
        const postModified = new Date(post.modified * 1000).toISOString();

        // 对比 modified 时间
        if (postModified <= existingModified) {
          // Typecho 内容没有更新，跳过
          return { action: 'skipped', filename };
        }
      }

      // Typecho 内容已更新，重写文件
      this.writeMarkdownFile(filepath, post);
      return { action: 'updated', filename };
    }

    // 文件不存在，创建新文件
    this.writeMarkdownFile(filepath, post);
    return { action: 'created', filename };
  }

  /**
   * 生成文件名：{{year}}-{{month}}-{{day}}-{{slug}}.md
   * 使用 UTC 时区，避免时区偏移
   */
  private generateFilename(post: TypechoPost): string {
    const date = new Date(post.created * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}-${post.slug}.md`;
  }

  /**
   * 写入 Markdown 文件
   */
  private writeMarkdownFile(filepath: string, post: TypechoPost): void {
    const frontmatter = this.generateFrontmatter(post);
    const content = `${frontmatter}\n\n${post.text}`;

    fs.writeFileSync(filepath, content, 'utf-8');
  }

  /**
   * 生成 frontmatter
   */
  private generateFrontmatter(post: TypechoPost): string {
    const created = new Date(post.created * 1000).toISOString();
    const modified = new Date(post.modified * 1000).toISOString();
    const category = post.categories.length > 0 ? post.categories[0] : '';

    return `---
title: "${post.title.replace(/"/g, '\\"')}"
postSlug: "${post.slug}"
category: "${category}"
created: "${created}"
modified: "${modified}"
status: "${post.status}"
tags: [${post.tags.map(tag => `"${tag}"`).join(', ')}]
---`;
  }

  /**
   * 从 frontmatter 中提取 modified 时间
   */
  private extractModifiedFromFrontmatter(content: string): string | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return null;
    }

    const frontmatter = match[1];
    const modifiedMatch = frontmatter.match(/^modified:\s*"(.+?)"$/m);

    return modifiedMatch ? modifiedMatch[1] : null;
  }
}
