# 운영·복구 Runbook

이 문서는 현재 저장소의 fixture 기반 sandbox를 검증하기 위한 절차다. 실제 시세·인증·결제 provider, PostgreSQL 운영 저장소, 개인정보 보존 정책이 승인되기 전에는 production 운영 절차로 사용하지 않는다.

## 1. 배포 전 증빙

```bash
npm run security
npm run check
npm test
```

실패한 검사를 무시하고 배포하지 않는다. `npm run measure` 결과는 현재 실행 환경의 참고값이며 승인된 SLO가 아니다.

## 2. Neon staging 확인

현재 staging DB는 Neon 프로젝트 `stock-research`(`flat-surf-27471705`, AWS Asia Pacific 1 Singapore)의 `production` branch / `neondb`다. connection string은 `DATABASE_URL` 또는 Cloudflare secret으로만 전달하고 로그·Git·문서에 기록하지 않는다.

```bash
DATABASE_URL='(secret manager에서 주입)' npm run db:migrate
```

- migration은 `db/migrations/001_initial.sql`을 적용하고 public table 수·제약 불변식을 확인한다.
- 현재 migration은 논리 모델 검증용이며, domain-level production repository·backup·PITR 승인 전에는 production 데이터 저장소로 간주하지 않는다.
- Neon project/branch 삭제·reset은 snapshot과 migration evidence를 보존한 뒤 별도 승인한다.

## 3. 기동·상태 확인

```bash
STORE_SNAPSHOT_PATH=/var/lib/stock-demo/store.json npm start
curl -fsS http://127.0.0.1:4173/healthz
curl -i http://127.0.0.1:4173/readyz
curl -sS http://127.0.0.1:4173/internal/metrics
```

- `/healthz`는 프로세스 liveness만 확인한다.
- `/readyz`는 outbox worker, provider sandbox 상태, Origin allowlist, production metrics token 상태와 worker의 최근 실행·오류 정보를 확인한다.
- 운영 metrics endpoint를 사용할 때는 설정된 접근 토큰을 안전한 운영 방식으로 전달한다. 토큰 값을 로그·명령 기록·이슈에 남기지 않는다.
- production에서 auth/payment/market provider가 sandbox이거나 Origin/metrics 설정이 없으면 `503`을 정상적인 fail-closed 결과로 취급한다.

## 4. Snapshot 저장·복구

### 정상 종료

`SIGTERM`을 보내면 worker를 중지하고 in-flight delivery가 끝난 뒤 store·outbox·checkpoint·audit snapshot을 저장한다. 종료 코드와 `SNAPSHOT_SAVE_FAILED` 로그를 확인한다.

### 복구

1. 원본 snapshot 파일을 별도 보존하고 파일 크기·수정 시각을 기록한다.
2. 동일한 빌드와 `STORE_SNAPSHOT_PATH`로 서버를 기동한다.
3. `Loaded sandbox store snapshot` 로그와 `/readyz` 응답을 확인한다.
4. `/api/v1/watchlists`, `/api/v1/subscriptions/me`, premium stream replay를 대표 시나리오로 확인한다.
5. 복구가 실패하면 snapshot을 임의 수정하거나 빈 상태로 덮어쓰지 말고 `SNAPSHOT_LOAD_FAILED` 원인과 원본을 보존한다.

저장은 고유 임시 파일에 기록하고 flush 후 rename하며, 동시 저장은 직렬화한다. 이 방식은 sandbox 파일 손상을 줄이지만 PostgreSQL 백업·point-in-time 복구를 대체하지 않는다.

## 5. Outbox·stream 장애

`/readyz`의 `checks.outboxWorker`와 metrics의 `outbox_worker_error_total`을 먼저 확인한다.

- `PENDING`: backoff와 lease 만료 후 재시도 대상이다.
- `PUBLISHED`: retry 시각·lease·오류 정보가 남아 있지 않아야 한다.
- `FAILED`: 자동 재시도가 끝난 terminal 상태다. 같은 스트림의 후속 cursor는 gap 방지를 위해 발행되지 않을 수 있다.
- `CHECKPOINT_NOT_CONTIGUOUS`: 누락된 선행 이벤트와 checkpoint를 함께 조사한다. 후속 이벤트를 수동으로 강제 발행하지 않는다.

복구 후에는 같은 스트림의 `epoch/sequence`가 연속인지, replay가 `replayable=true`인지, 불가능한 경우 snapshot fallback과 `resyncReason`이 반환되는지 확인한다.

## 6. 결제 webhook 장애

sandbox 서명은 다음 형식이다.

```text
x-payment-signature: t=<unix-seconds>,v1=<hex-hmac>
HMAC input: <unix-seconds>.<raw-json-body>
```

허용 시각 오차는 `PAYMENT_WEBHOOK_TOLERANCE_SECONDS`로 제한한다. stale 서명·잘못된 형식·payload 충돌은 거부한다. `providerEventId` 중복은 동일 payload일 때만 idempotent 결과를 반환한다.

결제 성공 응답만으로 권한을 활성화하지 않는다. `PENDING` → provider 이벤트 반영 → entitlement 확인 순서를 유지하고, 만료·환불·정지 시 열린 stream의 `entitlement.revoked`와 연결 종료를 확인한다.

## 7. 보안 사고·권한 회수

인증 세션 탈취, 소유권 오류, premium payload 노출이 의심되면:

1. 해당 기능을 deny-by-default로 유지하고 우회용 role header를 사용하지 않는다.
2. 영향받은 세션을 폐기하고 열린 stream을 회수한다.
3. request/trace ID, audit action, event ID, stream key, 시각을 수집한다. 비밀값·원문 token·결제 원문은 수집하지 않는다.
4. provider key 교체와 법무·보안·지원 통지 여부를 승인된 사고 절차로 결정한다.
5. 수정 후 `npm run security && npm run check && npm test` 결과와 잔여 위험 승인을 릴리즈 기록에 첨부한다.

## 8. 롤백·미결정 게이트

롤백은 새 프로세스를 중지하고 이전에 승인된 build와 검증된 snapshot을 사용해 재기동하는 방식으로 수행한다. 데이터 삭제, snapshot 덮어쓰기, 상태 강제 전이는 먼저 보존본을 만든 뒤 승인된 절차로만 수행한다.

다음 항목은 이 runbook만으로 승인되지 않는다.

- 실제 provider 계약·재배포권·SLA
- 간편로그인 및 운영 사용자 저장소
- 결제 환불·대사·권위 재조회 정책
- PostgreSQL migration 적용·백업·RPO/RTO
- 개인정보 보존·삭제·백업 재적용
- 신호 표현·위험 고지·성과 표시의 법무 승인
