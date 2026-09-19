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

### 4.0 리서치 기반 우선순위 제안 — `EVIDENCE TAPE` (승인 대기)

전역 구조의 명칭과 API route는 유지하되, 시장판과 종목 상세의 콘텐츠 순서를 작업 중심으로 재배치한다.

- 시장: `Market Pulse → Movers → Flow/Table → 검색/스크리너`
- 종목: `Stock Identity → Quote Lead → ChartWithTable → 수급/뉴스/재무 → 근거/고지`
- freshness/source는 모든 카드에 반복하지 않고 공통 `Freshness Rail`에서 먼저 요약한다.
- 주문·계좌·ETF/ETN/펀드 메뉴는 만들지 않는다.
- 실제 Premium signal은 권한 없는 응답·필터·정렬·집계·캐시에 방향을 남기지 않는다.

상세 wireframe은 `05-wireframe-spec.md`, visual token과 상태는 `06-design-spec.md`, 조사 근거는 `docs/research/stock-design-synthesis.md`를 따른다.

### 데스크톱 — 제안

상단 명령 바에 브랜드/홈, 시장, 실시간 시그널, 스크리너, 관심종목, 구독·계정, 전역 검색을 배치한다. 명령 바 아래에는 현재 장 상태와 KOSPI/KOSDAQ·거래대금·데이터 신선도를 보여주는 `market tape`가 고정된다. 긴 조직형 사이드바는 제거한다.

### 모바일 — 제안

상단에는 브랜드·장 상태·검색을 두고, 하단 탭은 시장·시그널·관심종목·검색/홈으로 유지한다. 시장 테이프는 가로 스크롤 가능한 접근성 있는 목록으로 축약한다. 구독·계정은 메뉴 패널로 제공한다. 종목 상세 하위 탭은 가격 흐름·수급·뉴스·재무·신호를 우선순위에 따라 가로 스크롤하되 현재 위치를 명시한다.

기존 URL과 API 정본은 변경하지 않는다. 이번 제안은 탐색 노출 방식과 콘텐츠 우선순위만 바꾼다.

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
