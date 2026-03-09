import path from 'node:path';
import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';

interface WechatCredentials {
  appid: string;
  appsecret: string;
}

interface TokenCache {
  access_token: string;
  expires_at: number;
}

function guessContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function extFromContentType(contentType: string): string {
  const ct = contentType.split(';')[0].trim().toLowerCase();
  if (ct === 'image/png') return '.png';
  if (ct === 'image/gif') return '.gif';
  if (ct === 'image/webp') return '.webp';
  if (ct === 'image/svg+xml') return '.svg';
  return '.jpg';
}

function ensureImageExtension(fileName: string, contentType?: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return fileName;
  // No valid image extension — derive from content-type
  const derivedExt = contentType ? extFromContentType(contentType) : '.jpg';
  return fileName + derivedExt;
}

function assertWechatResponse(data: Record<string, unknown>, fallbackMessage: string): void {
  if (typeof data.errcode === 'number' && data.errcode !== 0) {
    throw new Error(`微信接口调用失败: ${data.errmsg ?? fallbackMessage} (${data.errcode})`);
  }
}

export class WechatClient {
  private credentials: WechatCredentials;
  private http: AxiosInstance;
  private tokenCache: TokenCache | null = null;

  constructor(credentials: WechatCredentials) {
    this.credentials = credentials;
    this.http = axios.create({ timeout: 30_000 });
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.tokenCache && this.tokenCache.expires_at > Date.now() + 60_000) {
      return this.tokenCache.access_token;
    }

    const response = await this.http.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: this.credentials.appid,
        secret: this.credentials.appsecret,
      },
    });

    const data = response.data;
    assertWechatResponse(data, '获取 access_token 失败');

    const accessToken = String(data.access_token);
    const expiresIn = Number(data.expires_in ?? 7200);

    this.tokenCache = {
      access_token: accessToken,
      expires_at: Date.now() + Math.max(expiresIn - 300, 60) * 1000,
    };

    return accessToken;
  }

  isTokenCached(): boolean {
    return this.tokenCache !== null && this.tokenCache.expires_at > Date.now() + 60_000;
  }

  private buildImageForm(source: Buffer, filename: string): FormData {
    const form = new FormData();
    form.append('media', source, {
      filename,
      contentType: guessContentType(filename),
    });
    return form;
  }

  async uploadArticleImage(source: Buffer, filename: string): Promise<string> {
    const accessToken = await this.getAccessToken();
    const form = this.buildImageForm(source, filename);

    const response = await this.http.post(
      'https://api.weixin.qq.com/cgi-bin/media/uploadimg',
      form,
      {
        params: { access_token: accessToken },
        headers: form.getHeaders(),
      }
    );

    const data = response.data;
    assertWechatResponse(data, '上传正文图片失败');

    if (!data.url) {
      throw new Error('微信未返回正文图片地址');
    }

    return String(data.url).split('?')[0] ?? String(data.url);
  }

  async uploadArticleImageFromUrl(url: string): Promise<string> {
    const accessToken = await this.getAccessToken();

    const imageResponse = await this.http.get(url, { responseType: 'arraybuffer', maxRedirects: 5 });
    const rawFileName = path.basename(new URL(url).pathname || 'image.jpg') || 'image.jpg';
    const responseContentType = imageResponse.headers['content-type'] as string | undefined;
    const fileName = ensureImageExtension(rawFileName, responseContentType);
    const buffer = Buffer.from(imageResponse.data);

    const form = new FormData();
    form.append('media', buffer, {
      filename: fileName,
      contentType: responseContentType ?? guessContentType(fileName),
    });

    const response = await this.http.post(
      'https://api.weixin.qq.com/cgi-bin/media/uploadimg',
      form,
      {
        params: { access_token: accessToken },
        headers: form.getHeaders(),
      }
    );

    const data = response.data;
    assertWechatResponse(data, '上传正文图片失败');

    if (!data.url) {
      throw new Error('微信未返回正文图片地址');
    }

    return String(data.url).split('?')[0] ?? String(data.url);
  }

  async uploadCoverImage(source: Buffer, filename: string): Promise<{ mediaId: string; url?: string }> {
    const accessToken = await this.getAccessToken();
    const form = this.buildImageForm(source, filename);

    const response = await this.http.post(
      'https://api.weixin.qq.com/cgi-bin/material/add_material',
      form,
      {
        params: { access_token: accessToken, type: 'thumb' },
        headers: form.getHeaders(),
      }
    );

    const data = response.data;
    assertWechatResponse(data, '上传封面失败');

    if (!data.media_id) {
      throw new Error('微信未返回封面 media_id');
    }

    return {
      mediaId: String(data.media_id),
      url: typeof data.url === 'string' ? String(data.url).split('?')[0] : undefined,
    };
  }

  async createDraft(payload: {
    title: string;
    author: string;
    digest: string;
    content: string;
    thumbMediaId: string;
    enableComment?: boolean;
  }): Promise<{ media_id: string }> {
    const accessToken = await this.getAccessToken();

    const response = await this.http.post(
      'https://api.weixin.qq.com/cgi-bin/draft/add',
      {
        articles: [
          {
            title: payload.title,
            author: payload.author,
            digest: payload.digest,
            content: payload.content,
            thumb_media_id: payload.thumbMediaId,
            need_open_comment: payload.enableComment ? 1 : 0,
            only_fans_can_comment: 0,
          },
        ],
      },
      {
        params: { access_token: accessToken },
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );

    const data = response.data;
    assertWechatResponse(data, '创建草稿失败');

    return data as { media_id: string };
  }
}
