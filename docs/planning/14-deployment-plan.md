# 14. 배포 계획 — Vercel + Supabase staging

## 상태

- **이전 staging:** Neon `stock-research` 프로젝트는 삭제 처리했고 로컬 connection string도 삭제했다. Neon control-plane 복구 유예 기간은 2026-09-26까지다.
- **보존 범위:** 기존 Neon `shiftnote-poc`·`sujibgi` 프로젝트는 변경하지 않았다.
- **Cloudflare 시도:** Container는 Workers Paid가 필요해 중단했으며, 실패한 `stock-research` Worker도 삭제했다. 현재 활성 staging URL은 없다.
- **다음 방향:** Vercel + Supabase 전환을 사용자 방향으로 채택한다. 초기 REST handler·snapshot adapter·RLS migration은 구현했으며, 실제 project/Realtime provisioning과 staging 검증은 승인·인증 후 진행한다.
- **환경:** production이 아닌 fixture 기반 검증용 staging/sandbox
- **현재 실행 상태:** Vercel CLI 로그인 완료. Supabase `tapnpazwxxatnmswanib`(ap-northeast-2)에 migration 001–003 적용 완료. 직접 `db.*` 연결은 IPv6-only라 Supavisor pooler(`aws-0-ap-northeast-2.pooler.supabase.com:5432`, user `postgres.<ref>`)를 `SUPABASE_DATABASE_URL`로 사용한다. `https://stock-liard-one.vercel.app`에 배포했고 `/healthz`·`/readyz`·REST·SSE 계약을 검증했다. Supabase CLI는 현재 WSL의 `linux-x64` 바이너리 패키지를 제공하지 않아 migration은 `postgres` 드라이버 경로를 유지한다.
- **주의:** 순수 `api/` 함수에서 `[...path]` catch-all은 단일 세그먼트만 매칭된다(Next.js 전용 동작). `vercel.json`이 `/api/(.*)`와 probe 경로를 `/api/handler`로 rewrite하고, 함수는 원래 request path를 그대로 받는다.

## 검증 증거 (2026-09-19 staging)

- `NODE_ENV=development`(sandbox 모드)를 Vercel env로 주입해 demo session/checkout/webhook/entitlement 흐름을 배포 환경에서 검증했다.
- SSE 라이브 tick: stream handler가 `res` close까지 pending해야 함수 인스턴스가 깨어나 `setInterval` tick이 동작한다. snapshot 복원이 `store.outbox`를 교체하던 버그(워커가 stale queue를 폴링해 publish가 영구 정지)를 수정했다. 복원된 PENDING backlog는 연결된 클라이언트로 drain되며 checkpoint는 publish 순서로 전진한다.
- 세션은 sandbox snapshot에 포함하지 않으므로 cold start·인스턴스 전환마다 재로그인이 필요하다. `signal.changed`는 인스턴스 간 shared-state 없이 각 인스턴스의 복원 상태에서만 나온다 — staging 전용 한계이며, production 스트림은 Supabase Realtime 직접 구독 결정과 함께 재검토한다.
- snapshot은 단일 row last-writer-wins라 다중 인스턴스 동시 mutate 시 상태가 덮일 수 있다. 데모 검증용으로 허용하며 production read/write 경로는 실제 domain schema로 대체한다.
- `/internal/metrics`는 `INTERNAL_METRICS_TOKEN`(Vercel env, `.env.local` 동일 값)으로 접근하며 미인증은 401이다.

## 목표 아키텍처

```text
Browser
  ↓
Vercel UI + serverless route handlers
  ├─ REST/API contract adapter
  └─ auth/permission boundary
        ↓
Supabase PostgreSQL + RLS
        ↓
Supabase Realtime (stream event source)
```

현재 앱은 `node:http`와 SSE를 사용하는 서버 런타임이다. Vercel에는 이 서버를 그대로 올리지 않고 route handler로 REST 계약을 보존해야 한다. 실시간 계약은 Supabase Realtime을 직접 소비할지, 기존 SSE 형식으로 변환하는 adapter를 둘지 결정해야 한다. `streamKey/epoch/sequence`, cursor, replay/resync, freshness, 권한 회수 계약은 배포 플랫폼 변경으로 완화하지 않는다.

## 포함 범위

- Supabase staging 프로젝트와 PostgreSQL migration 적용
- 기존 domain schema 및 snapshot 검증을 Supabase 환경에서 재현
- Vercel route handler에서 대표 REST API와 health/readiness 제공
- Supabase RLS와 서버 전용 service key 경계 검증
- Realtime 이벤트 순서·중복·gap·재연결·stale 상태 검증
- fixture provider·demo auth·sandbox payment 경계 표시
- Vercel/Supabase 로그, request/trace ID, 오류·지연 관찰

## 비범위 및 출시 차단

- 실제 시세 provider, 운영 인증, 결제 provider, 법무 문구, 프리미엄 신호 공개
- production entitlement/결제 데이터를 fixture snapshot으로 저장하는 것
- Supabase service-role key를 브라우저에 전달하는 것
- 기존 Cloudflare `market-dashboard`와 Neon `shiftnote-poc`·`sujibgi` 변경
- 현재 Node HTTP 서버를 Vercel에 무변경 배포한다고 주장하는 것

## 실행 순서

1. `npm run security`, `npm run check`, `npm test` 실행
2. Supabase project/region과 staging secret 경계 승인
3. PostgreSQL migration 및 RLS 적용·invariant 확인
4. Vercel route handler와 기존 REST/permission/freshness 계약 연결
5. staging 1차는 SSE compatibility adapter를 구현하고, Vercel 실행시간·동시성 한계를 검증한다. 장기 multi-instance stream은 Supabase Realtime 직접 구독을 별도 결정한다.
6. Vercel preview/staging 배포 및 환경변수 주입
7. `/healthz`, `/readyz`, 대표 market/stock route, 권한 잠금, stream을 확인
8. DB persistence, reconnect/resync, rollback, secret rotation 증거를 기록

## 수용 기준

- Git working tree clean 및 배포 commit이 `main`에 push됨
- secret scan에서 connection string·service key가 검출되지 않음
- Supabase migration 재실행이 안전하거나 이미 적용됨
- `/readyz`가 sandbox/provider limitation을 숨기지 않음
- REST와 stream 계약의 cursor·순서·freshness·권한 게이트가 유지됨
- production으로 오인할 수 있는 프리미엄 신호·결제·실제 데이터가 노출되지 않음

## 미결정

- Supabase project/region과 무료·유료 사용 한도
- staging SSE compatibility는 pending handler + outbox 복원 수정으로 동작 검증됨(2026-09-19). stream 장기 유지 상한과 production stream host/Realtime 전환 여부는 미결정
- Vercel 함수 runtime과 최대 실행/stream 시간, reconnect 정책
- Supabase Auth 도입 시점과 demo auth의 교체 범위
- RLS 정책, server-only secret, backup/PITR, RPO/RTO
- 실제 provider·auth·payment·법무 승인
