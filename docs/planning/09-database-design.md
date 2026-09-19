# 09. Database Design

## 문서 상태

PostgreSQL 계열 관계형 DB를 기준으로 한 논리 정본이다. 구체적인 타입·파티션·보존 기간·RPO/RTO는 공급자·트래픽·법무 승인 후 migration 설계로 확정한다.

### 리디자인 영향

UI 전면 리디자인만으로 새 영속 엔티티·컬럼·migration을 추가하지 않는다. movers·시장 breadth·quote strip은 기존 read model에서 계산/조합하며, 제품 요구로 새 집계가 필요해질 때 별도 API·DB·보존·권한 검토를 먼저 만든다.

## 1. 설계 원칙

- 현재 조회 모델과 append-only 이력을 분리한다.
- 인증 사용자와 리소스 소유권을 DB FK뿐 아니라 모든 서비스 요청에서 검증한다.
- MVP 신호는 종목당 기본 전략 하나이며, `strategy_key`를 포함해 다중 전략 확장을 막지 않는다.
- 이벤트 시점 evidence는 immutable snapshot으로 보존한다.
- 결제 provider 원본 수신 기록·내부 상태·entitlement read model을 분리한다.

## 2. 핵심 테이블

### `users`

- `id` UUID PK
- `status` `ACTIVE | DISABLED | DELETED` 또는 내부 enum
- `created_at`, `updated_at`, `deleted_at`

### `auth_identities`

- `id` UUID PK
- `user_id` FK → users
- `provider`, `provider_subject`, UNIQUE(`provider`, `provider_subject`)
- 원문 access token·refresh token 저장 금지

### `sessions`

- 서버 세션의 `token_hash`, `csrf_token_hash`, `user_id`, 생성·만료·최근 사용·폐기 시각만 저장한다.
- 브라우저에 발급한 원문 세션 토큰과 CSRF 토큰은 DB에 저장하지 않는다.
- 활성 세션 조회 인덱스와 로그아웃/일괄 폐기 절차를 운영 세션 저장소 계약에 연결한다.

### `instruments`

- `ticker` PK
- `name`, `exchange`, `market_type`, `security_type`, `status`
- `listed_at`, `delisted_at`, `updated_at`
- MVP 지원 가능한 `security_type` allowlist를 별도로 관리

### `quotes_current`

- `ticker` PK/FK → instruments
- `price`, `change`, `change_rate`, `volume`
- `as_of`, `received_at`, `data_status`, `stale_after`, `source`
- 현재값만 보관하고 원천 시계열은 보존정책에 따른 별도 저장

### `quote_bars`

- (`ticker`, `interval`, `bucket_at`) 복합 PK
- OHLCV, `source`, `created_at`
- 조회 기간·간격과 삭제 정책을 함께 검토해 파티션

### `signals_current`

- `id` UUID PK
- `ticker` FK → instruments
- `strategy_key` NOT NULL DEFAULT `default`
- `direction`, `status`, `data_status`, `strength`
- `occurred_at`, `published_at`, `valid_until`, `algorithm_version`
- `last_heartbeat_at`, `last_evaluated_at`, `stale_after`, `health_reason`; effective 상태는 이 원시 시각을 조회 시 watchdog가 계산한다.
- `last_event_epoch`, `last_sequence`, `last_event_id`, `updated_at`
- UNIQUE(`ticker`, `strategy_key`)

### `signal_events`

- `event_id` UUID/외부 이벤트 ID PK
- `signal_id` FK → signals_current
- `ticker`, `strategy_key`, `stream_key`, `epoch`, `sequence`
- `event_type`, `payload_jsonb`, `occurred_at`, `published_at`, `received_at`
- UNIQUE(`stream_key`, `epoch`, `sequence`)
- `signal_id`와 ticker/strategy의 일치성을 composite FK 또는 애플리케이션+DB 제약으로 보장
- append-only; 정정은 새 correction/retraction event로 기록

### `signal_revisions`

- `id` UUID PK, `signal_id` FK
- `revision_no`, `input_as_of`, `algorithm_version`, `evaluation_status`
- `evidence_snapshot_jsonb`, `created_at`
- UNIQUE(`signal_id`, `revision_no`)
- 외부 공개 이벤트와 내부 계산 revision을 분리

### `signal_event_evidence`

- `id` UUID PK, `event_id` FK → signal_events
- `evidence_type`, `label`, `value_jsonb`, `display_order`
- 이벤트 당시 값을 수정하지 않음

### `watchlists`, `watchlist_items`

- `watchlists`: `id`, `user_id`, `name`, timestamps
- `watchlist_items`: `watchlist_id`, `ticker`, `position`, `created_at`
- UNIQUE(`watchlist_id`, `ticker`)
- watchlist과 item의 동일 사용자 소유권을 composite FK 또는 트랜잭션 검증으로 보장
- 기본 관심목록 하나인지 다중 목록인지 정책 승인 필요

### `plans`, `subscriptions`, `entitlements`

- plan 상품·가격·통화·자동갱신 정책
- subscription: `user_id`, provider, external IDs, 내부 상태, 상태 revision, 시작/종료/취소 예정/환불 시각
- entitlement: `user_id`, capability, effective_from/until, status, source_subscription_id, revision
- UNIQUE(provider, external_subscription_id), UNIQUE(user_id, capability, active scope)
- entitlement는 클라이언트 입력이 아닌 서버 상태로 계산

### `payment_events`

- `provider`, `provider_event_id` UNIQUE
- signature 검증 결과, 수신 시각, 처리 상태, 처리 시도, 상태 revision
- 원본 payload는 필요 최소 필드만 암호화·제한 보관하거나 provider 재조회로 대체
- 오래된/역순 이벤트를 적용하지 않은 이유도 감사 가능한 메타데이터로 남김

### `outbox_events`, `consumer_checkpoints`

- outbox: aggregate, event_id, stream_key, payload, status, attempt, next_attempt_at, leased_until, last_error
- checkpoint: consumer, stream_key, epoch, last_sequence
- 상태/이력/outbox 기록의 원자성과 재시작 복구를 지원

### `audit_events`

- actor, action, resource, request_id, trace_id, occurred_at, metadata
- 토큰·카드번호·원문 provider subject 등 민감 원문 금지

## 3. 제약·불변성

- 모든 FK·UNIQUE·CHECK는 DB와 애플리케이션 양쪽에서 검증
- 종목·전략별 현재 signal은 하나만 존재
- 같은 streamKey·epoch에서 sequence는 유일하고 단조 증가
- 모든 이벤트의 ticker/strategy/stream 관계를 검증
- 현재 상태 변경과 event/outbox는 같은 트랜잭션 또는 동등한 원자성
- 가격·금액은 정밀 숫자/공급자 정수 단위, 시간은 UTC
- 회원 요청의 `user_id`는 body 값을 신뢰하지 않고 세션에서 도출

## 4. 인덱스 방향

- `quotes_current(as_of)`, `quote_bars(ticker, interval, bucket_at DESC)`
- `signals_current(status, occurred_at DESC)`
- `signal_events(stream_key, epoch, sequence)` 및 `(ticker, occurred_at DESC)`
- `signal_revisions(signal_id, revision_no DESC)`
- `stock_news(ticker, news_id)`, `financial_snapshots(ticker, period_end DESC, metric_code)`
- `watchlist_items(watchlist_id, position)`
- `subscriptions(user_id, status, ends_at)`, `entitlements(user_id, capability, status)`
- 실제 query plan·카디널리티·파티션 크기로 검증

## 5. 보존·삭제 정책 표

출시 전에 아래 모든 칸을 데이터 유형별로 채우고 개인정보/법무 승인을 받는다.

| 데이터 | 목적 | 보존 기간 | 삭제/익명화 | 백업 재적용 | 접근 역할 | 근거 |
|---|---|---|---|---|---|---|
| 계정 식별자 | 로그인 제공 | 미결정 | 탈퇴 처리 | 복구 시 삭제 목록 재적용 | 지원 제한 | 미결정 |
| 관심종목 | 사용자 기능 | 미결정 | 사용자 삭제/탈퇴 | 동일 | 서비스 | 미결정 |
| 신호 이력/evidence | 서비스·정정 | 미결정 | 법무/공급자 기준 | 재구축 검증 | 데이터/운영 | 미결정 |
| 결제/웹훅 증적 | 대사·법정 | 미결정 | 법정 예외 | 접근 통제 | 결제/감사 | 미결정 |
| 원천 시세 payload | 처리·장애 분석 | 최소화/미결정 | 파기/비식별화 | 공급자 계약 | 제한 운영 | 미결정 |
| 감사 이벤트 | 보안·사고 | 미결정 | 제한적 익명화 | 무결성 보존 | 보안 | 미결정 |

## 6. 마이그레이션 규칙

1. 새 테이블/컬럼과 호환 read path 추가
2. 데이터 backfill 및 invariant 검증
3. 애플리케이션 dual-read/dual-write 또는 안전한 전환
4. 트래픽·query plan 검증
5. 제약별 방식으로 강화
6. 구 스키마 제거는 별도 릴리즈

PostgreSQL 제약은 종류별 절차를 사용한다. FK/CHECK의 `NOT VALID` 후 검증, UNIQUE/PK의 사전 unique index, `CREATE INDEX CONCURRENTLY`의 비트랜잭션 실행 여부를 migration runner에 맞춰 명시한다. 모든 migration은 실패·재실행·롤백/복구 절차를 가진다.

## 7. 백업·복구 수용 기준

- `signal_events`, `signal_revisions`, `payment_events`, `entitlements` 무결성 검증
- point-in-time 복구 후 sequence·outbox·권한 재계산 리허설
- RPO/RTO와 복구 담당자·알람·runbook 승인
- 공급자 원본을 보관하지 않는 경우에도 입력 식별자·버전·asOf로 계산 재현 가능

## 8. 승인된 staging 연결

- Neon project: `stock-research` (`flat-surf-27471705`)
- Region: AWS Asia Pacific 1 (Singapore)
- Branch/database: `production` / `neondb`
- `001_initial.sql`과 staging 전용 `002_sandbox_snapshots.sql`을 적용했고 public table 25개를 확인했다.
- 현재 애플리케이션은 아직 domain table을 직접 사용하는 repository가 아니므로, staging persistence adapter가 추가되기 전까지 DB migration 적용은 계약 검증 증거로만 취급한다.
- connection string과 password는 문서·Git·로그에 기록하지 않는다.
