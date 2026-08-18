import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { HttpErrorFilter } from '../src/http-error.filter';

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

describe('NestJS BFF /items', () => {
  let app: INestApplication;
  let externalApi: Server;
  let externalApiUrl: string;

  beforeAll(async () => {
    externalApi = createServer((_request, response) => {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ code: 'EXTERNAL_API_DOWN' }));
    });
    await new Promise<void>((resolve) => externalApi.listen(0, resolve));
    externalApiUrl = `http://127.0.0.1:${(externalApi.address() as AddressInfo).port}/items`;
    process.env.EXTERNAL_API_URL = externalApiUrl;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => externalApi.close((error) => error ? reject(error) : resolve()));
  });

  it('外部APIの500をBFFの502として返す', async () => {
    const response = await fetch(`${await app.getUrl()}/items`);

    expect(response.status).toBe(502);
    expect(await readJson(response)).toEqual({
      code: 'EXTERNAL_API_UNAVAILABLE',
      message: '外部APIからデータを取得できませんでした',
    });
  });
});
