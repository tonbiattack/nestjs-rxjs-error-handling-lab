# デバッグ記録

## 事象

外部APIスタブはHTTP 500と `{"code":"EXTERNAL_API_DOWN"}` を返した。BFFの `GET /items` はHTTP 200と `[]` を返し、外部API障害と正常な0件を区別できなかった。

## 再現

バグコミット `f46eab9` で次を実行した。

```bash
npm test -- --runInBand
```

E2Eテストの観測結果は次の通りだった。

```text
Expected: 502
Received: 200
```

RxJSの意味論テストは、`throwError()` に `catchError(() => of([]))` を適用すると `firstValueFrom()` が `[]` をresolveすることを確認した。

## 仮説と確認

| 仮説 | 確認 | 判定 |
| --- | --- | --- |
| 外部APIスタブが500を返していない | スタブの `statusCode` と本文を確認 | 却下。500と障害コードを返していた |
| AxiosまたはHttpServiceが500を200へ変換している | `catchError` の入力を観測 | 却下。エラー通知はcatchErrorまで到達していた |
| `catchError` のフォールバックが値へ置換している | 戻り値が `of([])` であることを確認 | 採用 |
| ExceptionFilterが200を返している | 修正版で `BadGatewayException` を伝播させて確認 | 却下。フィルターは502を出力できた |

## Observableの流れ

バグ状態は次の流れだった。

```text
HttpService.get()
  └─ error: AxiosError(response.status=500)
       └─ catchError(() => of([]))
            ├─ next: []
            └─ complete
                 └─ firstValueFrom() resolves []
                      └─ Controller returns []
                           └─ NestJS default status 200
```

修正版は次の流れになる。

```text
HttpService.get()
  └─ error: AxiosError(response.status=500)
       └─ catchError(...)
            └─ throwError(() => BadGatewayException)
                 └─ firstValueFrom() rejects
                      └─ NestJS exception layer / HttpErrorFilter
                           └─ HTTP 502 + EXTERNAL_API_UNAVAILABLE
```

## 最小修正

`of([])` を削除するだけではなく、下流障害をBFFの契約へ変換する処理を明示した。

```ts
catchError((error: AxiosError) => {
  this.logger.error('外部APIの障害をBFFの例外へ変換', {
    downstreamStatus: error.response?.status,
  });
  return throwError(() => new BadGatewayException('外部APIからデータを取得できませんでした'));
})
```

## 回帰確認

修正コミット `909166a` で `npm test -- --runInBand` を実行し、3テストが成功した。

```text
Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
```

正常な0件は200と空配列を維持し、外部APIの500は502とエラーJSONへ変換される。両者の契約を同じE2Eスイートで確認しているため、単に例外が発生したことだけではなく、BFFの最終HTTP応答を回帰対象にしている。
