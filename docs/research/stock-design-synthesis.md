# Stock 디자인 리서치 종합안

- **작성일:** 2026-09-19 KST
- **근거:** `docs/research/stock-ux-korean.md`, `stock-ux-global.md`, `stock-ux-visual-gap.md`, 기존 planning 문서와 현재 public UI
- **상태:** 제안안. 코드 구현 전 사용자 승인 필요.
- **제품 경계:** 국내 개별주식 리서치만 포함. 주문·계좌·ETF/ETN/펀드·해외주식·외부 알림·실제 Premium 신호의 방향/강도/근거/이력은 이번 재설계 범위에서 제외.

## 1. 확인된 사실·가정·제안

### 확인된 사실

- 현재 UI는 freshness, source, 기준 시각, 권한 상태 같은 계약 표현은 비교적 잘 갖추고 있다.
- 시장 화면은 지수 카드·metric 카드·검색 카드·표가 동일한 표면으로 반복되어 시장 판단의 초점이 약하다.
- 종목 상세는 quote·차트·수급·뉴스·재무를 포함하지만, 시각적 위계가 약하고 카드형 조각으로 보인다.
- AOI Alpha는 큰 타이포그래피, 명확한 브랜드 장면, 시장 ticker, CTA, 리서치 서사를 사용한다.
- 글로벌 리서치 제품은 시장 변화 → 차트/표 → 뉴스·공시·분석 근거로 이어지는 연결성이 강하다.
- 모바일은 데스크톱을 단순 축소하지 않고 핵심 수치·접힘·세로 흐름으로 재구성한다.
- 현재 CSS에는 초기 토큰과 MARKET TAPE 토큰이 중복되고, 중간 폭에서 내비게이션 부담이 남아 있다.

### 가정

- 사용자는 첫 화면에서 “오늘 시장이 어떤가”와 “어떤 종목을 더 읽을까”를 먼저 해결한다.
- `지수 + 시장 폭 + 거래대금/수급 + movers`가 단순 지수 카드 나열보다 상세 진입을 돕는다.
- 값 옆에 기준 시각·수신 시각·출처를 두면 최신값 오해가 줄어든다.
- 모바일에서는 표 전체를 축소하기보다 핵심 수치와 상세 확장이 효율적이다.

### 제안

- 상태 안내는 얇은 `Freshness Rail`로 압축하고, 시장과 종목의 핵심 판단을 크게 만든다.
- 시장판은 `Market Pulse → Movers → Flow/Table` 구조로 재구성한다.
- 종목 상세는 `Stock Identity → Quote Lead → ChartWithTable → Evidence Panels` 순서로 재구성한다.
- 잠금은 방향·강도·근거를 추론하게 하는 시각 요소를 사용하지 않고, 접근 범위만 설명한다.
- 주문·계좌·ETF/ETN/펀드 CTA와 route는 공개 탐색에서 제거한다.

## 2. Visual direction 후보

| 후보 | 핵심 | 장점 | 위험 |
|---|---|---|---|
| **A. Evidence Tape / 근거 우선 리서치 데스크** (추천) | paper canvas, ink chrome, rule line, quote lead, evidence panel | 현재 계약을 보존하면서 generic dashboard를 탈피하고, AOI 복제 위험이 낮음 | 잘못 구현하면 plain table dashboard가 될 수 있음 |
| B. Market Ledger / 시장 장부 | 표·수치·정렬·기준 시각 중심의 기관형 화면 | 비교·검증에 강하고 구현 안정성이 높음 | 브로커 HTS처럼 보일 위험 |
| C. Quiet Dossier / 조용한 분석 문서 | 종목 상세를 분석 dossier처럼 구성 | 근거와 리서치 설명에 강함 | 시장판의 즉시성과 탐색성이 약해질 수 있음 |

### 추천 방향

**A를 기본으로 채택하고 C의 `Quote Lead + Dossier` 위계를 차용한다.** AOI에서 가져올 것은 hero 이미지나 glass panel이 아니라 `맥락 → 수치 → 해석 → 다음 읽기` 순서다. Bloomberg의 외형이나 TradingView의 터미널 클리셰를 복제하지 않는다.

## 3. 브랜드·시각 원칙

### 이름

**EVIDENCE TAPE / 근거 우선 리서치 데스크**

### 핵심 원칙

1. **값 옆에 상태:** 실시간/지연/오래된 데이터, 기준 시각, 수신 시각, 출처를 인접 배치한다.
2. **한 화면 한 초점:** 시장 first fold는 Market Pulse와 Movers, 상세 first fold는 Quote Lead와 가격 흐름이 주인공이다.
3. **그래프는 근거:** 기간·단위·최저·최고·변화량·기준 시각·동일 데이터 표를 제공한다.
4. **잠금은 암시하지 않는다:** 실제 Premium 신호를 blur, 색상, 화살표, 순위, 차트 marker로 유추시키지 않는다.
5. **읽기 행동만 촉진:** `종목 보기`, `관심종목에 추가`, `출처 보기`, `차트 데이터 표 보기`를 중심 CTA로 한다.
6. **시장 방향은 의미를 병기:** 한국 시장 상승 빨강·하락 파랑은 라벨·기호·수치와 함께 사용한다.
7. **카드 soup 금지:** 모든 정보를 둥근 카드로 감싸지 않고, 섹션 제목·rule line·배경 톤·공간으로 위계를 만든다.

### 타이포그래피

| 역할 | 규격 |
|---|---:|
| 본문 | Pretendard, Noto Sans KR, system sans |
| 숫자/코드/시간 | IBM Plex Mono 또는 SFMono-Regular, Consolas |
| Display | 32/40, 800 |
| H1 | 28/36, 800 |
| H2 | 20/28, 700 |
| Body | 16/24 |
| Label | 14/20, 700 |
| Caption | 12/18 |
| Quote desktop | 40/44, 800 |
| Quote mobile | 30/36, 800 |

가격·등락·거래량은 `tabular-nums lining-nums`를 사용한다. 큰 제목은 짧고 단단하게, 데이터 숫자는 모노스페이스로 분리한다.

### 색상 역할

- Canvas: `#F5F1E8`
- Raised: `#FFFCF6`
- Subtle: `#E7E0D4`
- Chrome ink: `#112331`
- Chrome rail: `#203848`
- Primary text: `#152536`
- Secondary text: `#425466`
- Primary action: `#0B4F71`
- Live: `#006B70`
- 상승: `#B42318`
- 하락: `#245DA8`
- Warning: `#8A4B00`
- Error: `#B42318`
- Focus: `#0B6E99`

gradient, glassmorphism, neon glow, 금색 premium tint, 장식용 금융도시 hero는 사용하지 않는다. 데이터 그래픽과 타이포그래피가 브랜드 자산이 된다.

### 레이아웃·밀도

- Desktop 최대 폭 `1440px`, 12열, gutter `16px`
- 1024px: 8열, 좌우 padding `24~32px`
- Mobile: 1열, 좌우 padding `16px`
- Command bar `64px`, mobile `56px`
- Market tape `36~40px`, mobile `32px`
- Panel padding desktop `20px`, mobile `16px`
- Panel radius `8px`, control radius `6px`, 기본 shadow 없음
- 간격 `4, 8, 12, 16, 24, 32, 48, 64px`
- Desktop 데이터 밀도 7/10, mobile 5/10
- 데이터 표 행 최소 44px, mobile stock row 60px

### 그래픽 언어

- 자동 marquee가 아닌 정적 market tape
- live에만 4px teal marker
- 시장 폭은 0 기준 양방향 bar
- sparkline은 desktop `112×28px`, mobile `88×24px`
- chart line `2px`, grid `1px`
- 갱신 시 flash·pulse·자동 확대 금지
- 실제 차트와 표 대안을 장식용 sparkline보다 우선한다.

## 4. 시장판 IA 및 first fold

### Desktop

```text
Command Bar
├── 브랜드
├── 시장
├── 스크리너
├── 관심종목
├── 전역 검색
└── 메뉴/세션

Market Tape
├── 장 상태
├── KOSPI
├── KOSDAQ
├── 거래대금
├── 데이터 상태
└── 기준 시각

시장판
├── 장 세션·Freshness Rail
├── Market Pulse
│   ├── KOSPI
│   ├── KOSDAQ
│   ├── 상승/보합/하락 breadth
│   └── 거래대금·수급
├── Movers
│   ├── 상승
│   ├── 하락
│   ├── 거래량 상위
│   └── 관심종목
├── 시장 흐름 표
├── 종목 검색·구조화 스크리너
└── 출처·산정 기준·고지
```

1440×900 first fold에는 `command bar → market tape → heading → freshness rail → market pulse → movers 3~5개`가 보여야 한다. 긴 제품 범위 설명·위험 고지는 아래로 내린다.

### Mobile

```text
시장
├── 장 상태·기준 시각
├── KOSPI/KOSDAQ
├── 시장 폭
├── 거래대금·수급
├── Movers 행 카드
├── 종목 검색
└── 출처·상태 상세
```

390×844에서는 상단 바, tape, 제목, freshness, KOSPI/KOSDAQ, breadth/거래대금, movers 3개 이상, 하단 nav를 우선한다. 검색은 상단 진입으로 제공하고 별도 검색 카드는 first fold에서 제거한다.

## 5. 종목 상세 IA 및 first fold

### Desktop

```text
Stock Identity
├── 종목명·종목코드
├── 거래소·보안 유형·거래 상태
└── 관심종목 추가/저장됨

Freshness Rail
├── 상태·기준 시각·수신 시각·출처

Quote Lead
├── 현재가·상승/하락/보합
├── 거래량
└── 장중 범위·기본 사실

Section Index
├── 가격
├── 수급
├── 뉴스
└── 재무

Evidence
├── ChartWithTable
├── 기본 종목 사실
├── 수급
├── 뉴스·공시
└── 재무

하단
├── 출처·산정 기준
└── 위험 고지
```

first fold에는 종목 식별·관심 상태, 가격·등락·거래량, 기준 시각·수신 시각·출처, 가격 차트, 차트 표 진입, 기본 사실을 둔다. 실제 Premium signal의 방향·강도·근거·이력은 DOM에도 포함하지 않는다.

모바일에서는 sticky horizontal detail tab 대신 세로 section index 또는 2×2 anchor를 사용한다. Quote와 chart를 항상 먼저 보여주고 수급·재무는 접힘으로 구성한다.

## 6. Flow 및 상태 모델

### 핵심 flow

1. 시장 → 검색/mover → 종목 상세
2. 종목 상세 → 차트 → 표 → 수급/뉴스/재무 → 출처
3. 종목 상세 → 관심목록 추가 → 재방문 → 삭제
4. 구조화 스크리너 → 결과 → 종목 상세
5. 세션 만료 → 로그인 → 원래 route/section 복귀
6. 주문·계좌·ETF·실제 Premium signal 진입 → 범위 제외 안내 → 시장 복귀

### 상태 축

| 축 | 상태 |
|---|---|
| 인증 | `GUEST`, `MEMBER`, `SESSION_EXPIRED` |
| 데이터 | `LOADING`, `REALTIME`, `DELAYED`, `STALE`, `UNAVAILABLE`, `ERROR` |
| 연결 | `IDLE`, `CONNECTED`, `RECONNECTING`, `RESYNCING` |
| 작업 | `SAVING`, `SAVED`, `DUPLICATE`, `DELETING`, `DELETED`, `ERROR` |
| 권한/범위 | `PUBLIC`, `AUTH_REQUIRED`, `NOT_IN_SCOPE`, `REVOKED` |

상태 축을 단일 status·색상·아이콘으로 합치지 않는다.

### 권한·신선도

- 방문자: 공개 시장·검색·허용된 시세/차트
- 무료 회원: 관심목록·허용된 수급/뉴스/재무
- 실제 Premium signal: 이번 디자인에서는 어떤 권한에도 공개하지 않음
- 주문·계좌·ETF/ETN/펀드: `NOT_IN_SCOPE`
- 데이터 표현은 `dataStatus`, `asOf`, `receivedAt`, `staleAfter`, `source`를 유지한다.
- `STALE`은 마지막 확인값임을 명확히 하고 최신값처럼 강조하지 않는다.
- 부분 장애에서는 성공한 섹션을 유지하고 실패 섹션만 재시도한다.

## 7. 컴포넌트 inventory

`DeskShell`, `TopCommandBar`, `MarketTape`, `BottomNav`, `PageHeading`, `FreshnessRail`, `MarketPulse`, `BreadthBar`, `MoverList`, `StockSearch`, `StructuredScreener`, `StockRow`, `QuoteLead`, `PriceMetric`, `StockSectionIndex`, `ChartWithTable`, `StockFactsPanel`, `FlowPanel`, `NewsList`, `FinancialTable`, `WatchlistAction`, `ResearchAccessNotice`, `ScopeNotice`, `RiskDisclosure`, `SourceLine`, `LoadingSkeleton`, `EmptyState`, `InlineError`, `ConfirmSheet`, `LiveRegion`.

각 데이터 컴포넌트는 `default`, `loading`, `empty`, `error`, `stale`, `unavailable`, `degraded`, `selected`, `keyboard-focus` 상태를 가진다. 실제 Premium signal 카드·표·stream UI는 이번 공개 UI에서 제거한다.

## 8. 접근성·반응형 수용 기준

- 일반 텍스트 4.5:1, 큰 텍스트 3:1, UI 경계·focus·차트 3:1 이상
- focus ring 3px, 터치 타깃 44×44px
- 320px 일반 본문 가로 스크롤 없음; 수평 스크롤은 명시된 tape/table 내부만 허용
- 200% 확대에서 겹침·잘림·focus 가림 없음
- 표 `caption`, `thead`, `tbody`, `th scope` 제공
- 차트 기간·단위·시작/종료·최저/최고·변화량과 대체 표 제공
- 오류는 alert, 로딩·연결·저장은 polite status/live region 사용
- 실시간 알림은 최대 5초에 1회로 병합
- reduced motion에서는 skeleton 이동·smooth scroll·flash 제거
- 760~1180px에서도 내비게이션을 숨기지 않음

## 9. 구현 순서 및 검증

1. 범위·route·API·payload 차단 목록 확정
2. 중복 CSS token을 semantic token 하나로 통합
3. command bar·market tape·responsive shell
4. Market Pulse·breadth·movers first fold
5. Stock Identity·Freshness Rail·Quote Lead
6. ChartWithTable·수급·뉴스·재무 evidence panel
7. loading/empty/error/stale/permission 상태
8. 키보드·스크린리더·320px·200%·reduced motion 검증
9. screenshot comparison 및 사용성 테스트

### 완료 기준

- 1440×900 시장 first fold에 장 상태, freshness, KOSPI/KOSDAQ, breadth, 거래대금/수급, movers 3~5개가 보인다.
- 390×844 시장 first fold에 장 상태, 기준 시각, KOSPI/KOSDAQ, breadth, movers 3개가 보인다.
- 종목 상세 first fold에 식별·관심 상태·quote·시각·출처·차트·표 진입이 보인다.
- 국내 개별주식 외 결과와 주문·계좌·ETF/ETN/펀드 CTA가 없다.
- 실제 Premium signal 방향·강도·근거·이력이 payload·cache·DOM에 없다.
- 키보드로 검색→상세→저장/삭제→재시도를 완료할 수 있다.
- axe critical/serious 오류 0건이며, screen reader가 heading·landmark·table·chart·상태를 이해한다.

## 미해결 결정

- 실제 시세 공급자·재배포권·SLA·staleAfter
- 지원 보안 유형과 우선주/스팩/리츠 범위
- 향후 Premium signal 공개 시점과 법무 문구
- 인증·회원용 수급/재무 필드 공개 범위

이 문서는 디자인 방향 제안이며, 사용자 승인 전 코드를 변경하지 않는다.
