# 07. TRD — Technical Requirements Document

## 문서 상태

초기 아키텍처 정본. 최종 스택·공급자·SLA·RPO/RTO는 결정 로그 승인 전에는 제안값이다. 이 문서는 WebSocket/SSE 중 하나를 임의로 확정하지 않으며, 두 방식이 같은 이벤트 계약을 따라야 한다.

### 리디자인 영향

`MARKET TAPE`는 프레젠테이션 계층 리디자인이다. REST·stream·권한·freshness·cursor 계약은 변경하지 않는다. UI는 시장 테이프와 quote strip에 기존 `asOf`, `receivedAt`, `dataStatus`, `source`를 압축해 표시하고, 상세 상태/오류/복구 정보는 동일 계약에서 렌더링한다.

## 1. 기술 목표

시세 수집, 알고리즘 계산, 권한 검증, 실시간 전달을 분리해 신뢰 가능한 최신 상태를 제공한다. 초기에는 모듈형 웹/API와 독립 워커 구조로 시작하고, 운영 복잡도가 커질 때 서비스를 분리한다.

## 2. 구성

```text
Browser
  ├─ Web app / SSR or SPA shell
  ├─ REST API client
  └─ WebSocket/SSE client
       ↓
Web/API module ── Auth & Entitlement ── Subscription provider
       ├─ Market read model
       ├─ Stock/News/Financial read model
       └─ Signal current + append-only event/revision history
       ↑                         ↑
Market ingestion worker     Algorithm worker
       ↑                         ↑
Market data provider        Feature/data inputs
       ↓
Stream gateway → authenticated topic subscription → revoke fanout
```

## 3. 신호 처리 계약

- MVP 공개 스트림은 종목별 기본 전략 `strategy_key=default` 하나다. 다중 전략 확장 시 모든 키를 이벤트·권한·DB 유일성에 포함한다.
- `signals_current`는 최신 사용자 표시 상태, `signal_events`는 외부에 공개된 변경 이력, `signal_revisions`는 같은 신호의 내부 재계산/근거 변경 이력이다.
- 신호 이벤트에는 `eventId`, `streamKey`, `epoch`, `sequence`, `occurredAt`, `publishedAt`, `asOf`, `algorithmVersion`, `status`, 불변 evidence snapshot을 포함한다.
- 방향·상태·신선도·연결·entitlement는 별도 축이다. `SUSPENDED`/`STALE`에서 마지막 `BUY`/`SELL`을 현재 추천처럼 표시하지 않는다.
- 엔진 중단은 엔진이 자기 상태를 쓰는 방식에 의존하지 않는다. 독립 watchdog 또는 API 조회 시 `lastHeartbeatAt`, `lastEvaluatedAt`, `staleAfter`로 `effectiveStatus`를 판정한다.

## 4. 이벤트 순서·재연결

### 커서

모든 스트림 이벤트의 순서 비교 키는 `(streamKey, epoch, sequence)`다. `streamKey` 예시는 `signal:005930:default`, `quote:005930`이다. 서로 다른 streamKey의 sequence를 비교하지 않는다.

- `epoch`: 발행 로그 재시작/세대 변경 시 증가
- `sequence`: 하나의 streamKey·epoch 안에서 단조 증가
- `eventId`: 전역 멱등성 키
- 같은 커서는 중복으로 처리하지 않고, 더 작은 sequence는 역순으로 무시한다.

### snapshot → subscribe 원자성

스냅샷 응답은 `snapshotCursor`를 포함한다. 서버는 다음 중 하나를 보장한다.

1. snapshot cursor 이후 이벤트를 replay할 수 있도록 구독 시 cursor를 전달한다.
2. subscribe를 먼저 등록하고 snapshot과 이후 이벤트의 경계를 서버가 보장한다.

클라이언트는 gap 발견 시 `RESYNC_REQUIRED`를 받고 replay를 요청한다. replay 보존 한도를 넘거나 epoch가 유효하지 않으면 전체 snapshot으로 복구하고 `resyncReason`을 기록한다.

## 5. 원자성·멱등성

현재 상태 변경, append-only 이력, outbox 레코드는 하나의 트랜잭션 또는 동등한 원자성 메커니즘으로 기록한다. outbox 발행 실패는 재시도하고 소비자 checkpoint는 별도로 저장한다. 발행 성공 후 소비자 재시도는 `eventId`로 멱등 처리한다.

알고리즘 워커는 동일 `(ticker, strategy_key)`에 대해 한 번에 하나의 계산만 커밋한다. 늦게 도착한 입력은 `inputAsOf`와 계산 revision을 비교해 현재 상태를 덮어쓰지 않는다.

## 6. 구독 권한과 회수

- REST 조회·스트림 연결·재연결·토픽 추가마다 서버 entitlement를 확인한다.
- 결제/환불/만료/관리자 정지 이벤트가 권한 read model에 반영되면 gateway revoke fanout을 실행한다.
- 열린 연결에는 `entitlement.revoked`를 먼저 전달하고, 허용된 짧은 grace 이후 연결을 닫는다. grace의 최대값과 실패 시 기본 거부 동작은 출시 전에 승인한다.
- revoke 전파가 실패해도 프리미엄 이벤트를 계속 전송하지 않도록 gateway의 TTL/권위 조회/deny-by-default를 사용한다.
- 권한 캐시 무효화, 다중 gateway 전파, 전송 대기 버퍼 폐기, 재연결 거부를 하나의 계약으로 시험한다.

## 7. 구독·결제 상태 전이

결제 공급자 이벤트 원본 수신 기록과 내부 현재 상태를 분리한다. `provider_event_id` 중복만으로 순서를 보장하지 않는다.

| 내부 상태 | 허용 전이 예시 | 권한 |
|---|---|---|
| `PENDING` | `ACTIVE`, `PAYMENT_FAILED`, `EXPIRED` | 없음 |
| `ACTIVE` | `CANCELLATION_SCHEDULED`, `REFUND_PENDING`, `EXPIRED`, `SUSPENDED` | 정책상 유지 |
| `CANCELLATION_SCHEDULED` | `ACTIVE`, `EXPIRED`, `REFUND_PENDING` | 종료 시각까지 정책상 유지 |
| `REFUND_PENDING` | `REFUNDED`, `ACTIVE` | 승인된 정책에 따름 |
| `REFUNDED` | `EXPIRED` | 없음 |
| `PAYMENT_FAILED` | `ACTIVE`, `EXPIRED` | 없음 또는 grace 정책 |

공급자 상태가 역순으로 도착하면 revision/권위 있는 공급자 재조회 결과와 비교하고, 오래된 이벤트가 권한을 되살리지 못하게 한다. 모든 전이는 테스트 가능한 상태표로 유지한다.

## 8. 비기능 요구사항

### 신뢰성

- 중복·역순·gap·epoch 변경·replay 만료를 검증
- 워커 재시작 시 입력과 outbox checkpoint 복구
- API/스트림/결제 장애 격리
- 현재 상태는 이력·revision·근거로 재구축 가능

### 보안

- 서버 세션·소유권·entitlement 검증
- 스트림 Origin/토픽/재연결 검증
- 공급자 키는 비밀 저장소, 로그는 마스킹
- 신호 방향을 필드 삭제만으로 보호하지 않고 유추 경로까지 차단

### 성능·용량

출시 전 다음 가정값을 측정하고 승인한다: API/stream p95·p99, 동시 연결 수, 종목당 이벤트 빈도, replay 보존량, stale 판정 지연, revoke 최대 지연. 수치가 없는 상태에서는 성능 합격을 선언하지 않는다.

### 관측성

수집·계산·상태 커밋·outbox 발행·스트림 전송·replay·권한 회수·결제 반영 지연과 실패율을 `requestId`, `traceId`, `eventId`, `streamKey`로 연결한다.

## 9. 장애·복구

| 장애 | 시스템 동작 | UI 동작 |
|---|---|---|
| 시세 공급자 지연 | 마지막 정상값·freshness 저장 | delayed/stale 표시 |
| 알고리즘 워커 중단 | watchdog가 effective status 판정, 신규 신호 중지 | 계산 중단·기준 시각 표시 |
| 스트림 게이트웨이 장애 | API snapshot 유지 가능, replay 복구 | 재연결·복구 결과 |
| outbox 발행 실패 | 재시도·알람, 중복은 eventId로 흡수 | 마지막 정상 시각 |
| DB 읽기 장애 | requestId 오류·부분 격리 | 부분 오류 |
| 결제 웹훅 지연 | pending entitlement | 결제 처리중 |
| 잘못된 이벤트 | schema/version 격리 | 해당 블록 갱신 중지 |

## 10. 배포·운영

- 개발/스테이징/운영 분리
- expand/migrate/contract migration
- API·워커·gateway 독립 롤백
- 실제 신호 공개 전 공급자·법무·관측성·권한 회수 체크리스트 통과
- 장애 주입, replay 만료, 권한 회수, 결제 역순 이벤트 리허설 수행
- 다음 staging 경로는 Vercel route handler와 Supabase PostgreSQL/Realtime을 사용하는 방향으로 전환한다. 현재 Node HTTP/SSE 서버는 Vercel에 무변경 배포하지 않는다.
- Supabase persistence와 Realtime adapter는 domain table repository·transaction boundary·동시성·RLS 정책을 승인하고 구현한 뒤에만 staging에 사용한다.
- 기존 Cloudflare Pages `market-dashboard` 프로젝트는 이 서비스의 배포 대상이 아니며 덮어쓰지 않는다.

## 11. 미결정

최종 언어/프레임워크·호스팅·DB·메시지 브로커, WebSocket/SSE 선택, stream 확장 기준, RPO/RTO, replay 보존기간, staleAfter 수치, revoke 최대 지연은 `decision-log.md`에서 승인한다.
