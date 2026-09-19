# 08. API & Data Contract

## 문서 상태

이 문서는 REST·실시간·오류·권한 계약의 정본 초안이다. 최종 OpenAPI와 이벤트 JSON Schema를 생성하면 예시와 schema를 같은 변경에서 갱신한다. 기존 `docs/stock-platform-api-contract.md`의 경로와 충돌할 경우 이 문서가 우선한다.

### 리디자인 영향

이번 제안은 API shape를 변경하지 않는다. 시장 테이프·movers·quote strip은 기존 market/stock 응답을 조합하고, freshness/source/asOf 및 권한 오류를 숨기거나 새 의미로 변환하지 않는다. 컴포넌트용 view model은 클라이언트 경계에서만 만든다.

## 1. 공통 규칙

- Base path: `/api/v1`
- 시간: ISO 8601 UTC; `asOf`, `receivedAt`, `occurredAt`, `publishedAt`를 혼동하지 않는다.
- 가격/금액/수량 단위와 정밀도를 응답 schema에 명시한다.
- 모든 응답에 `requestId` 또는 `traceId`를 제공한다.
- 목록 응답은 `items`, `nextCursor`, `asOf`, `dataStatus`를 사용한다.
- 인증 사용자 식별자는 요청 body/path로 받지 않고 세션에서 유도한다.
- 오류는 안정적인 `code`, 사용자용 `message`, `requestId`, 선택적 비민감 `details`를 포함한다.

```json
{
  "error": {
    "code": "ENTITLEMENT_REQUIRED",
    "message": "이 기능은 활성 구독이 필요합니다.",
    "requestId": "req_123",
    "details": { "requiredEntitlement": "REALTIME_SIGNAL" }
  }
}
```

## 2. 정본 REST 계약

| Method | Path | 권한 | 목적 |
|---|---|---|---|
| POST | `/auth/demo/session` | sandbox | provider adapter 전 검증용 서버 세션 발급 |
| GET | `/auth/me` | 공개/세션 | 현재 서버 세션 상태 |
| POST | `/auth/logout` | 세션 + CSRF | 현재 세션 폐기 |
| GET | `/market/overview` | 공개/회원 | 시장 상태·요약 |
| GET | `/stocks/search?q=` | 공개/회원 | 종목 검색 |
| GET | `/stocks/{ticker}` | 공개/회원 | 종목 식별·기본 정보 |
| GET | `/stocks/{ticker}/quote` | 공개/회원 | 최신 시세 |
| GET | `/stocks/{ticker}/chart` | 공개/회원 | 차트 시계열 |
| GET | `/stocks/{ticker}/flows` | 회원 | 수급 |
| GET | `/stocks/{ticker}/news` | 공개/회원 | 뉴스 |
| GET | `/stocks/{ticker}/financials` | 회원 | 재무 |
| GET | `/stocks/{ticker}/signals` | `REALTIME_SIGNAL` | 종목 신호 현재값·이력 |
| GET | `/signals` | 공개/회원/구독 | 잠금 미리보기 또는 권한별 신호 목록 |
| GET | `/screener/conditions` | 회원 | 승인된 구조화 조건 메타데이터 |
| POST | `/screener/query` | 회원 | 구조화 조건 실행 |
| GET | `/watchlists` | 회원 | 본인 관심목록 |
| POST | `/watchlists` | 회원 | 본인 관심목록 항목 추가 |
| DELETE | `/watchlists/{watchlistId}/items/{ticker}` | 회원 | 본인 항목 삭제 |
| GET | `/entitlements/me` | 로그인 | 본인 권한 상태 |
| GET | `/subscriptions/me` | 로그인 | 본인 구독 상태 |
| POST | `/subscriptions/checkout` | 로그인 | 결제 세션 생성 |
| POST | `/subscriptions/cancel` | 로그인 | 본인 구독 해지 요청 |
| POST | `/webhooks/payment` | 공급자 서명 | 결제 이벤트 수신 |

`/billing/*`, `/me/*`, `/watchlist` 단수, `/signals/{symbol}/history`, `/supply-demand`는 정본 경로가 아니다. 호환이 필요하면 별도 deprecation 문서·동일 권한·동일 오류 계약을 승인한다.

`/auth/demo/session`은 실제 간편로그인 provider를 대체하지 않는 개발용 경로다. 운영에서는 승인된 provider의 state/nonce 검증과 세션 회전 결과를 같은 서버 세션 계약으로 연결하며, 세션 기반 mutation은 `x-csrf-token`을 요구한다.

## 3. 요청 멱등성·페이지네이션

- checkout·cancel·watchlist mutation은 `Idempotency-Key`를 요구한다.
- 웹훅은 `provider`, `providerEventId`와 검증된 signature를 저장하고 중복 요청에 같은 처리 결과를 반환한다.
- 목록 cursor는 서버 opaque token이다. ticker·조건·권한·정렬 기준과 묶어 검증하고 임의 조작을 거부한다.
- 응답의 `asOf`는 결과 전체 기준 시각이며 각 아이템에 별도 `receivedAt`/`dataStatus`가 필요하면 함께 반환한다.

## 4. 권한 계약

| 리소스/동작 | 공개 | 회원 | 활성 구독 |
|---|---:|---:|---:|
| 기본 시장·종목 정보 | 제한 | O | O |
| 본인 관심목록 | X | O | O |
| 구조화 스크리너 | 제한 | O | O |
| 잠금 미리보기 | 승인된 무방향 데이터만 | O | O |
| 신호 방향·강도·근거·버전 | X | X | O |
| 신호 이력·실시간 토픽 | X | X | O |
| 구독·결제 객체 | X | 본인만 | 본인만 |

비구독 응답에서는 실제 방향을 삭제하는 것만으로 충분하지 않다. 방향 기반 필터, 정렬, 집계, 정확한 signal time, 차트 marker, 캐시 키를 권한별로 분리한다.

## 5. 시세 응답

```json
{
  "ticker": "005930",
  "name": "예시종목",
  "price": 70000,
  "change": 1200,
  "changeRate": 1.74,
  "volume": 1234567,
  "asOf": "2026-01-01T01:00:00Z",
  "receivedAt": "2026-01-01T01:00:00.300Z",
  "dataStatus": "REALTIME",
  "staleAfter": "2026-01-01T01:00:10Z",
  "source": "provider-id"
}
```

`dataStatus`는 `REALTIME`, `DELAYED`, `STALE`, `UNAVAILABLE` 중 하나다. source 공개 범위는 공급자 계약에 따른다.

## 6. 신호 계약

```json
{
  "eventId": "sig_evt_123",
  "streamKey": "signal:005930:default",
  "epoch": 7,
  "sequence": 1042,
  "ticker": "005930",
  "strategyKey": "default",
  "direction": "BUY",
  "status": "ACTIVE",
  "dataStatus": "REALTIME",
  "strength": "MEDIUM",
  "occurredAt": "2026-01-01T01:00:01Z",
  "publishedAt": "2026-01-01T01:00:02Z",
  "asOf": "2026-01-01T01:00:01Z",
  "validUntil": "2026-01-01T02:00:00Z",
  "algorithmVersion": "alpha-2026.01",
  "evidence": [
    { "type": "VOLUME_SURGE", "label": "거래량 증가", "value": 2.1 }
  ],
  "riskDisclosureId": "signal-disclosure-v1"
}
```

실제 방향·근거·버전은 `REALTIME_SIGNAL` entitlement에서만 반환한다. `BUY`/`SELL` 표현은 법무 승인 전 내부 enum이다. 근거는 이벤트 시점 snapshot이며 이후 현재값 변경으로 소급 변경하지 않는다.

구독 권한이 있는 `/stocks/{ticker}/signals` 응답은 `history.events`(외부 발행 이벤트)와 `history.revisions`(내부 평가 revision)를 분리해 반환한다. 잠금 미리보기 응답에는 `history`를 포함하지 않는다.

## 7. 실시간 스트림

- 연결: `/api/v1/stream` (WebSocket 또는 SSE 결정 전 공통 계약)
- SSE 구현에서는 재연결 시 `streamKey`, `epoch`, `afterSequence`를 함께 전달해 마지막 정상 수신 cursor 이후의 연속 이벤트를 먼저 replay한다. 세 값이 일부만 오거나 범위를 벗어나면 `INVALID_CURSOR`로 거부한다. `epoch`와 `sequence`는 1 이상/0 이상인 JavaScript 안전 정수(`<= 9,007,199,254,740,991`)여야 한다.
- replay helper: `GET /api/v1/stream/replay?streamKey=&epoch=&afterSequence=` (구독 권한 필요; 최종 OpenAPI 승인 전 sandbox 검증 경로)
- subscribe 요청에는 topic과 권한 검증된 cursor를 포함한다.
- 초기 snapshot에는 `snapshotCursor: {streamKey, epoch, sequence}`가 포함된다.
- 이벤트 envelope는 `eventId`, `streamKey`, `epoch`, `sequence`, `occurredAt`, `publishedAt`, `type`, `payload`를 포함한다.
- 클라이언트는 동일 streamKey·epoch에서만 sequence를 비교한다.
- `sequence <= lastSequence`는 무시하고, gap은 `RESYNC_REQUIRED`로 처리한다.
- replay 불가 cursor·epoch mismatch는 전체 snapshot과 `resyncReason`으로 복구한다.
- replay 응답은 `replayable`, 연속된 `events`, `resyncReason`을 반환하며, 보존 범위를 벗어나거나 중간 sequence가 없으면 `replayable=false`로 전체 snapshot fallback을 사용한다.
- entitlement revoke 시 `entitlement.revoked` 후 프리미엄 이벤트 전송을 중단하고 연결을 종료한다.
- 매 연결·재연결·topic 추가마다 entitlement와 Origin을 재검증한다.

## 8. 구독·결제 응답 상태

구독 상태는 `PENDING`, `ACTIVE`, `CANCELLATION_SCHEDULED`, `REFUND_PENDING`, `REFUNDED`, `PAYMENT_FAILED`, `EXPIRED`, `SUSPENDED`를 사용한다. UI 표시 상태와 entitlement 권한은 별도 필드로 반환하며, 결제 provider 성공 화면은 `ACTIVE`를 의미하지 않는다.

## 9. 오류 코드

`AUTH_REQUIRED`, `FORBIDDEN`, `ENTITLEMENT_REQUIRED`, `ENTITLEMENT_REVOKED`, `NOT_FOUND`, `STALE_DATA`, `UPSTREAM_UNAVAILABLE`, `RESYNC_REQUIRED`, `INVALID_CURSOR`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `VALIDATION_ERROR`, `IDEMPOTENCY_CONFLICT`, `PAYMENT_PENDING`, `PAYMENT_FAILED`, `WEBHOOK_REJECTED`, `INTERNAL_ERROR`.

## 10. 계약 검증

- OpenAPI lint·contract test
- REST/이벤트 JSON Schema validation
- role × field × filter × sort × aggregation 권한 테스트
- 타인 watchlist/subscription 접근 거부 테스트
- snapshot cursor·gap·replay 만료·epoch 변경 테스트
- 중복·역순 이벤트와 outbox 재시도 테스트
- 웹훅 timestamp-bound 서명·허용 오차·중복·역순·권위 재조회 테스트
- revoke 직후 열린 연결·재연결·버퍼 폐기 테스트
