# 구현 상태 기록

기준 문서: `docs/planning/README.md` 및 `docs/planning/00-brief.md`~`14-deployment-plan.md`.

## 배포 진행 상태

- GitHub `main` baseline push 완료: `8ecf79a` 및 deployment ignore 보완 `76d0661`
- Neon `stock-research` staging project(`flat-surf-27471705`)는 Vercel + Supabase 전환 결정에 따라 삭제 처리했으며, 로컬 connection string도 제거했다. Neon control-plane 복구 유예 기간은 2026-09-26까지다. 기존 `shiftnote-poc`·`sujibgi`는 보존했다.
- 삭제 전 `001_initial.sql` + `002_sandbox_snapshots.sql` 적용, public table 25개, save/load smoke test를 확인했다. `NeonSnapshotStore`와 migration 코드는 전환 작업의 역사적 검증 자산으로 남아 있으며 Supabase adapter로 교체하기 전에는 active staging으로 사용하지 않는다.
- Cloudflare Container Wrangler dry-run과 local image build는 통과했지만 Workers Free plan에서 Containers API가 `requires the Workers Paid plan`으로 거부됐다. 실패한 Worker는 삭제했고 staging URL/secret injection은 없다.
- 다음 배포 방향은 Vercel + Supabase이며, route handler·Realtime/SSE·RLS 설계 승인 전에는 구현하지 않는다.
- production 전환은 실제 provider/auth/payment/domain repository/법무 승인 전 차단

## 이번 구현에서 검증한 범위

| 정본 연결 | 구현 상태 | 증거 |
|---|---|---|
| `SLICE-001` | 대표 종목 시장·검색·상세 fixture 흐름, 거래 상태 표시, 검색 combobox/listbox 키보드 선택, 검색 오류 ID·재시도, 종목별 API 오류와 권한 잠금 분리, 상세 섹션 앵커 탭, 시장·스크리너·관심목록·상세의 delayed/stale/unavailable 가격 라벨·상태·출처 안내 | `/api/v1/market/overview`, `/api/v1/stocks/*`, 반응형 `public/app.js`, `test/accessibility.test.js` |
| `DATA-002` | `asOf`·`receivedAt`·`dataStatus`·`source`, stale fixture, future/invalid timestamp와 알 수 없는 provider status fail-closed | `src/domain/fixtures.js`, `src/application/market-provider.js`, `test/market-provider.test.js` |
| `DATA-001` 일부 | fixture를 대체 가능한 market provider adapter, COMMON_STOCK allowlist, 미지원 ticker fail-closed, freshness/upstream error contract | `src/application/market-provider.js`, `test/market-provider.test.js` |
| `SIG-001` | `default` 전략, evidence snapshot, cursor 비교, 이벤트 JSON Schema와 경계 validator | `src/domain/cursor.js`, `src/application/validation.js`, `contracts/signal-event.schema.json`, `test/cursor.test.js`, `test/event-schema.test.js` |
| `SIG-002` 일부 | fixture 신호의 current/event/revision/evidence snapshot read model, premium REST/UI 이력, watchdog effective status 분리와 손상된 `staleAfter` fail-closed, schema 검증 후 stream event/outbox 원자적 기록, store/outbox/audit snapshot·restore 및 선택적 파일 snapshot 기반 재시작 복구 경로 | `src/domain/watchdog.js`, `src/domain/fixtures.js`, `src/application/store.js`, `src/application/audit.js`, `src/application/validation.js`, `src/application/outbox.js`, `src/application/snapshot-store.js`, `public/app.js`, `contracts/openapi.json`, `test/watchdog.test.js`, `test/outbox.test.js`, `test/store.test.js`, `test/audit.test.js`, `test/snapshot-store.test.js`, `test/recovery-http.test.js` |
| `ENT-001` | 잠금 preview와 활성 entitlement에 따른 필드 분리 | `src/app/server.js`, 권한 smoke test |
| `USER-001` | 사용자별 관심목록 식별자·추가·목록·삭제, 저장/삭제 중 버튼 잠금·중복 결과·작업 오류 코드/ID 안내·멱등성 충돌·소유권 음성 경로, 비회원의 로그인 후 현재 종목 복귀 CTA | `src/application/store.js`, `src/app/server.js`, `public/app.js`, `test/store.test.js`, `test/http.test.js`, `test/accessibility.test.js` |
| `AUTH-001` 일부 | sandbox 서버 세션·opaque token/CSRF hash 저장·HttpOnly/SameSite 쿠키·설정된 TTL과 일치하는 cookie Max-Age·세션 폐기·CSRF 검증·last-seen 추적·UI 로그인/로그아웃·로그인 실패/오류 ID/재시도 CTA·로그아웃 실패/오류 ID/재시도·로그아웃 stream revoke·실제 TTL 만료 후 REST/SSE 거부·401 세션 만료 시 안전한 return route 보존 및 재로그인 후 복귀·즉시 재로그인 CTA·신규 방문자 guest 기본값·sandbox 로그인 시도 IP rate limit·무효 session cookie의 demo role fallback 차단·production sandbox auth readiness gate | `src/application/session.js`, `/api/v1/auth/*`, `src/app/server.js`, `public/app.js`, `test/session.test.js`, `test/auth-http.test.js`, `test/session-expiry-http.test.js`, `test/auth-rate-limit.test.js`, `test/production-auth.test.js`, `test/accessibility.test.js` |
| `SLICE-002` | sandbox checkout `PENDING`→`ACTIVE`, checkout·해지 mutation 오류 ID·재시도 상태 | `subscriptions/checkout`, `subscriptions/cancel`, `public/app.js`, entitlement smoke test |
| `SUB-001` 일부 | 구독 상태 전이표·갱신 결제에 따른 해지예정/정지/환불대기→활성 복귀·정지/만료 전이·만료 시 entitlement 판정·sandbox 웹훅 서명/동일 payload 중복·payload 충돌·provider/user별 revision 역순·`SUSPENDED` 정지 이벤트와 즉시 stream revoke·정지 상태의 checkout 우회 차단·strict payload/idempotency conflict | `src/domain/subscription.js`, `src/application/validation.js`, `POST /api/v1/webhooks/payment`, `test/subscription.test.js`, `test/revoke.test.js`, `test/validation.test.js`, `test/store.test.js`, `test/http.test.js` |
| `STREAM-001` | SSE snapshot·종목별 단일 publisher·동일 cursor fan-out·순번·재연결 cursor 기반 contiguous replay·gap 시뮬레이션·내부 gap 검증 replay·권한 검증된 full snapshot fallback·마지막 정상 수신 시각·신호 카드의 연결/데이터 복구 배지·복구 중 `STALE` 표시·웹훅/로그아웃/주기적 entitlement 재검증에 따른 권한 회수 및 client 잠금 전환 | `/api/v1/stream`, `/api/v1/stream/replay`, `contracts/openapi.json`, `src/application/store.js`, `src/app/server.js`, `src/application/outbox-worker.js`, `public/app.js`, `test/http.test.js`, `test/auth-http.test.js`, `test/store.test.js`, `test/openapi.test.js`, `test/accessibility.test.js` |
| `SCREEN-001` | 승인된 구조화 조건만 실행하고 query 실패를 화면 오류·오류 ID·재시도 상태로 유지 | `screener/conditions`, `screener/query`, `public/app.js`, `test/accessibility.test.js` |
| `PLAN-001` 일부 | 정본 REST 27개 경로·method, session/demo 인증 OR 경계, session mutation 조건부 CSRF·운영 metrics token, 서명·조회 범위 결합 opaque 목록 cursor·핵심 enum·direction-free preview·signal history OpenAPI 고정 | `contracts/openapi.json`, `src/application/list-cursor.js`, `docs/planning/08-api-data-contract.md`, `test/cursor.test.js`, `test/http.test.js`, `test/openapi.test.js` |
| `SEC-001` 일부 | 환경별 Origin allowlist·Origin URL 형식 검증·production 미설정 Origin readiness fail-closed·보안 헤더·request/trace ID·잘못된 percent-encoding 경로 거부·만료 정리·bounded bucket을 적용한 API 및 sandbox 로그인 시도 IP rate limit·production metrics/payment webhook 설정 미설정 및 데모 기본키 fail-closed·opaque token/CSRF hash·strict structured input/webhook·strict UTF-8 본문·JSON Content-Type 경계·비정상 payment signature header fail-closed·CSRF·watchlist ownership·idempotency conflict·인증/entitlement·소유권·Origin/rate-limit/payment webhook 거부 감사·명시적 역할 없는 요청의 guest fail-closed·민감 metadata를 제외한 bounded audit trail·metric route label 정규화·이벤트/재연결 cursor의 JavaScript 안전 정수 경계·고신뢰 secret scan 명령 | `src/application/security.js`, `src/application/audit.js`, `src/application/session.js`, `src/application/metrics.js`, `src/application/validation.js`, `src/application/store.js`, `src/app/server.js`, `src/application/outbox.js`, `src/application/outbox-worker.js`, `scripts/secret-scan.js`, `contracts/openapi.json`, `test/security.test.js`, `test/session.test.js`, `test/metrics.test.js`, `test/audit.test.js`, `test/secret-scan.test.js`, `test/production-auth.test.js`, `test/auth-http.test.js`, `test/auth-rate-limit.test.js`, `test/http.test.js`, `test/outbox.test.js` |
| `OPS-001` 일부 | liveness/readiness 분리(`/healthz`/`/readyz`), health/metrics, HTTP 지연·상태·stream/replay/webhook/revoke/audit 카운터·권한 회수 latency, 동적 route label 정규화를 포함한 bounded p50/p95/p99 관측 및 재현 가능한 sandbox 측정 스크립트, watchdog 판정, SSE publisher에 연결된 백그라운드 outbox worker의 terminal-safe·cursor-ordered claim/publish/retry/checkpoint, 같은 epoch의 gap checkpoint 차단, worker 예외 복구·in-flight drain·last run/success/error health를 readiness에 노출, 손상된 store/outbox delivery state/checkpoint/audit snapshot의 strict fail-closed·atomic restore와 store/audit 동시 load 검증, 직렬화·고유 임시 파일·flush를 포함한 snapshot 저장 lifecycle, SIGTERM stop 및 store/outbox/audit snapshot 저장 lifecycle, production auth/payment sandbox·metrics token readiness gate | `src/application/metrics.js`, `src/domain/watchdog.js`, `src/application/outbox.js`, `src/application/outbox-worker.js`, `src/application/audit.js`, `src/application/snapshot-store.js`, `src/app/server.js`, `db/migrations/001_initial.sql`, `scripts/measure-demo.js`, `contracts/openapi.json`, `/healthz`, `/readyz`, `/internal/metrics`, `test/metrics.test.js`, `test/measure-demo.test.js`, `test/watchdog.test.js`, `test/outbox.test.js`, `test/audit.test.js`, `test/snapshot-store.test.js`, `test/recovery-http.test.js`, `test/migration.test.js`, `test/openapi.test.js`, `test/http.test.js`, `test/production-auth.test.js` |
| `DATA-002` 일부 | PostgreSQL 논리 schema migration, FK/유일성/상태 제약, payment payload hash를 포함한 reconciliation·audit 조회 인덱스, watchdog raw heartbeat/evaluation/staleAfter 필드, 해시 세션 저장, outbox/checkpoint, in-memory store/outbox snapshot·restore 및 실제 sandbox 프로세스 재기동 복구 검증 | `db/migrations/001_initial.sql`, `docs/planning/09-database-design.md`, `src/application/store.js`, `src/application/outbox.js`, `src/application/snapshot-store.js`, `test/migration.test.js`, `test/store.test.js`, `test/outbox.test.js`, `test/snapshot-store.test.js`, `test/recovery-http.test.js` |
| `QA-001` 일부 | 문법·도메인 회귀·실제 HTTP·대표 시장→로그인→관심목록→checkout→entitlement→premium HTTP 수직 흐름·bounded request body/413 경계·JSON Content-Type/415·strict UTF-8·잘못된 percent-encoding 경로 경계·stream gap 및 재연결 cursor의 contiguous replay·안전 정수 범위 밖 cursor 거부·TTL 만료 session의 REST/SSE 거부·무효 session cookie의 demo role fallback 차단·production Origin allowlist 누락 readiness 거부·secret scan·`SUSPENDED` 웹훅의 즉시 stream revoke·손상된 store/outbox delivery state/checkpoint snapshot 복원 거부·store/audit snapshot 동시 load atomicity·브라우저 정적 자산·production 경계·provider freshness·watchdog의 손상 timestamp fail-closed·cursor-ordered outbox worker/충돌·직렬화 snapshot 저장·JSON 직렬화 불가 signal evidence 거부·재시작 snapshot/restore·실제 프로세스 재기동·sandbox 성능 측정 도구·스트림/목록 cursor 무결성·current/revision/history snapshot·late input·same-ticker fan-out·ownership·관심종목 저장/삭제 pending·duplicate 전환·작업 오류 코드/ID 표시·검색/스크리너/종목 리소스/구독 mutation 오류 ID·로그인 실패 오류 ID/재시도·권한 잠금 분리·연결 복구/데이터 복구 배지·복구 중 signal `STALE` 전환·delayed/stale/unavailable 가격 표시·logout/expiry/revoke client 전환·세션 만료 재로그인 CTA·sandbox 로그인 rate limit·rate-limit bucket 정리·bounded metric route label·기본 guest fail-closed·접근성 정적 기준·승인 토큰 대비 자동 검사·키보드 확인 sheet·검색 결과 키보드 선택·상세 섹션 앵커·거래 상태/마지막 정상 수신 시각 표시·정본 27개 OpenAPI route/method·session/demo 권한·조건부 CSRF·metrics token·preview 보호 필드·migration 불변식·이벤트 schema/경계 검증 테스트 | `npm run check`, `npm run security`, `npm test` (`116개 통과`) · `test/contrast.test.js` · `test/vertical-slice.test.js` · `test/http.test.js` · `test/auth-http.test.js` · `test/session-expiry-http.test.js` · `test/outbox.test.js` · `test/event-schema.test.js` · `test/migration.test.js` · `test/production-origin-gate.test.js` · `test/secret-scan.test.js` |

최근 보강: sandbox 결제 webhook은 `t=Unix timestamp,v1=HMAC-SHA256(timestamp.body)` 형식과 허용 시간 오차를 검증하며, 만료 서명은 거부한다. HTTP 요청 본문은 strict UTF-8로 디코딩해 손상된 바이트를 JSON 파싱 전에 거부한다. provider freshness와 watchdog은 미래·손상 timestamp 및 미지원 상태를 `UNAVAILABLE`로 fail-closed 처리한다. 런타임 응답의 `asOf`/`dataStatus`/correlation metadata를 OpenAPI required 계약과 맞추고, 운영·복구 절차는 `docs/operations-runbook.md`에 기록했다.

최근 sandbox 실행 검증(50 requests, concurrency 10, `/api/v1/market/overview`)은 HTTP 200 응답 50건, p50 7.156ms, p95 29.35ms, p99 53.358ms를 기록했다. 이 수치는 현재 실행 환경의 참고값이며 출시 SLO 승인값은 아니다.

## UI/UX 재작업 — EVIDENCE TAPE 단일 시스템

기존에 초기 토큰·`MARKET TAPE`·`EVIDENCE TAPE`가 같은 `:root`를 3중으로 덮어쓰던 `public/styles.css`를 의미 토큰 단일 시스템(515줄)으로 재작성했다. 계약(라우트·API·상태 축·접근성 문구)은 유지하고 시각·정보 위계·반응형만 교체했다.

- 한국 시장 시맨틱 정합: 상승 `--rise-700 #c3313b` / 하락 `--fall-700 #2b64b4`, 실시간 `--live-600 #007f83`, 지연·오래된 `--amber-700 #8a4b00` — 모두 문구·기호 병기
- 카드 soup 제거: 카드 그림자 제거, 라디우스 8px 제한, rule line·section kicker·표면 톤으로 위계 구성
- 값–상태 근접 배치: `market-tape` → `freshness-strip` → `detail-freshness` 3단으로 기준 시각·수신 시각·출처 압축
- 반응형 재정의: 1180px 내비게이션 접힘 / 760px 하단 탭(44px 타깃) + sticky detail tab 해제 / 420px 1열
- 접근성: `prefers-reduced-motion` 전역 무효화, 3px focus ring, 320px 가로 스크롤 없음(내부 tape·table만 허용)
- 시장 테이프 갱신을 `nth-child` 의존에서 `data-tape` 속성 기반으로 교체하고, movers 보드에 스크리너 연결 CTA를 추가
- `--tertiary`는 `test/contrast.test.js` 경계값(4.50) 때문에 `#697782` → `#56697a`로 조정
- 검증: `npm run check` 통과, `node --test test/contrast.test.js test/accessibility.test.js` 15/15 통과, `node --test` 119/120(실패 1건은 기존 `test/recovery-http.test.js` 임시 디렉터리 이슈로 UI 변경과 무관), `node scripts/check-selectors.js` 누락 class 0
- 설계 산출물: `docs/design/evidence-tape-ui-system.md`

## 아직 출시 기준으로 간주하지 않는 범위

- 실제 시세·뉴스·재무 공급자와 재배포권/SLA
- 실제 간편로그인, 세션 쿠키·CSRF, 운영용 사용자 저장소
- 실제 결제대행사·웹훅 서명·환불·대사
- 법무 승인된 신호 표현·위험 고지·성과 기준
- PostgreSQL migration 운영 적용, outbox/worker/watchdog, RPO/RTO와 부하 목표
- 개인정보 보존·삭제·백업 재적용 승인

상단 권한 전환기는 단일 데모 세션을 위한 장치이며 인증·결제·권한의 운영 보안 경계를 대체하지 않는다. 위 미결정 항목이 승인되면 fixture adapter를 실제 adapter로 교체하고 `DATA-001`, `AUTH-001`, `SUB-001`, `OPS-001`, `SEC-001`, `QA-001`을 이어서 진행해야 한다.
