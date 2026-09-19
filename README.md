# 시그널랩 데모 수직 슬라이스

`docs/planning/`을 정본으로 삼아 구현한 국내 개별주식 리서치 플랫폼의 계약 검증용 데모입니다. 현재 저장소에는 구현 코드가 없었기 때문에 외부 시세 공급자·결제대행사·간편로그인·법무 문구가 승인되기 전에도 검증할 수 있는 fixture 기반 수직 슬라이스를 우선 구성했습니다.

## 실행

```bash
npm start
# http://localhost:4173
```

sandbox 상태를 프로세스 재기동 뒤에도 복구하는 검증이 필요하면 별도 경로를 지정합니다. 이 기능은 PostgreSQL 운영 저장소를 대체하지 않습니다.

```bash
STORE_SNAPSHOT_PATH=/tmp/stock-demo/store.json npm start
```

검사:

```bash
npm run check
npm run security
npm test
```

현재 Neon staging은 폐기했습니다. 다음 DB 전환은 Supabase staging 계획 승인 후 진행하며, connection string과 `service_role` key는 secret manager 또는 Vercel server-side 환경변수로만 주입합니다. 현재 `npm run db:migrate`는 Neon adapter를 가리키므로 Supabase adapter 승인·구현 전에는 실행하지 않습니다.

`npm run security`는 저장소에서 고신뢰 비밀 패턴을 탐지하지만, 실제 secrets manager·dependency/container scan을 대체하지 않습니다.

성능 측정은 임계값을 임의로 합격 처리하지 않고 결과만 출력합니다.

```bash
npm run measure
MEASURE_PATH=/api/v1/stocks/005930/quote MEASURE_REQUESTS=200 MEASURE_CONCURRENCY=20 npm run measure
```

## 포함된 흐름

- 시장 개요 → 종목 검색 → 종목 상세
- 종목 검색 결과의 키보드 위·아래 이동·Enter 선택 및 listbox 접근성
- fixture를 실제 provider로 교체할 수 있는 market adapter와 COMMON_STOCK allowlist
- `asOf`·`receivedAt`·`dataStatus`·`source` 표시
- 차트와 동일 데이터의 접근 가능한 표 제공
- 회원 관심종목 추가·목록·삭제와 `Idempotency-Key`
- 방문자/무료 회원의 방향 없는 신호 잠금 미리보기
- sandbox checkout `PENDING` → 서버 entitlement `ACTIVE`
- sandbox payment webhook timestamp-bound 서명 검증·허용 시간 오차·중복 이벤트·provider revision 역순 차단
- entitlement 확인 후 구독 신호 방향·근거·버전·유효기간 표시
- `contracts/signal-event.schema.json`과 런타임 validator로 신호 이벤트 필드·cursor·시각 순서 검증
- SSE `streamKey/epoch/sequence` snapshot, 중복·역순 무시, gap replay 및 snapshot fallback
- 종목별 단일 SSE publisher의 다중 연결 fan-out과 outbox worker checkpoint
- 저장 상태와 독립 watchdog의 heartbeat/evaluation effective status 및 데이터 stale 분리
- stream event의 outbox 멱등 기록·재시도 backoff·consumer checkpoint sandbox
- outbox worker의 claim → publish → checkpoint 흐름과 publish 실패 재시도 테스트
- store/read model/outbox/checkpoint snapshot·restore 기반 재시작 복구 검증
- 만료/환불 완료 웹훅의 `entitlement.revoked` fan-out과 열린 스트림 종료
- 로그아웃·주기적 entitlement 재검증에 따른 열린 스트림 회수
- 허용 Origin·CSP/security headers·request/trace ID·기본 rate limit
- sandbox 로그인 시도 IP rate limit과 제한 감사 기록

로그인 시도 제한 기본값은 IP당 1분 10회이며 검증 환경에서는 `AUTH_RATE_LIMIT_MAX`로 조정할 수 있습니다.
- 인증·관심종목·구독·웹훅·스트림 회수 전환의 민감값 제거 bounded audit trail
- `/healthz` liveness와 `/readyz` readiness 분리, low-cardinality `/internal/metrics` 운영 증거, HTTP p50/p95/p99 관측
- 구조화 스크리너·checkout·웹훅 입력 검증 및 거부 테스트
- sandbox 로그인에서 서버측 opaque session·HttpOnly/SameSite 쿠키·세션 폐기·CSRF 검증
- 구현 sandbox 경계를 고정한 [OpenAPI 계약](</mnt/c/Users/wj941/Documents/stock/contracts/openapi.json>)
- 승인된 구조화 조건 스크리너
- loading·empty·error·stale·permission 상태와 반응형 레이아웃
- PostgreSQL 논리 schema migration과 FK·유일성·상태 제약 정적 검증

상단의 권한 모드 버튼은 실제 인증이 아니라 데모 세션 전환 장치입니다. `demo-fixture (미승인 샌드박스)` 데이터와 데모 가격을 실제 서비스 데이터로 오인하지 않도록 화면에 명시했습니다.
서버에는 provider 연동 전 검증을 위한 `POST /api/v1/auth/demo/session`이 있으며, 운영 인증 provider를 대체하지 않습니다.

## 정본과의 연결

- 서버 라우트: `docs/planning/README.md`, `08-api-data-contract.md`
- 신호 커서·replay: `07-trd.md`, `08-api-data-contract.md`
- 데이터 구조 방향: `09-database-design.md`
- 화면·상태·접근성: `05-wireframe-spec.md`, `06-design-spec.md`
- 구현 단위: `13-tickets.md`의 대표 수직 슬라이스 관련 티켓

실제 공급자, 결제, 법무·개인정보 보존 정책이 승인되기 전에는 이 데모를 상용 결제나 실제 프리미엄 신호 공개로 간주하지 않습니다.
PostgreSQL migration은 논리 모델 검증용이며, 이전 Neon `stock-research` staging은 삭제했습니다. Supabase 전환 승인 후 expand/backfill/verify/switch/contract와 복구 리허설을 수행합니다. Vercel + Supabase 배포 계획은 [배포 계획](docs/planning/14-deployment-plan.md)을 따릅니다.

운영 상태 확인·snapshot 복구·outbox/webhook 장애 대응 절차는 [운영·복구 Runbook](</mnt/c/Users/wj941/Documents/stock/docs/operations-runbook.md>)에서 확인합니다. 실제 운영 승인을 대체하지 않습니다.
