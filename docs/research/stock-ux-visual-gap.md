# AOI Alpha와 현 프로젝트의 시장판·종목 상세 시각 격차

## 조사 개요

- **관찰 대상:** [AOI Alpha](https://www.aoialpha.com/)
- **관찰 시점:** 2026-09-19 UTC
- **비교 대상:** `public/index.html`, `public/styles.css`, `public/app.js`, `docs/planning/06-design-plan.md`, `docs/planning/06-design-spec.md`
- **조사 방법:** AOI 공식 페이지를 실제로 요청해 받은 HTML, 공식 CSS/JS 번들, 공개 hero 이미지와 OG 캡처를 확인했다. AOI의 `/market`, `/stocks/:code`는 번들의 `client/src/pages/Market.tsx`, `client/src/pages/Details.tsx` 구조를 근거로 분석했다.
- **해석 주의:** AOI의 수치와 일부 문구는 라이브 번들에 포함된 데모/스냅샷 값이다. 수치의 정확성을 비교한 것이 아니라 정보 배치와 시각 언어를 비교했다.

## 1. 확인된 사실: AOI Alpha

### 1.1 정보 구조

| 표면 | 실제로 확인된 구조 | 시각적 역할 |
|---|---|---|
| 전역 셸 | AOI 로고, 홈, 오늘의 픽, 스크리너, 분석, 시장, 인사이트, 성과, 내 자산. 우측에 검색, 알림, 테마, 로그인, 회원가입 | 금융 앱이면서 리서치 브랜드인 인상을 먼저 만든다. |
| 시장 ticker | 상단 내비게이션 아래 약 32px 높이의 가로 ticker. 장 상태와 코스피, 코스닥, S&P 500, 나스닥, VIX, 원달러, 미 국채를 순환 표시 | 페이지를 열자마자 시장 맥락과 실시간성을 전달한다. |
| `/` 홈 | 614px 이상 hero, 오늘의 실행 플랜 CTA, 조건 스크리너 CTA, 신뢰 근거, 시장 요약 strip, 오늘의 후보 표, 도구 카드, 인사이트/뉴스, 분석 목록 | 제품의 가치 제안과 리서치 결과를 동시에 보여주는 마케팅 겸 대시보드다. |
| `/market` 시장 | `MARKET PULSE` intro, `시장 동향/수급/매크로` 탭, 7개 지수/매크로 metric grid, KOSPI chart, 시장 상태와 시장 폭, 수급 3칸, 주요 뉴스 | 시장 전체를 숫자만이 아니라 해석 단위로 묶는다. |
| `/stocks/:code` 종목 상세 | 스크리너로 돌아가기, 종목명·관심 버튼·코드·시장·섹터, 현재가·등락, 시가총액/PER/PBR/배당수익률, chart + AOI Alpha 분석 score, 매매 아이디어 + 리스크 체크, 관련 자료 | 종목을 quote 화면이 아니라 분석 dossier로 보이게 한다. |
| `/market/:ticker` 지수 상세 | 네이비 gradient hero, 지수 설명과 quote card, 정규장 상태·마지막 갱신·데이터 출처 3개 카드, 참고용 스냅샷 고지 | 상태와 출처를 별도 정보 블록으로 분리한다. |

현 프로젝트와 직접 비교할 때 중요한 점은 AOI의 루트가 브랜드/획득용 화면이고, `/market`과 `/stocks/:code`가 실제 제품 화면이라는 점이다. 루트 hero의 화려함을 종목 상세에 그대로 복사할 필요는 없다.

### 1.2 타이포그래피

- 공식 HTML은 `Noto Sans KR`과 `DM Mono`를 함께 로드한다.
- 본문 기본값은 14px이며, 작은 표와 metadata는 9~12px까지 내려간다.
- hero H1은 대략 `42~68px`, 내부 페이지 intro H1은 `29~43px`, 종목 상세 H1은 29px이다.
- 가격·코드·ticker·날짜에는 `DM Mono`를 사용해 본문 한글과 숫자의 질감을 분리한다.
- eyebrow는 `11px`, indigo 색상, 넓은 자간의 uppercase다. 큰 제목은 `letter-spacing`을 강하게 줄여 덩어리감을 만든다.

즉 AOI는 **한글 sans 본문 + 모노 숫자 + 큰 압축형 제목 + 작은 영문 eyebrow**라는 이중 언어를 사용한다. 데이터 밀도는 높지만 제목, 숫자, 설명의 층이 분명하다.

### 1.3 색과 형태

공식 CSS에서 확인되는 핵심 토큰은 다음과 같다.

- ink: `#0B1020`, soft ink: `#171D32`
- paper: `#FFFFFF`, mist: `#F5F6F8`, line: `#E2E5EA`
- primary indigo: `#685CFF`, base indigo: `#514EE4`
- signal red: `#DD4050`, up/down 보조: `#D35368`, `#4D73C8`
- green status: `#0A9C78`

형태는 흰 배경 위의 얇은 회색 선, `8~15px` 카드 radius, hero의 `24px` radius, 선택적 그림자다. CTA는 일반 화면에서 indigo, 홈 hero에서 red, 회원가입에서 ink navy를 사용한다. AOI는 한 가지 강조색만 쓰지 않고 **브랜드 indigo, 행동 red, 시장 방향 red/blue, 상태 green**을 역할별로 분리한다.

### 1.4 이미지와 그래픽

- hero는 `aoi-alpha-premium-hero_db577488.jpg`라는 2560×1440 이미지다. 실제 파일은 금융 도시, 유리 패널, 격자, 상승하는 붉은 선을 보여준다.
- hero 위에 52px grid overlay와 어두운 scrim을 덧씌운다.
- hero 우측 하단에는 blur가 적용된 glass research panel이 겹친다.
- logo는 세 개의 높이가 다른 red bar mark와 `AOI ALPHA` wordmark다.
- 시장 화면은 24거래일 bar chart와 방향 legend를 사용한다.
- 종목 상세는 사진 대신 interactive line chart, 기간 버튼, score bars를 사용한다.

AOI는 이미지가 필요한 곳과 데이터 그래픽이 필요한 곳을 구분한다. 종목 상세까지 hero 이미지를 반복하지 않는 점은 현 프로젝트가 참고할 만하다.

### 1.5 CTA와 밀도

- hero primary: `오늘의 실행 플랜`
- hero secondary: `조건 스크리너`
- 전역 CTA: `로그인`, `회원가입`
- 종목 상세 CTA는 관심 버튼과 관련 자료/분석 이동처럼 문맥에 붙어 있다.
- 화면 밀도는 높다. 시장은 7개 metric을 한 줄에 놓고, 표는 최소 820~910px 폭을 유지한다. 대신 섹션 사이 여백은 45~98px까지 크게 둬서 데이터 덩어리끼리 분리한다.
- 모바일에서는 ticker, 2열 metric, hero panel, 표용 mobile card로 재구성한다. 단순히 데스크톱을 축소하지 않는다.

### 1.6 브랜드 표현

AOI는 “전문가급 주식 리서치 터미널”을 표방하지만, 시각적으로는 터미널보다 **프리미엄 리서치 서비스**에 가깝다. 큰 hero, red 실행 CTA, indigo 분석 점수, glass panel, 실적/성과/인사이트의 서사로 사용자가 “무엇을 읽고 어떤 후보를 볼지”를 먼저 이해하게 한다.

## 2. 확인된 사실: 현 프로젝트

### 2.1 현재 셸과 정보 구조

`public/app.js`의 `renderShell()`은 다음을 만든다.

- 상단 68px dark topbar: `SL` mark, `시장`, `실시간 시그널`, `조건 스크리너`, `관심종목`, 전역 검색, role switcher, sandbox login, `구독·계정`
- 그 아래 38px market tape: `MARKET TAPE`, 장 상태, KOSPI/KOSDAQ 기준 시각, `demo-fixture`, 주문 기능 없음
- 데스크톱에서는 별도 sidebar를 숨기고, 모바일에서는 4개 항목 bottom navigation으로 사용한다.
- `<main>`은 skeleton으로 시작하고 API 응답 뒤 화면을 교체한다.

시장 화면은 `오늘의 시장` 제목, freshness strip, 3개 지수 카드, 4개 요약 metric, 검색 + 시장 흐름 table, 신호 gate, 제품 범위 카드 순서다.

종목 상세는 다음 순서다.

1. `STOCK RESEARCH` eyebrow와 종목명, 코드/거래소/보안 유형, 관심종목 CTA
2. stock header card 안의 거래 상태, 섹터, 현재가, 등락, 거래량, `asOf`, `receivedAt`, 출처
3. sticky detail tabs: 차트, 수급, 뉴스, 재무, 신호
4. 왼쪽 stack: 가격 흐름 SVG chart, 실시간 시그널 또는 잠금 gate, 수급
5. 오른쪽 stack: 뉴스, 재무 요약, 출처와 위험 고지

### 2.2 현재 시각 토큰

`styles.css`에는 초기 공통 토큰과 그 뒤의 `/* MARKET TAPE approved visual system */` 토큰이 함께 있다. 실제 최종값은 뒤의 선언이 덮어쓴다.

- canvas: `#F6F2E9`, raised: `#FFFCF6`, subtle: `#E7E0D4`
- ink: `#112331`, rail: `#203848`
- live: `#007F83`, 상승: `#C3313B`, 하락: `#2B64B4`, warning: `#96621C`
- final card radius: 8px, control radius: 5px, shadow는 거의 제거
- Pretendard를 jsDelivr에서 로드하며, 별도 mono family는 지정하지 않는다.
- topbar 68px + market tape 38px = 106px이고, stock detail tabs의 sticky top도 106px이다.
- 본문 최대 폭은 1,440px이고, 기본 main padding은 34px과 `16~64px`의 유동 좌우 여백이다.

`public/index.html`은 앱 mount와 title만 제공한다. title은 `시그널랩 · 장중 국내 주식 리서치`, theme-color는 `#112331`이며, 실제 브랜드 mark/hero 이미지/meta description은 없다.

### 2.3 현재의 강점

- `dataStatus`, `asOf`, `receivedAt`, `source`를 반복해서 노출한다.
- `REALTIME`, `DELAYED`, `STALE`, `UNAVAILABLE`, 권한 잠금, 연결 복구, 오류, 빈 결과, loading skeleton을 분리한다.
- 차트에 동일 데이터의 접근 가능한 표를 제공한다.
- 상승/하락을 색상과 한글 label로 함께 표시한다.
- skip link, visible focus, modal focus return, reduced motion을 구현했다.
- 문서의 `MARKET TAPE` 방향과 실제 최종 CSS 팔레트가 대체로 일치한다.

## 3. 비교 분석과 시각 격차

| 축 | AOI Alpha | 현 프로젝트 | 시각 격차 |
|---|---|---|---|
| 첫 인상 | hero와 실행 CTA가 사용자의 목적을 먼저 제시 | 상태 strip와 데이터 계약을 먼저 제시 | 현재는 신뢰성은 강하지만 제품의 핵심 효용이 약하게 보인다. |
| 시장 화면 | 7개 지표 → chart → 시장 해석 → 수급/매크로 → 뉴스 | 3개 지수 → 4개 metric → 검색/시장 흐름 → gate/제품 범위 | 현재는 운영 상태와 기능 설명이 시장 해석보다 앞선다. |
| 종목 상세 | quote header → 4개 핵심 fact → chart + score → 아이디어 + 리스크 | quote/status가 한 카드에 모임 → chart → signal/flows/news/financials가 반복 card | 현재도 dossier 구조는 있지만 모든 정보가 같은 card 표면에 있어 score/핵심 판단이 덜 선명하다. |
| 타이포 위계 | Noto Sans KR + DM Mono, 9~68px, 큰 제목과 작은 수치의 대비 | Pretendard 단일계열, 11~42px, tabular figures 중심 | 한글 가독성은 좋지만 브랜드 제목, 숫자, timestamp의 역할 분리가 약하다. |
| 컬러 위계 | white/ink 기반, indigo 브랜드, red CTA, blue/red 시장 방향 | warm paper/ink navy 기반, teal live, red/blue 방향 | 현 프로젝트의 paper 방향은 차별점이지만 AOI처럼 “행동색”과 “브랜드색”이 분리되지는 않는다. |
| 이미지/그래픽 | hero 금융 이미지, grid, glass panel, interactive chart | 이미지 없음, 단일 teal SVG chart, CSS flow bar | 브랜드를 기억하게 할 visual anchor가 부족하다. 단, 모든 화면에 사진이 필요하다는 뜻은 아니다. |
| CTA | `오늘의 실행 플랜`, `조건 스크리너`, 로그인/회원가입 | 검색, 로그인, `실시간 시그널 보기`, `구독 상태 확인`, 관심 추가 | 현재 CTA는 상태/권한 중심이고, 시장 또는 종목에서의 다음 리서치 행동이 약하다. |
| 밀도 | 작은 metadata와 큰 섹션 여백의 조합 | 표와 카드 모두 13~16px 이상, card padding 15~20px | 현재는 편안하지만 화면 높이가 길고, 반복 카드가 정보 밀도를 소비한다. |
| 모바일 | ticker와 hero를 모바일용으로 재배치, mobile pick card 제공 | market table은 가로 스크롤, stock tabs는 가로 스크롤 | 기존 명세가 말한 “행 카드/앵커 우선”과 구현이 어긋난다. |
| 브랜드 표현 | AOI 로고, red bar mark, indigo/red 언어, premium research | `SL` 텍스트 mark와 `MARKET TAPE` paper desk | 현재 방향은 신뢰 중심으로 좋지만 로고·그래픽·타이포가 아직 브랜드 수준으로 완성되지 않았다. |

## 4. 문제와 우선순위

### P0. 핵심 판단보다 시스템 상태가 먼저 보인다

현 프로젝트의 시장과 종목 상세는 freshness, connection, source, permission, risk를 잘 말하지만, 사용자가 첫 3초에 답을 얻어야 하는 “오늘 시장이 어떤가”, “이 종목을 왜 더 읽어야 하는가”가 약하다. AOI는 시장 상태/score/idea를 큰 제목과 숫자로 먼저 보여준다.

**개선 방향:** 상태를 없애지 말고 상단에 1개의 compact freshness rail로 통합한 뒤, 그 아래에 시장 해석 또는 종목 quote/score를 별도 focal block으로 만든다.

### P0. 카드 표면이 모든 콘텐츠의 공통 문법이다

현재 `.card`가 검색, 흐름, 신호, 뉴스, 재무, 위험 고지에 반복된다. 이 때문에 핵심 chart와 보조 고지가 같은 시각 무게를 갖는다. `06-design-plan.md`가 제안한 section rail, quote strip, dossier panel, permission gate의 구분이 아직 충분히 구현되지 않았다.

**개선 방향:** card를 더 추가하지 말고 다음 4가지 표면만 명확히 구분한다.

1. `quote lead`: 현재가/등락/기준 시각을 위한 큰 lead
2. `evidence panel`: chart, 수급, 재무처럼 근거를 위한 평면 패널
3. `interpretation panel`: 시장 상태, 아이디어, score를 위한 색면/강조 패널
4. `notice rail`: stale, source, risk, permission을 위한 얇은 rail

### P1. 토큰과 문서의 불일치

`styles.css`의 앞부분에는 기존 blue-gray system이 남아 있고, 뒤에서 MARKET TAPE가 재정의한다. 문서에는 카드 12px, control 8px이 적혀 있지만 최종 override는 card 8px, button 5px이다. 이런 이중 토큰은 화면마다 radius와 표면이 달라지는 시각 debt의 원인이 된다.

**개선 방향:** 다음 구현 때는 `paper/ink/status/interactive` 역할을 한 번만 정의하고, 카드 radius와 control radius를 문서와 실제 CSS 중 한 쪽으로 확정한다.

### P1. AOI 수준의 숫자 언어가 없다

현재는 `font-variant-numeric: tabular-nums`가 중심이다. 숫자 정렬은 되지만 ticker, 종목 코드, timestamp, metric value가 모두 같은 Pretendard 질감이다. AOI의 DM Mono처럼 숫자를 별도 visual voice로 분리하면 시장판과 상세의 밀도가 높아져도 스캔이 쉬워진다.

**개선 방향:** 새 폰트를 무조건 도입하기보다 `numeric`, `timestamp`, `ticker-code` 역할을 분리하고, 실제 사용 가능한 mono fallback을 정한다. 한글 본문은 Pretendard를 유지한다.

### P1. 차트가 정적이다

현재 SVG line chart와 `<details>` 표는 접근성 측면에서 좋은 기반이다. 그러나 기간 선택, hover 시점, 현재 포인트, 비교 기준, 상승/하락 legend가 없어 AOI의 interactive chart보다 분석 도구의 느낌이 약하다.

**개선 방향:** 3M/6M/1Y 또는 제품이 지원하는 범위 안에서 기간을 선택하게 하고, hover/focus value rail과 `최저/최고/기준 시각`을 유지한다. 단순 장식 animation보다 읽기 행동을 지원하는 interaction을 우선한다.

### P1. 반응형 명세와 구현이 어긋난다

`06-design-spec.md`는 모바일 시장에서 종목 행 카드를 우선하고, 종목 상세 탭은 가로 스크롤보다 섹션 anchor/접힘을 우선한다고 정한다. 실제 `app.js`는 동일한 table과 가로 스크롤 `detail-tabs`를 사용한다. 이는 정보 손실은 없지만 모바일에서 핵심 수치를 한 번에 비교하기 어렵게 한다.

**개선 방향:** 시장 mover는 `stock-row` 카드로 바꾸고, 종목 상세는 상단 anchor bar 또는 accordion으로 바꾼다. 320px에서 quote, 상태, CTA가 먼저 보이도록 한다.

### P2. 브랜드 자산이 부족하다

`index.html`에는 `SL` 두 글자 mark만 있고 실제 logo geometry, image, distinctive chart treatment가 없다. `MARKET TAPE`의 paper/ink 방향은 분명하지만 현재 구현은 generic enterprise dashboard로도 읽힐 수 있다.

**개선 방향:** red/blue/teal을 더 추가하지 말고, 하나의 기억점만 만든다. 예를 들면 종목 상세의 `quote lead + signal rail` 조합 또는 paper 위의 굵은 market index rule이다. logo는 별도 승인 없이 임의 변경하지 않는다.

### P2. dark mode 정책이 비교 기준과 다르다

AOI는 light/dark toggle을 실제 셸에 제공한다. 현 문서는 MVP에서 dark theme를 제외한다고 명시한다. 이것은 현재 버그는 아니지만, AOI와 비교했을 때 premium 터미널 감각의 폭이 좁다.

**개선 방향:** 지금 당장 dark mode를 넣기보다 light paper 방향을 먼저 완성한다. 이후 추가할 때는 `paper`를 그대로 뒤집지 말고 `ink-950`, `ink-900`, `surface-2`, desaturated status color를 별도 토큰으로 설계한다.

## 5. 개선 원칙

1. **AOI의 색을 복사하지 말고 정보 위계를 배운다.** AOI의 강점은 indigo가 아니라 hero/metric/score/idea를 순서대로 읽게 만드는 구성이다.
2. **현 프로젝트의 freshness와 entitlement를 핵심 브랜드 자산으로 유지한다.** 현재의 `asOf`, `receivedAt`, `source`, stale, 권한 분리는 AOI보다 강한 신뢰 근거다.
3. **한 화면에 primary focal point 하나를 둔다.** 시장은 현재 시장 상태 또는 KOSPI 흐름, 종목은 현재가와 분석 score 중 하나를 첫 focal로 정한다.
4. **status는 rail, interpretation은 panel로 분리한다.** stale/error/source를 큰 카드로 키우지 않는다.
5. **데이터 밀도는 작은 라벨이 아니라 그룹화로 조절한다.** 10px 텍스트를 늘리기보다 metric을 3~4개 의미 그룹으로 묶는다.
6. **상승/하락은 현행 한국 시장 관습을 유지한다.** 상승 `#C3313B`, 하락 `#2B64B4`와 텍스트/기호를 함께 쓰고, live teal은 실시간 상태에만 사용한다.
7. **CTA는 다음 리서치 행동을 말한다.** `검색`, `관심종목 추가`, `차트 데이터 표 보기`, `근거 보기`처럼 결과가 분명한 동사를 우선한다. 권한 gate의 CTA와 일반 탐색 CTA를 같은 무게로 놓지 않는다.
8. **차트는 장식이 아니라 판단의 근거다.** 기간, 기준 시각, 최저/최고, 표 대체 경로를 같은 영역에서 찾을 수 있게 한다.
9. **모바일은 축소판이 아니라 우선순위 재배치다.** 시장/상세 모두 quote와 상태를 고정하고, 표와 탭은 읽기 순서에 맞춰 재구성한다.
10. **한 화면의 시각 언어를 하나로 잠근다.** paper canvas를 유지한다면 indigo gradient나 dark hero를 랜덤으로 끼워 넣지 않는다. 강한 dark surface는 해석 panel 한 곳에만 제한한다.

## 6. 새 visual direction 후보

### 후보 A. Evidence Tape Desk, 추천

**현행 MARKET TAPE를 진화시키는 방향.** AOI의 강한 focal hierarchy를 차용하되, AOI의 hero 사진과 indigo를 그대로 가져오지 않는다.

- 바탕: `#F6F2E9`, raised `#FFFCF6`, ink `#112331`
- 브랜드 강조: live teal `#007F83`
- 시장 방향: rise `#C3313B`, fall `#2B64B4`, warning `#96621C`
- 형태: 0~8px radius, 얇은 rule, 그림자 최소화
- 시장: 상단 compact freshness rail → 큰 시장 상태 문장 → 3개의 핵심 지수 → chart → movers
- 종목: 상단 quote lead → 4개 fact strip → chart와 분석 요약의 2열 → 수급/뉴스/재무 evidence rail
- 타입: Pretendard 본문, 12px caption, 20~28px section, 36~44px quote, timestamp/수치 mono 역할
- CTA: dark ink primary 1개, teal/outline secondary 1개
- 장점: 기존 문서와 가장 잘 맞고 금융 오해를 덜 만든다.
- 위험: 잘못 구현하면 plain table dashboard가 된다. quote lead와 분석 요약에 강한 크기 대비가 필요하다.

### 후보 B. AOI-adjacent Research Console

**AOI와 가장 가까운 프리미엄 리서치형.** 벤치마크로는 강하지만, 브랜드 차별성이 약해질 수 있다.

- 바탕: `#FBFBFC`와 white surface
- 브랜드 강조: indigo `#514EE4` 또는 `#685CFF` 중 하나만 선택
- 행동 강조: red는 primary CTA 한 곳에만 사용
- 형태: 10~14px radius, 낮은 그림자, 선택된 score panel만 dark navy
- 시장: 탭 → 7개 metric strip → chart + market interpretation 2열 → news
- 종목: header와 price를 가볍게, score/idea를 시각적 anchor로 강화
- 타입: Pretendard 또는 Noto Sans KR, 숫자용 DM Mono 계열
- 이미지: 시장 overview에는 이미지 없음. 브랜드 홈에만 하나의 금융 image 사용
- 장점: 빠른 스캔, premium impression, AOI와 직접 비교하기 쉽다.
- 위험: indigo, rounded card, score bar가 겹치면 AOI 복제품처럼 보인다. 카드 수와 색면을 줄여야 한다.

### 후보 C. Two-Speed Dossier

**시장판은 빠르게, 종목 상세는 깊게 읽는 두 속도 구조.** 현 프로젝트의 신뢰 고지를 유지하면서 종목 상세에 서사를 부여한다.

- 시장판: 32px ticker + 1개 시장 상태 banner + 3개 quote metric + 1개 chart + plain movers table
- 종목 상세: paper header와 44px quote lead, 오른쪽에 220px analysis verdict block, 아래 evidence sections
- 색: paper/ink를 85% 이상 유지하고, verdict는 teal/amber/red의 semantic tint만 사용
- 형태: 시장판은 0~6px, 상세 verdict만 12px. 모든 섹션을 둥근 카드로 만들지 않는다.
- 그래픽: 종목별 hero 사진 대신 sector/price context를 보여주는 chart, sparkline, thin rule
- CTA: `관심종목 추가`와 `근거 펼치기`처럼 분석 행동에 한정
- 장점: 시각적 차별성이 있고, 금융 리서치 도구로서의 신뢰를 강화한다.
- 위험: market과 stock 사이의 스타일 차이가 과해지면 하나의 제품으로 보이지 않는다.

**권장 조합:** 후보 A를 기본으로 채택하고, 후보 C의 종목 `quote lead + verdict block`을 차용한다. 후보 B에서 가져올 것은 indigo 색이 아니라 `score/idea를 하나의 해석 anchor로 만드는 정보 위계`뿐이다.

## 7. 구현 전 시각 handoff 기준

- 시장 desktop: `1440px` max, 12-column logic grid, gutter `16px`, outer margin `48~64px`
- 종목 desktop: quote lead full width, chart/evaluation `8:4`, evidence `6:6`
- mobile: outer padding `16px`, section gap `32px`, touch target 최소 `44px`
- 타입 기준: body `16/24`, label `12/18`, section `20/28`, page title `32~40/40~48`, quote `36~44/1.1`
- 간격 기준: `4, 8, 12, 16, 24, 32, 48, 64px`만 우선 사용
- 상태 표현: color + text + symbol을 유지하고, live teal은 connection/freshness에만 사용
- motion: 데이터 변화는 opacity/color 120~180ms, 자동 ticker/entry는 reduced motion에서 정지
- 검증 viewport: 1440px, 1024px, 768px, 390px, 320px와 200% 확대

## 8. 결론

AOI Alpha의 강점은 화려한 hero 자체가 아니라 **브랜드 인상 → 시장 맥락 → 핵심 수치 → 해석 → 다음 행동**의 순서를 시각적으로 고정한 점이다. 현 프로젝트는 반대로 **상태 정확성 → 권한/오류 계약 → 데이터 표면**에 강하다. 따라서 격차를 줄이는 최선의 방법은 AOI 색과 사진을 복제하는 것이 아니라, 현 프로젝트의 신뢰 정보를 더 작은 rail로 정리하고 시장/종목의 핵심 판단을 더 큰 focal block으로 승격하는 것이다.

현행 `MARKET TAPE`의 paper/ink 방향은 유지 가치가 높다. 다음 시각 작업의 우선순위는 브랜드 hero가 아니라 `quote lead`, `analysis anchor`, `evidence panel`, 모바일 정보 재배치, 그리고 중복 token 정리다.

## 참고한 공식 리소스

- https://www.aoialpha.com/
- https://www.aoialpha.com/assets/index-DcoYAG14.css
- https://www.aoialpha.com/assets/index-_d7U473q.js
- https://www.aoialpha.com/manus-storage/aoi-alpha-premium-hero_db577488.jpg
- 현재 프로젝트: `public/index.html`, `public/styles.css`, `public/app.js`
- 기존 계획: `docs/planning/06-design-plan.md`, `docs/planning/06-design-spec.md`
