import * as fs from 'fs';
import * as crypto from 'crypto';
import { TypechoComment, TypechoPost, Remark42Comment } from '../types';

export class Remark42Exporter {
  private outputFile: string;
  private siteId: string;
  private siteUrl: string;

  constructor(outputFile: string, siteId: string, siteUrl: string) {
    this.outputFile = outputFile;
    this.siteId = siteId;
    this.siteUrl = siteUrl.replace(/\/$/, ''); // 移除末尾斜杠
  }

  /**
   * 导出评论到 Remark42 备份格式
   */
  async exportComments(comments: TypechoComment[], posts: TypechoPost[]): Promise<void> {
    // 创建文章 ID 到文章信息的映射
    const postMap = new Map<number, TypechoPost>();
    for (const post of posts) {
      postMap.set(post.cid, post);
    }

    // 转换评论为 Remark42 格式
    const remark42Comments: Remark42Comment[] = [];
    for (const comment of comments) {
      const post = postMap.get(comment.cid);
      if (!post) {
        console.warn(`Warning: Post not found for comment ${comment.coid}, skipping...`);
        continue;
      }

      const remark42Comment = this.convertComment(comment, post);
      remark42Comments.push(remark42Comment);
    }

    // 写入文件
    this.writeBackupFile(remark42Comments);

    console.log(`Exported ${remark42Comments.length} comments to ${this.outputFile}`);
  }

  /**
   * 转换 Typecho 评论为 Remark42 格式
   */
  private convertComment(comment: TypechoComment, post: TypechoPost): Remark42Comment {
    // 生成评论 ID (使用 coid)
    const id = this.generateId(comment.coid.toString());

    // 生成父评论 ID (如果有)
    const pid = comment.parent > 0 ? this.generateId(comment.parent.toString()) : '';

    // 生成用户 ID
    const userId = this.generateUserId(comment.author, comment.mail);

    // 生成头像 URL (使用 Gravatar)
    const picture = this.generateGravatarUrl(comment.mail);

    // 对 IP 进行哈希处理
    const ipHash = this.hashIp(comment.ip);

    // 生成文章 URL (使用 slug)
    const postUrl = `${this.siteUrl}/archives/${post.slug}`;

    // 转换时间为 ISO 8601 格式
    const time = new Date(comment.created * 1000).toISOString();

    // 处理评论内容（将换行转换为 HTML）
    const htmlText = this.convertTextToHtml(comment.text);

    return {
      id,
      pid,
      text: htmlText,
      orig: comment.text,
      user: {
        name: comment.author,
        id: userId,
        picture,
        ip: ipHash,
        admin: comment.authorId > 0, // 登录用户视为 admin
        site_id: this.siteId,
      },
      locator: {
        site: this.siteId,
        url: postUrl,
      },
      score: 0,
      vote: 0,
      time,
      title: post.title,
    };
  }

  /**
   * 生成评论 ID (UUID 格式)
   */
  private generateId(seed: string): string {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    // 转换为 UUID v4 格式
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16), // version 4
      hash.substring(16, 20),
      hash.substring(20, 32),
    ].join('-');
  }

  /**
   * 生成用户 ID
   */
  private generateUserId(author: string, email: string): string {
    if (email) {
      // 使用邮箱生成唯一 ID
      const hash = crypto.createHash('sha1').update(email.toLowerCase()).digest('hex');
      return `anonymous_${hash}`;
    } else {
      // 使用作者名生成 ID
      const hash = crypto.createHash('sha1').update(author).digest('hex');
      return `anonymous_${hash}`;
    }
  }

  /**
   * 生成 Gravatar 头像 URL
   */
  private generateGravatarUrl(email: string): string {
    if (!email) {
      return `https://${this.siteId}/api/v1/avatar/default.image`;
    }

    const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
    return `https://${this.siteId}/api/v1/avatar/${hash}.image`;
  }

  /**
   * 对 IP 地址进行哈希处理
   */
  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex');
  }

  /**
   * 将纯文本转换为 HTML
   */
  private convertTextToHtml(text: string): string {
    // 简单的文本到 HTML 转换
    const lines = text.split('\n');
    const htmlLines = lines.map(line => {
      if (line.trim() === '') {
        return '';
      }
      return `<p>${this.escapeHtml(line)}</p>`;
    });
    return htmlLines.join('\n');
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * 写入备份文件
   */
  private writeBackupFile(comments: Remark42Comment[]): void {
    const lines: string[] = [];

    // 第一行：版本信息
    lines.push(JSON.stringify({ version: 1, users: [], posts: [] }));

    // 后续行：每个评论一行
    for (const comment of comments) {
      lines.push(JSON.stringify(comment));
    }

    // 写入文件
    fs.writeFileSync(this.outputFile, lines.join('\n'), 'utf-8');
  }
}
