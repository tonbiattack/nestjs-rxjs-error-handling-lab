# nestjs-rxjs-error-handling-lab

NestJS の `HttpService` が返す Observable と RxJS の `catchError()`、`of()`、`firstValueFrom()` の組み合わせによって、外部APIのHTTP 500がBFFのHTTP 200と空配列へ変換される問題を、最小構成で再現・修正するデバッグ学習用リポジトリです。

## 問題の概要

本来の通信経路は次の通りです。

```text
UI → NestJS BFF → 外部API
                 └─ HTTP 500

期待: BFFが障害を表すHTTP 502を返す
実際: BFFがHTTP 200と[]を返し、UIは「正常な0件」と誤認する
```

バグ状態の `ItemsService` には次の処理があります。

```ts
catchError(() => of([]))
```

`catchError` はエラー通知を受け取ったあと、戻り値の Observable を後続へ接続します。ここで `of([])` を返すと、エラー通知は終了し、空配列の `next` 通知と `complete` 通知へ置き換わります。そのため、Controllerの `firstValueFrom()` はrejectせず、空配列をresolveします。

## 前提

Node.js 20以上とnpmが必要です。依存関係をインストールします。

```bash
npm install
```

## 再現方法

### 1. バグ状態を確認する

バグを含むコミットへ移動します。

```bash
git checkout f46eab9
npm test -- --runInBand
```

`test/items.e2e-spec.ts` は、ローカルの外部APIスタブを起動してHTTP 500を返させます。バグ状態では、次のようにテストが意図した差分で失敗します。

```text
Expected: 502
Received: 200
```

実際のHTTP本文は `[]` です。これはテスト設定やコンパイルの失敗ではなく、外部障害が正常系の空配列へ変換された結果です。

### 2. 修正版を確認する

```bash
git checkout main
npm test -- --runInBand
```

修正版では、正常な0件は `200 + []` のまま、外部APIの500は `502 + エラーJSON` になります。

| 外部API | BFF status | BFF body | UIでの意味 |
| --- | ---: | --- | --- |
| 200、0件 | 200 | `[]` | 正常な0件 |
| 500 | 502 | `EXTERNAL_API_UNAVAILABLE` | 外部API障害 |

## デバッグ手順

まず外部APIスタブのHTTPステータスと本文を確認し、次に `HttpService.get()` のObservable境界を確認します。`ItemsService.getItems()` の `catchError` にブレークポイントを置き、入力された例外の型、`error.response?.status`、コールバックの戻り値を観測します。

次にControllerの `firstValueFrom()` の直前と直後を確認します。バグ状態では `catchError` 後のObservableが `[]` をemitして完了するため、`firstValueFrom()` の結果は `[]` です。修正版では `throwError()` が `BadGatewayException` をerror通知として再送出するため、`firstValueFrom()` はrejectします。

```bash
npm test -- --runInBand
npm run build
```

修正版の実行ログには、下流ステータスを記録した次のログが出ます。

```text
外部APIの障害をBFFの例外へ変換
{ downstreamStatus: 500 }
```

## 原因

原因は、通信障害を業務上の正常な空集合と同じ値へ変換したことです。`catchError` は単なるログ出力ではなく、元のObservableを別のObservableへ置き換える演算子です。`of([])` は「空配列を1回通知して正常完了するObservable」を作るため、後続のPromise化処理から見ると通信障害は存在しません。

## 修正方法

修正版では、下流エラーをログへ記録し、`BadGatewayException` を `throwError()` でerror通知として返します。

```ts
catchError((error: AxiosError) => {
  this.logger.error('外部APIの障害をBFFの例外へ変換', {
    downstreamStatus: error.response?.status,
  });
  return throwError(() => new BadGatewayException('外部APIからデータを取得できませんでした'));
})
```

Serviceは下流の通信失敗をBFFのHTTP意味へ変換する責務を持ちます。`HttpException` はステータスを持つ例外として上位へ伝播し、`HttpErrorFilter` はその例外をUI向けのJSON形式へ整形する責務を持ちます。フィルターは失われたエラーを復元できないため、Serviceで `of([])` を返さないことが重要です。

## テスト方法

```bash
npm test -- --runInBand
npm run build
```

テストは次の3点を確認します。

| テスト | 確認内容 |
| --- | --- |
| RxJS semantics | `of([])` へ置換すると `firstValueFrom()` がresolveし、再送出するとrejectする |
| 正常な0件 | 外部APIの200と空配列がBFFの200と空配列として維持される |
| 外部障害 | 外部APIの500がBFFの502とエラーJSONへ変換される |

## 技術的な学び

NestJSの `HttpService` はAxiosのレスポンスをObservableとして公開します。`firstValueFrom()` は最初の値を受け取ればPromiseをresolveし、Observableがerror通知を出せばrejectします。したがって、Promise化した時点で障害を握り潰すのではなく、Observableのerror channelを維持する必要があります。

`catchError` には、リトライ、代替データ、ドメイン例外への変換など複数の用途があります。代替データを選ぶ場合は、それが本当に「障害時も正常な意味を持つ値」なのかを明示してください。通信障害と正常な0件を区別すべきBFFでは、`of([])` は適切なフォールバックではありません。

NestJSのExceptionFilterは、例外をHTTPレスポンスへ変換する境界です。Observableのエラー通知を値へ変換するRxJSの責務と、`HttpException` のステータス・JSONをHTTPへ出力するNestJSの責務を混同しないことが、この問題の再発防止につながります。

## Git履歴

```text
f46eab9 バグを含むNestJS RxJS再現ラボを追加
909166a 外部API障害をRxJSで握り潰さず502へ伝播
```

バグコミットでは再現テストが `Expected: 502 / Received: 200` で失敗し、修正コミットで同じテストが通ります。記事化するときは、バグコミットを起点に観測を追い、修正コミットを答え合わせとして参照してください。

## 参考資料

- [NestJS HTTP module](https://docs.nestjs.com/techniques/http-module)
- [NestJS Exception filters](https://docs.nestjs.com/exception-filters)
- [RxJS catchError](https://rxjs.dev/api/operators/catchError)
- [RxJS firstValueFrom](https://rxjs.dev/api/index/function/firstValueFrom)
