# 11. MVP Roadmap

## 1. 원칙

대표 종목 1개를 **로그인 → 권한 확인 → 시세/신호 → 실시간 복구 → 권한 회수**까지 관통하는 수직 슬라이스로 먼저 검증한다. 계층별로 DATA/API/UI를 완성한 뒤 합치는 방식은 MVP 완료로 보지 않는다.

각 단계는 제품 범위·디자인·공급자·법무 결정의 상태를 표시하며, 실제 신호/결제 공개는 해당 게이트 통과 전 금지한다.

## 2. Phase 0 — 범위·계약·디자인 게이트

**현재 상태:** `MARKET TAPE` 전면 리디자인의 시장판·대표 종목 UI 구현과 자동/브라우저 검증을 완료했다. API/이벤트 schema·DB·공급자·법무·결제 정책은 별도 승인 대상이며 출시 blocker로 유지한다.

### 산출물

- PRD/IA/User Flow/Wireframe/Design Plan/Approved Design Specification 승인
- 정본 API·이벤트 schema·DB 논리 모델·권한 matrix
- 신호 상태 전이, cursor/replay, outbox, entitlement revoke 계약
- 구독 가격·자동갱신·환불·결제 provider 정책
- 시세 provider·재배포권·SLA·지원 security type
- 데스크톱/모바일 핵심 화면·상태의 승인 디자인 명세와 프로토타입 경로

### 통과 조건

- `decision-log.md`의 범위·권한·표현·공급자 결정 승인
- P0 요구사항 → 화면 → API/이벤트 → DB → 티켓 → 테스트 추적표 완성
- 실제 데이터와 잠금 미리보기의 공개 범위 승인

## 3. Phase 0.5 — `EVIDENCE TAPE` UI 재디자인

**현재 상태:** 기존 `MARKET TAPE` 구현은 기능 baseline으로 완료했다. 국내·글로벌 주식 UX 및 AOI Alpha 비교 리서치를 반영한 `EVIDENCE TAPE / 근거 우선 리서치 데스크` 재설계는 사용자 승인 대기다.

**진입 조건:** 새 시각 방향·IA·wireframe 승인 완료.

- 승인된 Chainx-inspired dark canvas·ink chrome·display type·tabular figures·간격·그리드 토큰을 구현한다.
- 시장 화면의 Market Pulse/breadth/movers/근거 표를 먼저 세로 슬라이스한다.
- 종목 상세의 Stock Identity/Quote Lead/ChartWithTable/Evidence Panels/상태 rail을 연결한다.
- 모바일 하단 탭, 가로 tape, 320px·200% 확대·키보드·reduced motion을 검증한다.
- 기존 API/권한/freshness 계약과 fixture 기능을 회귀 검증한다.

**통과 조건:** 시장·종목 핵심 화면의 정상/로딩/빈 상태/오류/stale/권한 잠금이 같은 시각 시스템으로 동작하고, 사용자 승인 명세와 스크린샷 비교를 통과한다.

## 4. Phase 1 — 대표 종목 수직 슬라이스

**데모 시나리오:** 비로그인 방문 → 대표 종목 검색 → 상세 진입 → 로그인 → 관심 추가 → 잠금 신호 확인 → sandbox checkout → pending → entitlement 활성 → 실제 신호/근거 조회 → 스트림 끊김 및 gap resync → 해지/만료 → 열린 연결 revoke.

포함 범위:

- 종목 master·quote provider adapter와 freshness
- 대표 종목 quote/chart/flows/news/financials read model
- 기본 전략 하나의 signal current/event/revision/evidence
- auth/session, entitlement mock/sandbox, REST·stream 권한
- snapshot cursor·replay/resync, stale/degraded UI
- watchlist add/list/delete
- outbox·관측성·contract/permission/E2E/accessibility 테스트

## 5. Phase 2 — 시장·검색·스크리너 확장

- 시장 개요와 검색 결과
- 승인된 구조화 조건 메타데이터·실행·결과 기준 시각
- 지원 종목 범위 확대
- 관심목록 모바일/반응형 최적화
- API/DB/stream 용량 측정과 캐시 검증

자연어 스크리너·저장 필터·AI 점수는 별도 승인 없이는 추가하지 않는다.

## 6. Phase 3 — 결제 상용화

- 실제 payment provider 연동
- 웹훅 서명·중복·역순·권위 재조회·대사
- 자동갱신·해지예정·환불·실패·만료 상태
- 열린 스트림 revoke 및 권한 캐시 무효화 측정
- 개인정보·법무·라이선스·고객지원 runbook

## 7. Phase 4 — 인사이트·성과·운영 고도화

- 승인된 인사이트 콘텐츠
- 성과 산정 기준 승인 후 대시보드
- 운영자 데이터 품질·알고리즘·공급자 모니터링
- 고객 인터뷰와 전환/오류 지표 개선

## 8. 의존성 DAG

```text
범위·법무·공급자 결정
  → 정본 API/event/DB/권한 계약
  → 디자인 게이트
  → 대표 vertical slice (data + backend + web + test)
  → 시장/스크리너 확장
  → 결제 상용화·실제 신호 공개
  → 인사이트/성과 후속
```

## 9. 릴리즈 게이트

- Gate A: 제품 범위·디자인·접근성 기준 승인 완료
- Gate B: 대표 종목 데이터·신호·evidence·freshness 계약 검증
- Gate C: auth/ownership/entitlement와 열린 연결 revoke 검증
- Gate D: 결제 sandbox/실결제·웹훅 대사·환불 정책 검증
- Gate E: 법무·라이선스·개인정보·보안 검토 승인
- Gate F: 관측성·장애 주입·복구·롤백·고객지원 준비

## 10. 일정 산정 입력

캘린더 일정은 다음이 정해진 뒤 산정한다: 담당자/가용 인력, provider sandbox 접근일, 법무 검토 리드타임, 지원 종목 수, 이벤트 빈도·동시 연결, 테스트 데이터, 운영시간, 보안·접근성 검증 범위. 입력 없이 단계만으로 출시일을 약속하지 않는다.

## 11. 완료 정의

- 요구사항·상태·권한·오류 추적표와 자동/수동 테스트 존재
- 최신성·중복·역순·gap·replay 만료·revoke가 검증됨
- 모바일·키보드·스크린리더 핵심 흐름 검증
- 개인정보·결제·비밀키·로그·공급자 라이선스 점검 완료
- RPO/RTO·알람·담당자·runbook·롤백 확인
- 출시 후 지표의 이벤트·분모·대시보드가 존재
