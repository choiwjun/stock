# 주식 플랫폼 시스템 아키텍처 초안 v0.1

> **정본 안내:** 이 문서는 상세 참고자료이며 아키텍처·장애·권한 계약의 정본이 아니다. 정본은 [`docs/planning/07-trd.md`](planning/07-trd.md), [`docs/planning/08-api-data-contract.md`](planning/08-api-data-contract.md), [`docs/planning/10-security-privacy-compliance.md`](planning/10-security-privacy-compliance.md)다. snapshot cursor/replay, outbox 원자성, watchdog 기반 effective status, 열린 연결 권한 회수 규칙은 planning 문서를 우선한다.

## 1. 설계 목표

- 국내 개별 주식의 실시간 시세를 안정적으로 전달한다.
- 실시간 시세를 바탕으로 매수·매도 알고리즘 신호를 산출한다.
- 월 구독 권한을 가진 사용자에게만 신호를 노출한다.
- 시세·신호·결제·관심종목의 책임 경계를 분리한다.
- 초기에는 과도한 마이크로서비스보다 운영 가능한 모듈형 구조를 우선한다.

## 2. 권장 논리 구조

```text
[Web Client]
     │ HTTPS / WebSocket
     ▼
[API Gateway / BFF] ───────────── [Auth & Entitlement]
     │                                  │
     ├─ Market Read API                ├─ User
     ├─ Stock Research API              ├─ Subscription
     ├─ Screener API                    └─ Billing
     ├─ Watchlist API
     └─ Signal API / Stream Gateway

[Market Data Provider]
     │
     ▼
[Market Ingestor]
     │ validate / normalize / sequence
     ├──────────────► [Quote Cache / Time-series Store]
     ├──────────────► [Event Bus]
     │                      │
     │                      ├─► [Signal Engine]
     │                      │       ├─► [Signal Store]
     │                      │       └─► [Signal Event Stream]
     │                      └─► [Read Model Updater]
     │
[News / Financial Provider] ─► [Content Ingestor] ─► [Content Store]

[Relational Store]
 users / subscriptions / payments / watchlists / signal metadata
```

## 3. 컴포넌트 책임

### Web Client

- 시장·종목·스크리너·시그널 화면을 제공한다.
- 현재가와 신호 이벤트를 화면에 반영한다.
- 프리미엄 권한을 자체 판단하지 않고 서버 결과를 따른다.
- 스트림이 끊기면 최신 REST 스냅샷을 요청한다.

### API Gateway / BFF

- 인증·권한 확인
- 화면별 응답 조합
- 요청 제한과 공통 오류 형식
- 프리미엄 데이터의 외부 노출 차단

### Market Ingestor

- 외부 시세 연결 유지
- 원천 필드 정규화
- 종목 코드 검증
- 수신 순서와 중복 확인
- 데이터 신선도 판정
- 공급자 장애 감지

### Event Bus

- 시세 업데이트와 신호 변경을 비동기 전달한다.
- 종목 또는 시장 단위 순서를 보존한다.
- 재처리 가능한 이벤트 ID와 시퀀스를 유지한다.

### Signal Engine

- 시세·수급·필요 데이터로 매수/매도 알고리즘을 실행한다.
- 알고리즘 버전을 함께 기록한다.
- 상태가 바뀔 때만 신호 이벤트를 만든다.
- 데이터가 오래되면 신호를 `SUSPENDED`로 전환한다.

### Stream Gateway

- 사용자별 토픽 구독을 관리한다.
- 무료 사용자에게 프리미엄 신호 payload를 보내지 않는다.
- 연결·재연결·heartbeat를 관리한다.
- 구독 만료 시 신호 토픽을 즉시 해제한다.

### Billing / Entitlement

- 월 구독 결제 상태를 관리한다.
- 결제 공급자 웹훅을 검증한다.
- 결제 상태를 프리미엄 권한으로 변환한다.
- API와 스트림 모두에 권한 결과를 제공한다.

## 4. 데이터 저장소 경계

### 관계형 트랜잭션 저장소

권장 후보: PostgreSQL 또는 동등한 관계형 DB.

```text
users
auth_identities
subscriptions
payments
stocks
watchlists
watchlist_items
signal_metadata
signal_events_metadata
```

특성:

- 사용자·구독·결제·관심종목은 강한 일관성이 필요하다.
- 결제와 권한 변경은 트랜잭션으로 처리한다.
- 관심종목은 `(user_id, symbol)` 중복을 막는다.

### 시계열 저장소

후보: 시계열 확장 관계형 DB 또는 별도 시계열 저장소.

```text
quotes
candles
supply_demand_snapshots
market_snapshots
```

특성:

- 고빈도 시세와 차트 조회를 분리한다.
- 원천 시세와 화면용 집계 캔들을 구분한다.
- 보존 기간과 집계 정책을 별도로 둔다.

### 캐시

```text
latest_quote:{symbol}
latest_signal:{symbol}
market_overview:{market}
entitlement:{userId}
```

- 현재가·현재 신호·시장 요약의 빠른 조회에 사용한다.
- 캐시를 최종 데이터 저장소로 사용하지 않는다.
- 캐시 만료 시 신선도 상태를 함께 판단한다.

### 콘텐츠 저장소

```text
news_items
filings
financial_snapshots
ai_summaries
```

뉴스 원문과 AI 요약을 분리한다. 원문 출처와 생성 시각을 보존한다.

## 5. 핵심 엔티티 관계

```text
User 1 ── N AuthIdentity
User 1 ── N Subscription
Subscription 1 ── N Payment
User 1 ── N WatchlistItem
Stock 1 ── N Quote
Stock 1 ── N AIScore
Stock 1 ── N Signal
Signal 1 ── N SignalEvent
Stock 1 ── N SupplyDemandSnapshot
Stock 1 ── N NewsItem
```

### 중요 경계

- `AIScore`는 분석·정렬 데이터다.
- `Signal`은 현재 알고리즘 상태다.
- `SignalEvent`는 변경 이력이며 가능한 한 append-only로 보존한다.
- `Subscription`은 결제 기록과 별개의 권한 원천이다.
- `WatchlistItem`은 자산 보유가 아니라 사용자의 저장 목록이다.

## 6. 실시간 데이터 흐름

```text
1. 공급자에서 quote 수신
2. 종목·시간·순서·가격 검증
3. 최신 quote 캐시 갱신
4. quote.updated 이벤트 발행
5. Signal Engine 계산
6. 이전 상태와 비교
7. 상태 변경 시 signal.changed 저장·발행
8. Stream Gateway가 권한 사용자에게 전달
9. Web Client가 sequence 검증 후 화면 갱신
```

신호가 바뀌지 않았으면 실시간 시세는 갱신하되 `signal.changed`는 발행하지 않는다.

## 7. 일관성·중복 처리

- 시세 이벤트는 종목별 `sequence`를 사용한다.
- 낮거나 같은 sequence의 이벤트는 무시한다.
- 신호 이벤트는 `eventId`를 idempotency key로 사용한다.
- 알고리즘 재시작 후 최신 스냅샷과 마지막 저장 상태를 비교한다.
- 결제 웹훅은 공급자 이벤트 ID로 중복 처리한다.
- 스트림 재연결 시 REST 최신 스냅샷을 먼저 적용한 뒤 새 이벤트를 받는다.

## 8. 장애 처리

### 시세 공급자 장애

- 새 quote 수신 중단
- `isStale=true` 전환
- 마지막 정상 시각 표시
- 알고리즘 신호 `SUSPENDED`
- 공급자 복구 후 최신 스냅샷으로 재동기화

### 알고리즘 엔진 장애

- 기존 신호를 최신 신호처럼 갱신하지 않는다.
- 신호 상태를 `SUSPENDED`로 표시한다.
- 엔진 복구 후 재계산 결과와 버전을 저장한다.

### WebSocket 장애

- 클라이언트 자동 재연결
- 연결 전 REST 스냅샷 조회
- 재연결 후 누락 이벤트 복구
- 복구되지 않으면 수동 재시도 제공

### 결제 웹훅 지연

- 결제 완료 화면과 권한 활성화를 분리한다.
- 서버 승인 전에는 프리미엄 권한을 부여하지 않는다.
- 승인 지연 상태를 사용자에게 안내한다.

## 9. 보안 경계

- 외부 시세 공급자 자격증명은 서버에만 보관한다.
- 프리미엄 신호는 API 응답과 스트림 모두에서 권한을 검증한다.
- 관심종목 변경은 사용자 소유권을 검증한다.
- 결제 웹훅 서명과 이벤트 중복을 검증한다.
- 신호 엔진과 결제 모듈은 웹 클라이언트가 직접 호출하지 않는다.
- 사용자·결제·인증 로그의 민감정보를 마스킹한다.

## 10. 관측성

필수 지표:

```text
quote_ingest_latency
quote_staleness_seconds
signal_compute_latency
signal_publish_latency
stream_connected_users
stream_reconnect_count
subscription_entitlement_latency
payment_webhook_failures
api_5xx_rate
```

모든 시세·신호·결제 이벤트에는 다음을 연결한다.

```text
requestId
traceId
eventId
symbol
algorithmVersion
```

## 11. 초기 구현 전략

초기에는 다음 구조를 권장한다.

```text
모듈형 웹/API 애플리케이션
+ 별도 시세 수집 워커
+ 별도 알고리즘 워커
+ 실시간 스트림 게이트웨이
+ 관계형 저장소
+ 캐시/메시지 브로커
```

서비스를 처음부터 모두 마이크로서비스로 분리하지 않는다. 시세 수집·알고리즘·스트림·결제처럼 장애 격리가 필요한 영역만 별도 프로세스로 분리하고, 나머지는 모듈 경계를 먼저 확립한다.

## 12. 아키텍처 결정 전 미결정 사항

- 최종 시세·뉴스·재무 데이터 공급자
- 시계열 저장소와 메시지 브로커
- 실시간 스트림 방식(WebSocket 또는 SSE)
- 알고리즘 워커의 재계산 주기·처리량
- 월 구독 결제대행사
- 구독 권한 캐시 전략
- 신호·시세 보존 기간
- 배포 환경과 장애 복구 목표(RTO/RPO)
