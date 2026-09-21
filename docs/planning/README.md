# Stock Platform Planning Index

국내 개별주식 리서치·실시간 알고리즘 신호 플랫폼의 **정본 기획 문서**다. 기존 화면 감사를 바탕으로 `SIGNALLAB RESEARCH DESK V2` 프리미엄 금융 리서치 터미널 방향을 사용자 승인받아 구현 단계로 진행한다. 구현·디자인·출시 판단은 이 디렉터리의 문서를 기준으로 한다.

## 정본 우선순위

1. `CONTEXT.md`: 도메인 용어와 제품 경계
2. `00-brief.md`: 문제·범위·비목표·결정 게이트
3. `02-prd.md`: 제품 요구사항·MVP·권한·성공 기준
4. `03-information-architecture.md` ~ `06-design-spec.md`: 사용자 경험과 화면 계약
5. `07-trd.md` ~ `10-security-privacy-compliance.md`: 기술·데이터·보안·운영 계약
6. `11-mvp-roadmap.md` ~ `13-tickets.md`: 일정·코딩 규칙·구현 단위
7. `decision-log.md`: 결정 변경의 이력
8. `../research/README.md`: 주식 UX 벤치마크·시각 격차·재설계 종합

상위 `docs/stock-platform-*.md` 문서는 상세 참고자료다. 이 디렉터리와 내용이 충돌하면 planning 문서가 우선이며, 구현 전에 참고자료를 정본과 동기화하거나 비정본임을 유지한다. 동일 기능의 두 API를 별칭으로 동시에 구현하지 않는다.

## 표준 문서

1. [Product Brief](./00-brief.md)
2. [Current State & Research](./01-current-state.md)
3. [PRD](./02-prd.md)
4. [Information Architecture](./03-information-architecture.md)
5. [User Flow](./04-user-flow.md)
6. [Wireframe Specification](./05-wireframe-spec.md)
7. [Design Plan](./06-design-plan.md)
8. [Approved Design Specification](./06-design-spec.md) — 구현용 토큰·컴포넌트·상태 계약
9. [TRD](./07-trd.md)
10. [API & Data Contract](./08-api-data-contract.md)
11. [Database Design](./09-database-design.md)
12. [Security, Privacy & Compliance](./10-security-privacy-compliance.md)
13. [MVP Roadmap](./11-mvp-roadmap.md)
14. [Coding Convention](./12-coding-convention.md)
15. [Implementation Tickets](./13-tickets.md)
16. [Decision Log](./decision-log.md)
17. [Deployment Plan](./14-deployment-plan.md)

## 정본 API 경로

| 기능 | 정본 경로 |
|---|---|
| 시장 | `GET /api/v1/market/overview` |
| 종목 | `GET /api/v1/stocks/{ticker}` |
| 시세 | `GET /api/v1/stocks/{ticker}/quote` |
| 차트 | `GET /api/v1/stocks/{ticker}/chart` |
| 수급 | `GET /api/v1/stocks/{ticker}/flows` |
| 뉴스 | `GET /api/v1/stocks/{ticker}/news` |
| 재무 | `GET /api/v1/stocks/{ticker}/financials` |
| 신호 목록 | `GET /api/v1/signals` |
| 종목 신호·이력 | `GET /api/v1/stocks/{ticker}/signals` |
| 관심목록 조회/추가 | `GET/POST /api/v1/watchlists` |
| 관심목록 삭제 | `DELETE /api/v1/watchlists/{watchlistId}/items/{ticker}` |
| 권한 | `GET /api/v1/entitlements/me` |
| 구독 | `GET /api/v1/subscriptions/me`, `POST /api/v1/subscriptions/checkout`, `POST /api/v1/subscriptions/cancel` |
| 결제 웹훅 | `POST /api/v1/webhooks/payment` |
| sandbox 세션 검증 | `POST /api/v1/auth/demo/session`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` |
| 실시간 | WebSocket 또는 SSE `/api/v1/stream`; replay 검증 `GET /api/v1/stream/replay` |

`/billing/*`, `/me/*`, `/signals/{symbol}/history`, `/supply-demand`는 정본이 아니다. 레거시 호환이 필요하면 별도 deprecation 결정과 동일 권한·응답 계약을 함께 작성한다.

## 정본 신호 모델

- 방향: `BUY`, `SELL`, `NEUTRAL` (법무 승인 전 내부 enum)
- 상태: `ACTIVE`, `SUSPENDED`, `EXPIRED`, `CANCELLED`, `VALIDATING`
- 신선도: `REALTIME`, `DELAYED`, `STALE`, `UNAVAILABLE`
- 이벤트 커서: `(streamKey, epoch, sequence)`
- `eventId`는 멱등성 키, `occurredAt`은 발생 시각, `publishedAt`은 발행 시각이다.
- 신호 변경 이벤트와 내부 평가 revision은 별도 개념이다.

## 핵심 블로커

- 구독 가격·자동갱신·환불·결제대행사
- 간편로그인 제공자
- 실시간 시세 공급자·재배포권·SLA
- 알고리즘 재계산 기준·신호 유효기간·성과 산정
- 우선주·스팩·리츠 포함 범위
- 매수·매도 표현 및 금융 규제·고지 문구

## 변경 규칙

요구사항·상태·API·DB·권한 중 하나를 변경하면 관련 정본 문서와 `decision-log.md`를 같은 변경에서 갱신한다. 구현 티켓에는 변경된 PRD ID, API/이벤트 ID, DB 변경, 테스트 ID를 연결한다.
