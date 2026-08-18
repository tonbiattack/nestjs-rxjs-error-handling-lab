import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { catchError, map, Observable, throwError } from 'rxjs';
import { AxiosError } from 'axios';

export type Item = { id: number; name: string };

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(private readonly httpService: HttpService) {}

  getItems(): Observable<Item[]> {
    return this.httpService.get<{ items: Item[] }>(this.externalApiUrl()).pipe(
      map((response) => response.data.items),
      catchError((error: AxiosError) => {
        this.logger.error('外部APIの障害をBFFの例外へ変換', {
          downstreamStatus: error.response?.status,
        });
        return throwError(() => new BadGatewayException('外部APIからデータを取得できませんでした'));
      }),
    );
  }

  private externalApiUrl(): string {
    return process.env.EXTERNAL_API_URL ?? 'http://127.0.0.1:43100/items';
  }
}
