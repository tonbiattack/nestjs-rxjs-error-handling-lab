import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { catchError, map, Observable, of } from 'rxjs';

export type Item = { id: number; name: string };

@Injectable()
export class ItemsService {
  constructor(private readonly httpService: HttpService) {}

  getItems(): Observable<Item[]> {
    return this.httpService.get<{ items: Item[] }>(this.externalApiUrl()).pipe(
      map((response) => response.data.items),
      // バグ: 下流障害を「正常な0件」に変換してしまう。
      catchError(() => of([])),
    );
  }

  private externalApiUrl(): string {
    return process.env.EXTERNAL_API_URL ?? 'http://127.0.0.1:43100/items';
  }
}
