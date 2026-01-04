import { Client } from '@notionhq/client';
import {
  CreatePageParameters,
  UpdatePageParameters,
  UpdateDatabaseParameters,
} from '@notionhq/client/build/src/api-endpoints';
import { NotionConfig, TypechoLink } from '../types';

// 友链页面映射（url -> pageId）
export interface NotionLinkPageMap {
  [url: string]: {
    pageId: string;
  };
}

// 友链数据库需要的属性
const REQUIRED_PROPERTIES = {
  URL: { url: {} },
  Sort: { select: {} },
  Image: { files: {} },
  Description: { rich_text: {} },
};

export class NotionLinksClient {
  private client: Client;
  private databaseId: string;
  private titlePropertyName: string = 'Name';

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

    // 检测 Image 字段的类型（如果已存在）
    const imageProp = existingProperties['Image'];
    if (imageProp && imageProp.type !== 'files') {
      throw new Error(
        `Image property exists but has wrong type "${imageProp.type}". ` +
        `Expected "files" type. Please delete the "Image" property in Notion and re-run.`
      );
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

  // 查询已存在的友链（通过 URL）
  async queryExistingLinks(): Promise<NotionLinkPageMap> {
    const pageMap: NotionLinkPageMap = {};
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
          const urlProp = page.properties['URL'];
          if (urlProp && urlProp.type === 'url' && urlProp.url && typeof urlProp.url === 'string') {
            pageMap[urlProp.url] = { pageId: page.id };
          }
        }
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }

    return pageMap;
  }

  // 创建新友链页面
  async createPage(link: TypechoLink): Promise<string> {
    const properties = this.buildProperties(link);

    const response = await this.client.pages.create({
      parent: { database_id: this.databaseId },
      properties,
    } as CreatePageParameters);

    return response.id;
  }

  // 更新已存在的友链页面
  async updatePage(pageId: string, link: TypechoLink): Promise<void> {
    const properties = this.buildProperties(link);

    await this.client.pages.update({
      page_id: pageId,
      properties,
    } as UpdatePageParameters);
  }

  // 构建页面属性
  private buildProperties(link: TypechoLink): CreatePageParameters['properties'] {
    const properties: CreatePageParameters['properties'] = {
      [this.titlePropertyName]: {
        title: [{ text: { content: link.name } }],
      },
      Description: {
        rich_text: [{ text: { content: link.description || '' } }],
      },
    };

    // URL 属性（只有非空时才设置）
    if (link.url) {
      properties['URL'] = { url: link.url };
    }

    // Image 属性（使用 files 类型，只有非空时才设置）
    if (link.image) {
      properties['Image'] = {
        files: [
          {
            type: 'external',
            name: link.name || 'logo',
            external: { url: link.image },
          },
        ],
      } as any;
    }

    // Sort 属性（只有非空时才设置）
    if (link.sort) {
      properties['Sort'] = { select: { name: link.sort } };
    }

    return properties;
  }
}
