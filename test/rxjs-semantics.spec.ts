import { firstValueFrom, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

describe('RxJSのエラー通知とcatchError', () => {
  it('catchErrorでof([])を返すと、firstValueFromは空配列をresolveする', async () => {
    const result = await firstValueFrom(
      throwError(() => new Error('外部API 500')).pipe(catchError(() => of([]))),
    );

    expect(result).toEqual([]);
  });

  it('エラー通知を再送出すると、firstValueFromはrejectする', async () => {
    const promise = firstValueFrom(
      throwError(() => new Error('外部API 500')).pipe(
        catchError((error) => throwError(() => error)),
      ),
    );

    await expect(promise).rejects.toThrow('外部API 500');
  });
});
