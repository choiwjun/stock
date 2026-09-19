# 주식 플랫폼 API·실시간 신호 계약 초안 v0.1

> **정본 안내:** 이 문서는 상세 참고자료이며 구현 계약의 정본이 아니다. 정본은 [`docs/planning/08-api-data-contract.md`](planning/08-api-data-contract.md)와 [`docs/planning/README.md`](planning/README.md)다. 경로·DTO·상태·오류·권한이 다르면 planning 문서를 우선한다. 특히 `/billing/*`, `/me/*`, `/supply-demand`, 단일 sequence 비교는 레거시 초안으로 취급하며 별도 승인 없이 구현하지 않는다.

## 1. 적용 범위

- 국내 개별 주식
- 실시간 시세·차트·수급
- AI 점수·매수/매도 알고리즘 신호
- 관심종목
- 월 구독 권한
- 뉴스·공시·기본 재무

ETF·ETN·펀드·주문·계좌·웹 알림·종목 비교는 이 계약 범위에서 제외한다.

## 2. 공통 응답 규칙

모든 시세·시장·분석 응답은 다음 메타데이터를 포함한다.

```json
{
  "data": {},
  "asOf": "2025-03-08T10:32:14.120Z",
  "receivedAt": "2025-03-08T10:32:14.210Z",
  "source": "market-data-provider",
  "marketStatus": "OPEN",
  "isDelayed": false,
  "isStale": false,
  "requestId": "req_..."
}
```

- `asOf`: 원천 데이터 기준 시각
- `receivedAt`: 플랫폼 수신 시각
- `isStale`: 허용 신선도 기준 초과 여부
- 모든 시간은 UTC 저장, 화면은 사용자 시간대로 변환한다.

## 3. 도메인 모델

### Stock

```json
{
  "symbol": "005930",
  "name": "삼성전자",
  "market": "KOSPI",
  "sector": "반도체",
  "assetType": "COMMON_STOCK",
  "isTradable": true
}
```

### Quote

```json
{
  "symbol": "005930",
  "price": 260500,
  "change": 8000,
  "changeRate": 3.17,
  "volume": 1234567,
  "quoteAt": "2025-03-08T10:32:14.120Z",
  "session": "REGULAR",
  "sequence": 1048291
}
```

### AI Score

```json
{
  "symbol": "005930",
  "score": 82,
  "scoreChange": 4,
  "positiveFactors": ["외국인 수급 개선"],
  "riskFactors": ["단기 변동성 증가"],
  "analysisAt": "2025-03-08T10:32:00Z",
  "modelVersion": "score-v2.4"
}
```

### Signal

```json
{
  "symbol": "005930",
  "signalType": "BUY",
  "status": "ACTIVE",
  "strength": "HIGH",
  "signalAt": "2025-03-08T10:32:10Z",
  "quoteAt": "2025-03-08T10:32:09Z",
  "algorithmVersion": "signal-v2.4",
  "positiveFactors": ["외국인 순매수 증가"],
  "riskFactors": ["단기 변동성 증가"],
  "validUntil": null
}
```

## 4. REST API

### 시장

```text
GET /api/v1/market/overview
GET /api/v1/market/indices
GET /api/v1/market/sectors
GET /api/v1/market/briefing
GET /api/v1/market/supply-demand
```

쿼리 예시:

```text
?market=KOSPI&date=2025-03-08
```

### 종목

```text
GET /api/v1/stocks/search?q=삼성
GET /api/v1/stocks/{symbol}
GET /api/v1/stocks/{symbol}/quote
GET /api/v1/stocks/{symbol}/chart?period=1M&interval=1D
GET /api/v1/stocks/{symbol}/financials
GET /api/v1/stocks/{symbol}/supply-demand?period=1M
GET /api/v1/stocks/{symbol}/news
GET /api/v1/stocks/{symbol}/analysis
```

### 시그널

```text
GET /api/v1/signals?type=BUY&market=KOSPI&cursor=...
GET /api/v1/signals/{symbol}
GET /api/v1/signals/{symbol}/history
GET /api/v1/signals/performance?period=1Y
```

- 프리미엄 권한이 없으면 실제 `signalType`과 근거를 반환하지 않는다.
- 목록에서는 잠금 상태와 종목 기본정보만 반환할 수 있다.
- `history`는 구독 권한을 서버에서 검증한다.

### 관심종목

```text
GET    /api/v1/me/watchlists
POST   /api/v1/me/watchlists/items
DELETE /api/v1/me/watchlists/items/{symbol}
POST   /api/v1/me/watchlists/groups
PATCH  /api/v1/me/watchlists/groups/{groupId}
DELETE /api/v1/me/watchlists/groups/{groupId}
```

### 인증·구독

```text
GET  /api/v1/me
GET  /api/v1/me/entitlements
POST /api/v1/auth/signup
POST /api/v1/auth/login
POST /api/v1/auth/social/{provider}
POST /api/v1/billing/checkout
GET  /api/v1/billing/subscription
POST /api/v1/billing/cancel
GET  /api/v1/billing/history
POST /api/v1/billing/webhook
```

## 5. 실시간 스트림 계약

### 연결

```text
WSS /api/v1/stream
```

- 인증 토큰은 URL 쿼리에 넣지 않는다.
- 프리미엄 신호 토픽은 연결 시 서버가 구독 권한을 확인한다.
- 연결 후 서버가 `connection.ready`를 보낸다.

### 클라이언트 구독 메시지

```json
{
  "type": "subscribe",
  "requestId": "sub_001",
  "topics": [
    "quote:005930",
    "signal:005930"
  ]
}
```

### 이벤트 공통 형식

```json
{
  "eventId": "evt_...",
  "eventType": "signal.changed",
  "symbol": "005930",
  "occurredAt": "2025-03-08T10:32:10Z",
  "sequence": 8842,
  "data": {}
}
```

### 이벤트 종류

```text
quote.updated
signal.changed
market.status_changed
subscription.changed
stream.heartbeat
stream.error
```

### 신호 변경 이벤트

```json
{
  "eventId": "evt_123",
  "eventType": "signal.changed",
  "symbol": "005930",
  "occurredAt": "2025-03-08T10:32:10Z",
  "sequence": 8842,
  "data": {
    "previousType": "NEUTRAL",
    "signalType": "BUY",
    "status": "ACTIVE",
    "signalAt": "2025-03-08T10:32:10Z",
    "algorithmVersion": "signal-v2.4"
  }
}
```

## 6. 신호 상태 모델

### 신호 타입

```text
NEUTRAL
BUY
SELL
```

### 신호 상태

```text
ACTIVE
SUSPENDED
EXPIRED
```

### 상태 전이

```text
NEUTRAL → BUY
NEUTRAL → SELL
BUY → SELL
BUY → NEUTRAL
SELL → BUY
SELL → NEUTRAL
ACTIVE → SUSPENDED  (시세·엔진 장애)
SUSPENDED → ACTIVE  (복구 후 최신 결과)
ACTIVE → EXPIRED    (유효기간 종료)
```

규칙:

- 같은 종목·같은 신호·같은 조건의 이벤트는 중복 발행하지 않는다.
- 종목별 `sequence`가 낮거나 같은 이벤트는 클라이언트가 무시한다.
- 재연결 후 클라이언트는 최신 REST 스냅샷을 먼저 받고 스트림을 재개한다.
- 신호 기준 시각과 현재가 기준 시각을 분리한다.
- 알고리즘 엔진이 중단되면 신호를 최신으로 가장하지 않고 `SUSPENDED`로 표시한다.

## 7. 권한 모델

### 무료 사용자

```json
{
  "canViewQuote": true,
  "canViewChart": true,
  "canViewScore": true,
  "canViewSignal": false,
  "canViewSignalHistory": false
}
```

### 월 구독 사용자

```json
{
  "canViewQuote": true,
  "canViewChart": true,
  "canViewScore": true,
  "canViewSignal": true,
  "canViewSignalHistory": true
}
```

권한은 화면이 아닌 API와 스트림 연결 단계에서 모두 검증한다.

## 8. 오류 형식

```json
{
  "error": {
    "code": "PREMIUM_REQUIRED",
    "message": "이 기능은 월 구독 사용자만 이용할 수 있습니다.",
    "retryable": false,
    "requestId": "req_..."
  }
}
```

주요 코드:

```text
AUTH_REQUIRED
PREMIUM_REQUIRED
STOCK_NOT_FOUND
MARKET_CLOSED
DATA_STALE
DATA_PROVIDER_UNAVAILABLE
SIGNAL_ENGINE_SUSPENDED
STREAM_RECONNECT_REQUIRED
PAYMENT_FAILED
SUBSCRIPTION_EXPIRED
RATE_LIMITED
```

## 9. 보안·운영 규칙

- 관심종목은 서버에서 사용자 소유권을 검증한다.
- 결제 웹훅은 서명 검증과 idempotency 처리를 적용한다.
- 신호 API 응답에 프리미엄 결과를 실수로 포함하지 않는다.
- 스트림 연결에도 구독 권한과 만료 시각을 확인한다.
- 로그에는 결제수단·인증토큰·불필요한 개인정보를 기록하지 않는다.
- 시세·신호·결제 이벤트에 `requestId`와 `eventId`를 남긴다.
- 외부 뉴스·공시 본문은 신뢰할 수 없는 입력으로 처리한다.

## 10. 미결정 데이터 계약

- 실시간 시세 공급자와 실제 필드명
- 호가·체결 포함 여부
- 신호 재계산 트리거와 최소 변화량
- 신호 유효기간
- AI 점수 공개 범위
- 차트 캔들 주기
- 구독 결제대행사와 웹훅 형식
- 신호 성과 산정 기준
