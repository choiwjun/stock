# 주식 플랫폼 데이터 모델·이벤트 시퀀스 초안 v0.1

> **정본 안내:** 이 문서는 상세 참고자료이며 구현 DB 계약의 정본이 아니다. 정본은 [`docs/planning/09-database-design.md`](planning/09-database-design.md)와 [`docs/planning/README.md`](planning/README.md)다. `signals_current`의 전략별 유일성, `(streamKey, epoch, sequence)`, signal evidence snapshot, outbox·소유권·보존 정책은 planning 문서를 우선한다.

## 1. 저장소 전략

| 영역 | 저장소 역할 | 일관성 요구 |
|---|---|---|
| 사용자·인증·구독·결제 | 관계형 트랜잭션 저장소 | 강한 일관성 |
| 관심종목 | 관계형 트랜잭션 저장소 | 강한 일관성 |
| 현재가·차트·수급 | 시계열 저장소 + 최신값 캐시 | 시각·순서 일관성 |
| 현재 알고리즘 상태 | 관계형 또는 빠른 읽기 저장소 | 종목별 최신 상태 |
| 신호 이력 | append-only 이벤트 저장소 | 순서·중복 방지 |
| 뉴스·재무·요약 | 콘텐츠 저장소 | 출처·기준일 보존 |

PostgreSQL을 관계형 저장소 후보로 사용한다. 고빈도 시세는 동일 DB에 무리하게 쌓기보다 시계열 확장 또는 별도 시계열 저장소를 검토한다.

## 2. 논리 테이블

### users

```text
id                  내부 BIGINT PK
public_id           외부 노출 UUID UNIQUE
email               정규화된 이메일 UNIQUE
status              ACTIVE / SUSPENDED / DELETED
created_at
updated_at
```

### auth_identities

```text
id                  PK
user_id             FK users.id
provider            EMAIL / GOOGLE / KAKAO / NAVER 등
provider_subject    제공자 사용자 식별자
created_at
last_login_at
```

Unique:

```text
(provider, provider_subject)
(user_id, provider)
```

비밀번호는 `users`가 아닌 별도 인증 시스템 또는 별도 보안 필드에서 관리한다. 평문·복호화 가능한 비밀번호는 저장하지 않는다.

### subscriptions

```text
id                  PK
public_id           외부 노출 UUID
user_id             FK users.id
product_code        ALGORITHM_SIGNAL_MONTHLY
status              ACTIVE / PAYMENT_PENDING / PAST_DUE / CANCELED / EXPIRED / REFUNDED
period_start_at
period_end_at
cancel_at_period_end BOOLEAN
provider_customer_id
provider_subscription_id
created_at
updated_at
```

규칙:

- 한 사용자의 현재 활성 구독은 정책상 하나로 제한한다.
- 해지와 즉시 만료를 구분한다.
- 권한은 `status`와 `period_end_at`을 함께 판정한다.

### payments

```text
id                  PK
public_id           외부 노출 UUID
subscription_id     FK subscriptions.id
user_id             FK users.id
provider_event_id   UNIQUE
provider_payment_id
amount_minor        정수 금액
currency            KRW
status              PENDING / PAID / FAILED / REFUNDED
paid_at
raw_payload         JSONB 또는 별도 제한 저장소
created_at
updated_at
```

카드번호·CVC 등 결제수단 민감정보는 저장하지 않는다.

### stocks

```text
id                  내부 PK
symbol              종목코드 UNIQUE
name
market              KOSPI / KOSDAQ
asset_type          COMMON_STOCK
sector
is_active
created_at
updated_at
```

ETF·ETN·펀드는 종목 마스터 단계에서 제외한다. 우선주·스팩·리츠는 별도 정책 확정 후 `asset_type` 범위를 변경한다.

### watchlist_groups

```text
id                  PK
user_id             FK users.id
name
sort_order
created_at
updated_at
```

### watchlist_items

```text
id                  PK
user_id             FK users.id
watchlist_group_id  FK watchlist_groups.id NULL
symbol              FK stocks.symbol
created_at
updated_at
```

Unique:

```text
(user_id, symbol)
```

관심종목은 자산 보유 정보가 아니다.

### quotes

```text
id                  PK 또는 시계열 식별자
symbol              FK stocks.symbol
quote_at            원천 체결 기준 시각
received_at         플랫폼 수신 시각
sequence            종목별 증가 순번
price
change
change_rate
volume
session             PRE / REGULAR / POST / CLOSED
source
created_at
```

- 고빈도 데이터는 시간 기준 파티셔닝을 검토한다.
- 종목별 `sequence`로 늦게 도착한 이벤트를 판별한다.
- 최신값은 `latest_quote:{symbol}` 캐시에 보관한다.

### candles

```text
id                  PK
symbol              FK stocks.symbol
interval            1m / 5m / 1d 등
open_at
open
high
low
close
volume
source
created_at
```

Unique:

```text
(symbol, interval, open_at)
```

### supply_demand_snapshots

```text
id                  PK
symbol              FK stocks.symbol
period              INTRADAY / 1D / 1W / 1M
as_of
foreign_net
institution_net
retail_net
volume
created_at
```

### ai_scores

```text
id                  PK
symbol              FK stocks.symbol
score               0~100
score_change
positive_factors   JSONB
risk_factors       JSONB
model_version
as_of
generated_at
created_at
```

AI 점수는 알고리즘 신호와 별도 기록이다.

### signals

현재 종목별 최신 알고리즘 상태를 저장한다.

```text
id                  PK
symbol              FK stocks.symbol UNIQUE
signal_type         NEUTRAL / BUY / SELL
status              ACTIVE / SUSPENDED / EXPIRED
strength            LOW / MEDIUM / HIGH
signal_at
quote_at
algorithm_version
positive_factors   JSONB
risk_factors       JSONB
valid_until
updated_at
```

### signal_events

신호 상태 변경을 append-only로 저장한다.

```text
event_id            UUID PK
symbol              FK stocks.symbol
sequence            종목별 증가 순번
previous_type       NEUTRAL / BUY / SELL NULL
next_type           NEUTRAL / BUY / SELL
status              ACTIVE / SUSPENDED / EXPIRED
signal_at
quote_at
algorithm_version
payload             JSONB
created_at
```

Unique:

```text
(symbol, sequence)
event_id
```

### news_items

```text
id                  PK
external_id         제공자 식별자 UNIQUE
source
url
title
published_at
content_hash
related_symbols     별도 연결 테이블 또는 배열
summary
summary_model_version
created_at
updated_at
```

### financial_snapshots

```text
id                  PK
symbol
period_type        QUARTER / YEAR
period_end
revenue
operating_profit
net_income
per
pbr
roe
source
as_of
created_at
```

## 3. 권장 인덱스

```text
users(email)
auth_identities(provider, provider_subject)
subscriptions(user_id, status, period_end_at)
payments(provider_event_id)
watchlist_items(user_id, created_at)
quotes(symbol, quote_at DESC)
candles(symbol, interval, open_at DESC)
supply_demand_snapshots(symbol, period, as_of DESC)
signals(signal_type, status, signal_at DESC)
signal_events(symbol, sequence DESC)
news_items(published_at DESC)
financial_snapshots(symbol, period_type, period_end DESC)
```

PostgreSQL 사용 시 대용량·시간순 테이블은 `BRIN`과 시간 파티셔닝을 검토하고, FK·검색·최신순 조회 인덱스를 실제 쿼리 기준으로 검증한다.

## 4. 이벤트 시퀀스: 시세에서 신호까지

```text
Market Provider
  → Market Ingestor: quote
  → 검증·정규화
  → Quote Store: quote 저장
  → Latest Quote Cache: 최신값 갱신
  → Event Bus: quote.updated
  → Signal Engine: 종목별 계산
  → Signals: 최신 상태 비교
      ├─ 상태 동일: signal.changed 생성 안 함
      └─ 상태 변경: signal_events 저장
                         → Event Bus: signal.changed
                         → Stream Gateway: 권한 사용자 전달
                         → Web Client: sequence 검증 후 반영
```

실패 규칙:

- quote의 `sequence`가 이전 값 이하이면 무시한다.
- 같은 `event_id`는 한 번만 반영한다.
- 데이터 신선도 초과 시 신호를 `SUSPENDED`로 바꾼다.
- 알고리즘 결과가 늦어도 이전 결과를 새 결과처럼 표시하지 않는다.

## 5. 이벤트 시퀀스: 월 구독 결제

```text
사용자
  → Web: 결제 시작
  → Billing API: checkout 생성
  → Payment Provider: 결제 처리
  → Webhook API: 서명 검증
  → Payments: 결제 이벤트 idempotency 확인
  → Subscriptions: ACTIVE + 기간 저장
  → Entitlement Cache: 권한 갱신
  → Web: 최신 구독 상태 조회
  → Stream Gateway: signal 토픽 허용
```

규칙:

- 결제 완료 redirect만으로 권한을 활성화하지 않는다.
- 웹훅 이벤트 ID를 unique 처리한다.
- 결제 승인 지연 중에는 `PAYMENT_PENDING`을 표시한다.
- 기간 종료 후 `EXPIRED`가 되면 신호 토픽을 차단한다.

## 6. 이벤트 시퀀스: 실시간 스트림 재연결

```text
Web Client
  → Stream Gateway: connect
  ← connection.ready
  → subscribe(symbols)
  ← quote.updated / signal.changed

[연결 끊김]
  → 자동 재연결
  → REST latest snapshot 요청
  ← 최신 quote·signal
  → 마지막 sequence 저장
  → stream subscribe 재개
  ← sequence가 더 큰 이벤트만 반영
```

재연결 후 스냅샷 없이 이벤트부터 반영하지 않는다. 그렇지 않으면 누락된 상태를 최신으로 오인할 수 있다.

## 7. 보존·파티셔닝 정책 초안

| 데이터 | 기본 보존 방향 |
|---|---|
| 현재 신호 | 최신 1건/종목 + 이력 별도 |
| 신호 이력 | 장기 보존, 성과 검증에 사용 |
| 원천 체결/시세 | 공급자 계약·비용에 따라 기간 결정 |
| 1분·일봉 캔들 | 서비스 분석 기간에 맞춰 장기 보존 |
| 결제·구독 | 법정·회계 보존기간 검토 |
| 뉴스·공시 | 원문 라이선스와 보존 조건 준수 |
| 로그·추적 ID | 개인정보·보안 정책에 따라 제한 보존 |

고빈도 시세는 일별 또는 월별 파티션을 검토한다. 파티션 키는 조회 패턴과 삭제·보존 정책을 함께 고려한다.

## 8. 마이그레이션 원칙

PostgreSQL을 선택할 경우:

- 모든 마이그레이션 첫 단계에 짧은 `lock_timeout`을 둔다.
- 대용량 테이블의 `NOT NULL + DEFAULT`를 한 번에 추가하지 않는다.
- 인덱스는 운영 중 `CREATE INDEX CONCURRENTLY`를 사용한다.
- 컬럼명 변경은 expand → backfill → code switch → contract 순서로 진행한다.
- 새 제약조건은 `NOT VALID` 후 별도 검증한다.
- 시세·신호 이력 테이블에 대한 대량 backfill은 배치로 실행한다.
- 롤백과 production-scale migration 테스트를 준비한다.

## 9. 백업·복구

- 관계형 저장소 정기 백업
- 결제·구독 데이터 point-in-time recovery
- 신호 이력 복구 테스트
- 시세 원천 재수집 가능성 확보
- 월 1회 staging 복구 테스트
- RPO·RTO는 데이터 공급자와 서비스 SLA 확정 후 결정

## 10. 구현 전 결정 사항

- 관계형 DB 및 시계열 DB 최종 선택
- 메시지 브로커 선택
- 시세 저장 보존기간
- 신호 이력의 법적·상품적 보존기간
- 종목 마스터 범위
- 결제 공급자 웹훅 필드
- 성과 집계용 기준 가격과 슬리피지
