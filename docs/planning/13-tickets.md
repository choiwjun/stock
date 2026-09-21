# 13. Implementation Tickets

## 문서 상태

정본 요구사항과 연결된 구현 티켓이다. 기존 화면은 기능 baseline으로만 취급하고, `SIGNALLAB RESEARCH DESK V2 / 프리미엄 금융 리서치 터미널` 전면 리디자인을 새 구현 기준으로 사용한다. 공급자·법무·결제·알고리즘 정책은 별도 출시 blocker로 유지한다. 모든 티켓은 계층별 산출물이 아니라 데모 가능한 수직 slice를 우선한다.

## 1. 추적 규칙

티켓은 최소한 `PRD ID → 화면/flow → API/event → DB → test → release gate`를 연결한다. 공통 인프라 티켓도 사용자 시나리오의 실패 조건을 포함한다.

## 2. 티켓 목록

> 사용자 승인에 따라 아래 리디자인 티켓을 구현 기준으로 확정한다. 출시 blocker는 각 티켓에 별도로 표시한다.

### UI-REDESIGN-001 — `SIGNALLAB RESEARCH DESK V2` 전면 리디자인

- 연결: UX-001~009, PRD-002~005/011, IA 시장, UF-MARKET, WF 시장/종목, `06-design-plan`, `06-design-spec`
- 범위: dark graphite canvas, sidebar, topbar, market rail, Market Pulse, breadth, movers, 탐색 CTA, Stock Identity, Quote Lead, ChartWithTable, 모바일 sticky 작업 탭
- 시각 기준: 하나의 표면 위계와 타이포그래피를 사용하고, 보라색은 인터랙션에만 사용하며 상승 레드/하락 블루·freshness·근거 표시는 유지
- 비범위: API shape 변경, 새 DB 엔티티, 주문·계좌·ETF/ETN/펀드, 실제 결제/실제 Premium signal 공개
- 선행 blocker: 금융 표현·카피·색상 대비 법무/접근성 검토
- baseline 상태: 현재 기능과 상태 계약, 대표 fixture, route/API 테스트를 보존한다.
- 새 구현 상태: 사용자 승인·planning 문서 갱신 완료. 1차 CSS QA에서 확인된 누락 surface·spacing·모바일 overlay·핵심 열 숨김을 수정하고 재검증 중
- 완료: desktop/mobile 정상·loading·empty·error·stale·permission 상태, 개발용 sandbox chrome 분리, WCAG 2.2 AA 수동/자동 검증, 기존 route/API 회귀 통과

### PLAN-001 — 정본·제품·디자인 게이트

- 연결: PRD-001~011, UX-001~006, IA, UF, WF, DS, `06-design-spec`, Gate A
- 범위: 정본 문서, MVP 제외 범위, 권한 matrix, 표현/고지 승인, `SIGNALLAB RESEARCH DESK V2` 시각 방향 승인
- 완료: decision log의 디자인 결정, 승인 디자인 명세, 상태별 프로토타입 경로·추적표. 가격·공급자·법무 등 출시 차단 결정은 별도 선행 조건으로 유지
- 상태: 사용자 승인 완료, 문서 세트 동기화 완료, UI-REDESIGN-001 구현 진행 중; 법무·provider·결제 blocker는 출시 전 유지.

### DATA-001 — 종목 마스터·공급자 계약

- 연결: PRD-002~005, API-STOCK, DB-instruments, Gate B
- 범위: ticker·security type allowlist, 거래 상태, source/asOf, provider adapter
- 완료: 대표 종목 fixture와 라이선스/SLA 증빙, 지원 제외 케이스 테스트

### SLICE-001 — 대표 종목 탐색·시세 vertical slice

- 연결: PRD-002~005, UF-MARKET, WF-STOCK, API-MARKET/API-STOCK, DB quotes, QA-001
- 범위: 시장 → 검색 → 상세 → quote/chart/flows/news/financials, loading/empty/error/stale
- 완료: 데스크톱·모바일·키보드 흐름과 기준 시각/출처 노출
- 선행: PLAN-001, DATA-001

### DATA-002 — 시세 freshness·read model

- 연결: PRD-005/011, TRD freshness, API quote, DB quotes_current/quote_bars
- 범위: 수집 지연·provider 오류·stale 판정·read model
- 완료: 수집/수신/asOf 차이, 부분 장애, 재시작 복구 테스트
- 선행: DATA-001

### SIG-001 — 신호·이벤트 정본 계약

- 연결: PRD-006/007/011, TRD signal, API signal/event, DB signals/events/revisions
- 범위: strategy key, 상태 전이, evidence snapshot, streamKey/epoch/sequence, schema
- 완료: 방향·상태·신선도 분리, 불변성·역순·정정 테스트
- 선행: PLAN-001

### SIG-002 — 대표 종목 계산·발행 vertical slice

- 연결: PRD-006/007, UF-SIGNAL, WF-SIGNAL, API `/stocks/{ticker}/signals`, DB/outbox
- 범위: 입력 → 계산 → current/event/revision/evidence → REST → stream
- 완료: 발생/발행 시각·version·근거·위험 고지, 저장/outbox 원자성, 대표 fixture 재현
- 선행: DATA-002, SIG-001

### AUTH-001 — 회원·간편로그인·세션

- 연결: PRD-001, UF-AUTH, API auth, DB users/identities
- 범위: provider adapter, 동의, session rotation/revoke, return URL
- 완료: 성공·취소·실패·동의 거절·만료·로그아웃·CSRF/Origin 테스트
- 선행: PLAN-001

### USER-001 — 관심종목 vertical slice

- 연결: PRD-009, UF-WATCHLIST, WF-WATCHLIST, API `/watchlists`, DB watchlists/items
- 범위: 상세 → 추가 → 목록 재방문 → 삭제, idempotency·ownership
- 완료: 중복·타인 ID·저장 실패·모바일·empty 테스트
- 선행: AUTH-001, SLICE-001

### ENT-001 — entitlement·권한 matrix

- 연결: PRD-006/010/011, TRD revoke, API permission, DB entitlements
- 범위: PUBLIC/MEMBER/REALTIME_SIGNAL, field/filter/sort/aggregation/topic 권한
- 완료: API·stream·cache·buffer 우회 차단, 타인/만료/disabled 테스트
- 선행: AUTH-001, SIG-001

### SLICE-002 — 잠금→구독→신호 vertical slice

- 연결: PRD-006/007/010, UF-SUBSCRIPTION, WF-GATE, API subscriptions/entitlements, DB subscriptions
- 범위: 잠금 미리보기 → checkout sandbox → pending → 활성 → 실제 신호 복귀
- 완료: payment success와 entitlement 활성 분리, 새로고침/다중 탭/중복 결제 테스트
- 선행: SIG-002, AUTH-001, ENT-001

### STREAM-001 — snapshot/replay/resync vertical slice

- 연결: PRD-005/006/011, UF-REALTIME, TRD cursor, API stream, DB outbox/checkpoint
- 범위: subscribe cursor, gap, replay, epoch, stale, reconnect, revoke
- 완료: replay 만료 시 full snapshot, 열린 연결 premium payload 차단, 지연 측정
- 선행: SIG-002, ENT-001

### SUB-001 — 결제 생명주기·웹훅

- 연결: PRD-010, UF-SUBSCRIPTION, API webhook, DB payment/subscriptions/entitlements, Gate D
- 범위: 서명·idempotency·pending·active·cancel·refund·failed·expired·대사
- 완료: 중복·역순·권위 재조회·권한 회수·runbook 테스트
- 선행: SLICE-002, provider 결정

### SCREEN-001 — 구조화 조건 스크리너

- 연결: PRD-008, IA screener, API screener, DB/read model
- 범위: 승인된 조건 메타데이터·query·결과 기준 시각·비용 제한
- 완료: 조건 오류·빈 결과·stale·rate limit, 자연어/저장 필터 미노출
- 선행: SLICE-001, 데이터 지표 승인

### OPS-001 — 관측성·운영·복구

- 연결: TRD observability, Security incident, Gate F
- 범위: 지연·오류·연결·replay·revoke·결제 대시보드/알람, runbook, rollback
- 완료: 장애 주입과 복구 리허설, RPO/RTO·담당자·고객지원 흐름
- 선행: DATA-002, SIG-002, STREAM-001, SUB-001

### SEC-001 — 보안·개인정보·법무 릴리즈

- 연결: PRD-001/006/007/010/011, Security, Gate E
- 범위: ASVS/API review, IDOR, CSRF/Origin, secret/log, 보존·삭제, 표현·라이선스
- 완료: 차단 이슈 0 또는 승인된 잔여 위험. 법무·라이선스·보존 증빙 첨부
- 선행: ENT-001, SUB-001, OPS-001

### OPS-002 — Vercel + Supabase staging 배포

- 연결: `14-deployment-plan`, TRD 배포·운영, DB staging 연결, Gate F
- 범위: Vercel route handler, Supabase migration/RLS, Realtime 또는 SSE adapter, persistence, health/readiness, rollback
- 완료: `healthz`/`readyz`, 대표 market/stock route, migration·RLS invariant, secret scan, 로그 마스킹, reconnect/resync, staging rollback 증거
- 차단: 현재 fixture provider·demo auth·sandbox payment를 production으로 승격하지 않음. Cloudflare Pages `market-dashboard`와 기존 Neon 프로젝트는 대상에서 제외
- 선행: DATA-002, AUTH-001, OPS-001의 sandbox 증거, Supabase project provisioning과 Realtime/SSE 결정

### DATA-003 — Supabase snapshot persistence + RLS vertical slice

- 연결: `09-database-design`, `10-security-privacy-compliance`, `14-deployment-plan`, DATA-002, Gate F
- 범위: Supabase staging migration, `sandbox_snapshots` persistence adapter, service-role-only access, save/load/restart evidence
- 완료: migration idempotency, snapshot save/load, missing-row no-fabrication, browser role denial, secret scan
- 차단: Supabase project/region과 server-only secret 승인 전 실제 DB 적용 금지
- 상태: adapter·RLS migration·unit tests 구현, 실제 Supabase staging 미생성

### API-003 — Vercel serverless REST compatibility vertical slice

- 연결: `08-api-data-contract`, `14-deployment-plan`, SLICE-001, DATA-003, Gate F
- 범위: 기존 Node request handler를 Vercel catch-all function으로 연결하고 health/readiness, market, stock, auth/permission REST 계약을 유지
- 완료: Node listener 미기동, request/trace ID, origin/rate limit, representative API contract, cold-start smoke test
- 선행: PLAN-001, DATA-003의 adapter 계약
- 상태: catch-all handler와 health test 구현, 실제 Vercel preview 미검증

### STREAM-002 — Vercel/Supabase realtime compatibility

- 연결: `08-api-data-contract` stream section, SIG-001, OPS-002, Gate F
- 범위: 기존 `streamKey/epoch/sequence`, cursor, replay/resync, entitlement revoke를 Vercel/Supabase stream path에 연결. Vercel 실행시간 한도와 reconnect 정책을 명시
- 완료: 중복·역순·gap·재연결·권한 회수·stale 상태 테스트 및 브라우저 E2E 증거
- 선행: API-003, DATA-003, SIG-001
- 상태: DEC-022에 따라 staging SSE compatibility path와 로컬 reconnect/replay/resync·cursor·entitlement revoke 테스트를 구현했다. 실제 Vercel 실행시간·동시성·multi-instance stream은 staging project 인증 후 검증해야 하며, 장기 Supabase Realtime/stream host 전환은 미결정이다.

### OPS-003 — Vercel + Supabase staging release

- 연결: `14-deployment-plan`, OPS-002, DATA-003, API-003, STREAM-002, Gate F
- 범위: Vercel project 연결, Supabase secret/RLS/migration, preview/staging 배포, rollback·observability·persistence 검증
- 완료: staging URL의 health/API/UI/auth/watchlist/stream, Neon/Cloudflare 잔여 리소스 비변경, secret rotation runbook
- 선행: DATA-003, API-003, STREAM-002, Vercel/Supabase account authentication
- 상태: 계정 인증·Supabase project provisioning blocker

### QA-001 — P0 전체 회귀·접근성

- 연결: PRD-001~011, 모든 flow/화면, Gate F
- 범위: E2E, contract, event integrity, responsive, keyboard/screen reader, 장애 상태
- 완료: P0 추적표 전체 통과, 미해결 severity 기준 승인
- 선행: SLICE-001, USER-001, SLICE-002, STREAM-001, SCREEN-001

## 3. 의존성

```text
PLAN-001
  ├─ DATA-001 → DATA-002 → SLICE-001
  ├─ SIG-001 → SIG-002 ─┐
  └─ AUTH-001 → ENT-001 ├→ SLICE-002 → SUB-001
                         └→ STREAM-001
SLICE-001 + AUTH-001 → USER-001
DATA/SIG/AUTH/ENT/STREAM/SUB → OPS-001 → SEC-001 → QA-001
```

## 4. 공통 완료 기준

- 정본 문서와 구현 계약 일치
- API·DB·UI·테스트를 티켓에서 추적 가능
- 기준 시각·출처·stale·오류·권한 상태 노출
- 모바일·키보드·스크린리더 핵심 작업 검증
- 중복·역순·gap·replay 만료·revoke·웹훅 역순 검증
- 보안·법무·공급자·운영 블로커가 해결 또는 명시적으로 승인
