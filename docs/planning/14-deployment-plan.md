# 14. 배포 계획 — Cloudflare Container + Neon Staging

## 상태

- **승인 범위:** 사용자 승인(2026-09-20)으로 Neon 신규 프로젝트를 생성하고 staging 배포 준비를 진행한다.
- **환경:** production이 아닌 검증용 staging/sandbox
- **실제 프로젝트:** Neon `stock-research`, project ID `flat-surf-27471705`
- **Neon 리전:** AWS Asia Pacific 1 (Singapore)
- **Neon branch/database:** `production` / `neondb`
- **Cloudflare:** 기존 `market-dashboard` Pages 프로젝트는 사용하지 않으며 덮어쓰지 않는다.
- **현재 결과:** Docker image local build는 성공했지만, account가 Workers Free plan이라 Cloudflare Containers API가 `requires the Workers Paid plan`으로 거부했다. 따라서 staging URL/secret injection은 아직 완료로 주장하지 않는다.

## 목표 아키텍처

```text
Browser
  ↓
Cloudflare Worker/Container ingress
  ↓
Node HTTP sandbox runtime
  ↓
Neon PostgreSQL (sandbox snapshot persistence)
```

현재 서버는 `node:http`, 파일 snapshot, 동기식 `DemoStore`, SSE worker를 사용한다. 따라서 현재 코드에 Cloudflare Worker fetch adapter와 domain-level PostgreSQL read/write가 추가되기 전에는 Pages 정적 배포를 production API로 사용하지 않는다. 단기 staging은 Cloudflare Container로 Node runtime을 보존할 수 있지만, Neon snapshot persistence는 sandbox 전용이며 production domain schema의 대체가 아니다.

## 포함 범위

- Neon 프로젝트 생성 및 `001_initial.sql` 적용
- 배포 secret은 로컬 파일·GitHub·브라우저 화면에 노출하지 않고 Cloudflare secret으로 주입
- `healthz`, `readyz`, 대표 시장판·삼성전자 상세 route 확인
- sandbox 상태 복구와 snapshot 오류 관찰
- Cloudflare 로그와 request/trace ID 확인

## 비범위 및 출시 차단

- 실제 시세 provider, 운영 인증, 결제 provider, 법무 문구, 프리미엄 신호 공개
- production entitlement/세션/결제 데이터를 JSON snapshot 하나로 저장하는 것
- 기존 Cloudflare Pages 프로젝트 변경
- connection string·비밀번호를 Git에 저장하는 것

## 실행 순서

1. 배포 전 `npm run security`, `npm run check`, `npm test` 실행
2. Neon migration 적용·table invariant 확인
3. Node runtime의 Neon snapshot adapter와 staging-only 환경 가드 구현
4. Docker image build와 local health/readiness 검증
5. Cloudflare Container/Worker dry-run
6. Workers Paid plan 및 Containers 사용 승인을 확인한 뒤 Cloudflare secret 주입 후 staging deploy
7. `/healthz`, `/readyz`, `#/market`, `#/stocks/005930`, 권한 잠금, SSE를 확인
8. 실패 시 Cloudflare deployment version을 rollback하고 Neon branch를 보존

## 수용 기준

- Git working tree clean 및 배포 commit이 `main`에 push됨
- secrets scan에서 connection string이 검출되지 않음
- Neon migration 재실행이 안전하거나 이미 적용됨
- staging `/readyz`가 sandbox 모드와 provider limitation을 숨기지 않음
- production으로 오인할 수 있는 프리미엄 신호·결제·실제 데이터가 노출되지 않음

## 미결정

- Cloudflare Workers Paid plan/Containers availability/요금/instance limit 승인
- 실제 production Worker fetch adapter 또는 managed Node host 선택
- domain-level PostgreSQL repository와 transaction boundary
- 실제 provider·auth·payment·법무·RPO/RTO 승인
