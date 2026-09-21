# 03. Information Architecture

## 문서 상태

이 문서는 정본 URL·라벨·권한 정보 구조다. 구현은 이 경로를 기준으로 하며, 기존 `/billing`, `/me/*`, `/supply-demand` 경로는 정본이 아니다.

## 1. IA 원칙

- 조직 구조가 아니라 사용자 작업 기준으로 구성한다.
- 시장 탐색 → 종목 분석 → 잠금 신호 → 구독 → 신호 검증의 흐름을 유지한다.
- 실시간 데이터에는 기준 시각과 상태를 인접 배치한다.
- 권한 잠금은 콘텐츠 위치를 유지하되 방향·근거를 추론할 수 있는 정보도 보호한다.

## 2. 정본 사이트맵

```text
/
├── /market
├── /signals
├── /screener
├── /stocks/:ticker
│   ├── overview
│   ├── chart
│   ├── flows
│   ├── news
│   ├── financials
│   └── signals
├── /insights (Phase 4 / optional in MVP)
├── /watchlist
├── /subscription
├── /account
└── /login
```

주문·계좌·알림·비교·ETF/ETN/펀드 전용 메뉴는 없다. 인사이트는 콘텐츠 승인 후 Phase 4에 노출하며, 성과·AI 점수·자연어·저장 필터는 MVP 메뉴로 노출하지 않는다.

## 3. API와 화면 경로 매핑

| 화면 | API 정본 | 권한 |
|---|---|---|
| 시장 | `GET /api/v1/market/overview` | 공개/회원 |
| 종목 | `GET /api/v1/stocks/{ticker}` | 공개/회원 |
| 수급 | `GET /api/v1/stocks/{ticker}/flows` | 회원 |
| 신호 | `GET /api/v1/stocks/{ticker}/signals` | 구독 |
| 신호 목록 | `GET /api/v1/signals` | 잠금 미리보기/구독 |
| 관심목록 | `GET/POST/DELETE /api/v1/watchlists` | 회원 |
| 구독 | `/api/v1/subscriptions/*` | 로그인 |

## 4. 전역 내비게이션

### 4.0 승인된 전면 리디자인 — `SIGNALLAB RESEARCH DESK V2`

전역 route와 API는 유지하되, 화면은 사용자의 작업 순서에 맞춰 새로 구성한다.

- 시장: `세션 상태 → Market Pulse → breadth → Movers → 탐색 행동`
- 종목: `Stock Identity → Quote Lead → Chart/Table → Evidence Panels → 신호 권한`
- freshness/source는 공통 상태 레일에서 요약하고 상세 정보는 확장 설명으로 제공한다.
- 개발용 sandbox·역할 전환 컨트롤은 제품 chrome에서 제거하거나 개발 모드로 격리한다.
- 실제 Premium signal은 권한 없는 응답·필터·정렬·집계·캐시에 방향을 남기지 않는다.

상세 wireframe은 `05-wireframe-spec.md`, visual token과 상태는 `06-design-plan.md` 및 `06-design-spec.md`를 따른다.

### 데스크톱

좌측에는 시장·시그널·스크리너·관심종목의 작업 내비게이션을 둔다. 상단에는 제품 검색, 장 상태, 데이터 freshness, 계정 메뉴만 배치한다. 본문은 12열 그리드에서 시장 요약과 주요 종목을 우선 배치하고, 보조 설명은 오른쪽 또는 아래로 이동한다.

### 모바일

상단에는 브랜드·검색·연결 상태만 남기고, 주요 목적지는 하단 탭으로 제공한다. 시장 테이프는 내부 가로 스크롤만 허용한다. 종목 상세는 식별·현재가·차트·근거 순서의 단일 열로 바꾸며, 작은 화면에서 데스크톱 카드 구조를 축소하지 않는다.

기존 URL과 API 정본은 변경하지 않는다. 이번 리디자인은 탐색 노출 방식, 콘텐츠 우선순위, 화면 구조만 교체한다.

## 5. 권한 라벨

- `로그인 필요`: 사용자 계정이 있어야 하는 기능
- `구독 필요`: 활성 `REALTIME_SIGNAL` entitlement가 필요한 기능
- `잠금 미리보기`: 실제 신호 방향을 공개하지 않는 설명용 상태
- `결제 처리중`: 결제 제공자 확인 전 권한이 확정되지 않은 상태
- `접근 만료`: 현재 화면의 실제 데이터 권한이 회수된 상태

## 6. 콘텐츠 모델

종목, 시세 스냅샷, 시계열, 신호 현재값, 신호 이벤트/평가 revision, 증거, 뉴스, 재무, 구독/entitlement, 관심목록을 별도 콘텐츠로 취급한다. 방향·근거·버전·정확한 발생 시각은 활성 구독 권한 없이는 응답·필터·정렬·집계·캐시에 포함하지 않는다.

## 7. P0 탐색 경로

1. 시장 → 검색 → 종목 상세 → 관심 추가 → 재방문 → 삭제
2. 종목 상세 → 잠금 신호 → 구독 → 결제 처리중 → 권한 활성 → 신호 복귀
3. 구독자 → 실시간 시그널 → stale → 재연결 → gap resync
4. 스크리너 → 조건 선택 → 결과 기준 시각 → 종목 상세
5. 로그인 만료/권한 만료 → 안내 → 재인증/구독 → 원래 작업 복귀

## 8. 미결정

- 제품명·최종 브랜드 라벨
- 우선주·스팩·리츠의 security type 범위
- 인사이트 콘텐츠 운영 모델
- 모바일 하단 탭 사용성 테스트 결과
