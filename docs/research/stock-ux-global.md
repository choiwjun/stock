# 글로벌 주식 리서치·터미널 UX 벤치마크

- **확인일:** 2026-09-19 KST
- **대상:** TradingView, Koyfin, Bloomberg Terminal, Seeking Alpha, Robinhood
- **목적:** 국내 개별주식 리서치 서비스의 시장판·관심종목·종목 상세·스크리너·근거 표현을 설계하기 위한 1차 출처 기반 수집
- **구분:** `[사실]` 공식 페이지/도움말에 명시된 내용, `[해석]` 여러 사례를 비교한 판단, `[제안]` 본 제품에 적용할 방향, `[미확인]` 공개 자료로 확인하지 못한 사항

## 1. 시장 포지셔닝

| 제품 | 핵심 포지션 | 확인된 UX 특징 |
|---|---|---|
| TradingView | 차트·실시간 시세·스크리너 | 차트/컬럼 커스터마이징, watchlist, 강한 데이터 상태 표현 |
| Koyfin | 글로벌 리서치 워크벤치 | 시장 대시보드, 사용자 컬럼·계산식·관심목록, 고급 차트 |
| Bloomberg Terminal | 기관용 통합 터미널 | 실시간 데이터·뉴스·분석·협업을 하나의 워크스페이스에 통합 |
| Seeking Alpha | 콘텐츠·평가·아이디어 탐색 | Premium 뉴스, Analyst/Quant rating, 스크리너, 분석 콘텐츠 |
| Robinhood | 저마찰 리테일 투자 | 단순 watchlist, Top Movers/Top News 카드, 단계적인 quote 상세 |

[해석] 글로벌 제품은 대체로 **실시간 차트형(TradingView/Robinhood)**, **리서치 워크벤치형(Koyfin/Bloomberg)**, **콘텐츠·근거형(Seeking Alpha)**으로 나뉜다. 본 제품의 기회는 국내 시장판과 근거 검증을 한 화면 흐름으로 묶는 것이다. Bloomberg식 복잡성을 그대로 복제하지 않고, Robinhood식 즉시성과 Seeking Alpha식 설명성을 결합해야 한다.

## 2. 기능별 비교

| 기준 | TradingView | Koyfin | Bloomberg | Seeking Alpha | Robinhood |
|---|---|---|---|---|---|
| 시장 개요 | Watchlist Advanced View 중심 | 글로벌 시장 대시보드 강함 | Launchpad·멀티자산 모니터 강함 | 뉴스 피드 중심 | Top Movers/Top News 카드 |
| 관심목록 | 섹션·컬럼·정렬·노트·상세 | 사용자 컬럼·요약 행·메모·계산식 | security list·Launchpad | Portfolio Tracker | 목록·순서 변경·상단 카드 |
| 시세 상태 | 실시간/지연/EOD 구분 | live market data 표방, 세부 규칙은 제한적 | real-time data 표방, 세부 규칙은 제한적 | IEX·15분 grace·지연 라벨 | Last Sale/ATS·최대 15분 지연 |
| 차트 | 다중 차트·지표·표 보기 | 100+ 지표·템플릿·공유 | 비교·주석·내보내기·협업 | 캔들/라인/비교/지표/드로잉 | 기본/고급 차트·스크럽·지표 |
| 스크리너 | 기술·기본·프리셋·자동 갱신·CSV | 5,900+ 기준·10만+ 종목 | 공개 자료로 세부 미확인 | rating·섹터·국가·배당·earnings | 가격·거래량·시총·섹터·배당·P/E 등 |
| 뉴스/근거 | 뉴스·fundamental·technical | 뉴스·filing·transcript 알림 | 뉴스가 차트·분석에 통합 | headline·summary·rating·분석 콘텐츠 | 뉴스·rating·재무·earnings |
| 권한 | 브로커 인증·데이터 구독 | Free/Plus/Premium/Advisor | Terminal/Anywhere subscription | Premium gating | 기능·거래소별 범위 차이 |

## 3. 제품별 관찰

### TradingView

- [사실] Watchlist는 자산 유형·시장·섹터별 목록, 섹션, 드래그 정렬, 컬럼 설정, symbol detail, 뉴스·fundamental·technical 접근을 제공한다.
- [사실] Screener는 fundamental/technical 지표, 저장 화면, 프리셋, CSV export, 자동 갱신, 통화 설정을 지원한다.
- [사실] 차트 데이터를 시간 행과 지표/종목 열의 표로 볼 수 있다.
- [사실] 실시간 데이터는 브로커 인증 또는 별도 데이터 구독과 연결되며, 지연 데이터에는 아이콘 또는 `D` 표기가 사용된다.
- [해석] 시각화 → 동일 데이터의 표 → 출처/상태 흐름이 신뢰를 만든다.
- [제안] 본 제품의 차트·MARKET TAPE에도 sparkline만 두지 말고 숫자·기간·기준 시각·표 대안을 함께 둔다.

**출처**
- https://www.tradingview.com/support/solutions/43000745825-mastering-the-tradingview-watchlists/
- https://www.tradingview.com/support/solutions/43000718866-tradingview-stock-screener-trade-smarter-not-harder/
- https://www.tradingview.com/support/solutions/43000479666-how-can-i-get-real-time-data-from-exchanges-that-i-have-already-purchased-with-my-broker/
- https://www.tradingview.com/support/solutions/43000698958-alerts-based-on-real-time-and-non-real-time-symbols/
- https://www.tradingview.com/support/solutions/43000765410-how-to-view-chart-data-as-a-table/

### Koyfin

- [사실] Watchlist는 사용자 컬럼, 요약 행, 메모, custom calculation, 전체 watchlist 알림을 제공한다.
- [사실] Screener는 수천 개의 기준과 글로벌 종목을 대상으로 하며, 결과를 watchlist 또는 CSV로 저장할 수 있다.
- [사실] Market Dashboard는 글로벌 주식·채권·통화·원자재·경제 데이터를 한 화면에 묶는다.
- [사실] 차트는 fundamental/technical/valuation/consensus 지표, 템플릿·저장·공유를 제공한다.
- [사실] 알림은 price, valuation, technical, news, press release, filing, transcript를 대상으로 한다.
- [해석] Koyfin의 강점은 한 번 보고 끝나는 dashboard가 아니라 사용자가 반복 가능한 조사 화면을 구축하는 데 있다.
- [제안] 본 제품도 기본 시장 rail과 사용자 관심종목 rail을 분리하고, 향후 사용자 정의 rail 확장을 고려한다.

**출처**
- https://www.koyfin.com/features/watchlists/
- https://www.koyfin.com/features/stock-screener/
- https://www.koyfin.com/features/market-dashboards/
- https://www.koyfin.com/features/advanced-graphing/
- https://www.koyfin.com/features/alerts/
- https://www.koyfin.com/pricing/

### Bloomberg Terminal

- [사실] 공식 문서는 Terminal을 실시간 데이터·뉴스·리서치·분석·실행을 통합한 솔루션으로 설명한다.
- [사실] Launchpad는 멀티자산 security monitor, alerting, charting, market-moving news를 제공한다.
- [사실] 뉴스는 차트·시각화·분석 도구에 통합되고, Top News·First Word·Daybreak·Morning Report·News Trends 등의 흐름으로 제공된다.
- [사실] 차트는 여러 상품 비교, 주석 포함 export, 템플릿, 실시간 협업을 지원한다.
- [해석] Bloomberg의 차별점은 개별 카드의 화려함보다 모니터 → 뉴스 → 차트 → 협업 연결성이다.
- [제안] MARKET TAPE는 지수 나열보다 시장 변화 → 관련 근거 → 종목 상세로 이어지는 탐색 rail이어야 한다.
- [미확인] Bloomberg Markets 소비자 페이지는 확인 시 anti-bot으로 UI 세부를 검증하지 못했다. Terminal 공식 자료만 근거로 사용한다.

**출처**
- https://professional.bloomberg.com/products/bloomberg-terminal/
- https://professional.bloomberg.com/products/bloomberg-terminal/charts/
- https://professional.bloomberg.com/products/bloomberg-terminal/news/

### Seeking Alpha

- [사실] IEX 거래 종목은 실시간 quote, thinly traded 종목은 지연 quote로 제공되며 15분 grace period와 symbol page 라벨이 명시된다.
- [사실] Premium News Feed는 시장 이벤트, 배당, value/growth, notable calls 등의 smart filter와 headline/summary를 제공한다.
- [사실] Premium Screener는 저자 rating, Wall Street analyst rating, Quant rating, 국가·섹터·거래·배당·earnings 등을 조합하고 저장할 수 있다.
- [사실] Advanced Chart는 캔들/라인/바, 기간, 비교, log/비율, 지표, drawing tools, snapshot을 제공한다.
- [사실] Portfolio Tracker는 사용자 컬럼·metrics, Quant aggregate rating, 실시간 성과, alert를 제공한다.
- [해석] quote 자체보다 “왜 움직였는가”를 rating·뉴스·분석 콘텐츠로 설명하는 구조가 강하다.
- [제안] movers에 관련 뉴스·공시·수급으로 이동하는 근거 진입점을 붙이되, 추천·매매 신호처럼 보이는 표현은 피한다.

**출처**
- https://help.seekingalpha.com/basic/are-seeking-alpha-quotes-real-time
- https://help.seekingalpha.com/premium/what-is-the-premium-news-feed-and-how-can-i-use-it
- https://help.seekingalpha.com/premium/what-are-screeners-and-how-can-i-discover-stocks-using-them
- https://help.seekingalpha.com/premium/advanced-chart-features-a-brief-about-what-the-various-buttons-on-the-advanced-chart-denote

### Robinhood

- [사실] Watchlist는 Top Movers·Top News·계정 상태 카드와 사용자 목록을 제공한다.
- [사실] Market price는 최근 거래 가격이며 정규/야간 시간대에 Nasdaq Last Sale 또는 ATS를 사용한다.
- [사실] 종목 상세 가격은 extended/overnight 시간대 최대 15분 지연될 수 있고, 주문 화면의 통합 bid/ask와 구분된다.
- [사실] Screener는 프리셋과 사용자 필터를 제공하며 52주 고저·가격 변화·거래량·시총·섹터·배당·P/E·earnings·options·implied volatility 등을 지원한다.
- [사실] 종목 상세에는 chart, stats, news, analyst ratings, Trading Trends, financials, earnings가 단계적으로 제공된다.
- [해석] 복잡한 기능을 숨기기보다 사용자가 다음에 볼 정보를 카드와 상세 섹션으로 단계화한다.
- [제안] 모바일 MARKET TAPE는 장 상태 → 핵심 지수 → freshness → 상세 이동 순으로 축약한다.

**출처**
- https://robinhood.com/us/en/support/articles/watchlist-and-cards/
- https://robinhood.com/us/en/support/articles/stock-screeners/
- https://robinhood.com/us/en/support/articles/using-market-data/
- https://robinhood.com/us/en/support/articles/using-advanced-charts/
- https://robinhood.com/us/en/support/articles/viewing-stock-detail-pages/

## 4. 현재 프로젝트 진단

- [사실] 현재 구현은 상단 tape, freshness strip, 지수 카드, 요약 metric, movers table, 검색, signal permission block으로 구성된다.
- [사실] 디자인 명세는 `REALTIME`, `DELAYED`, `STALE`, `UNAVAILABLE`, `asOf`, `receivedAt`, `source`, `staleAfter`를 요구한다.
- [해석] 정직한 demo 상태와 freshness 계약은 갖췄지만, tape가 시장 판단을 시작하는 rail이라기보다 상태 안내에 가깝다.
- [해석] 동일한 둥근 카드와 균등한 정보 배치가 데이터 우선순위를 약하게 만든다.
- [제안] 첫 화면의 primary object를 `오늘의 시장 판단`으로 만들고, 수치·시장 폭·거래대금·movers·근거가 한 문맥에서 연결되도록 한다.

## 5. 재사용 원칙

1. **상태를 숫자와 붙인다.** `실시간 · 기준 10:31:05 KST · 수신 10:31:06`처럼 값 바로 옆에 표시한다.
2. **source와 venue를 분리한다.** 공급자·거래소·산정 기준·마지막 정상 수신을 상세에서 확인한다.
3. **시장 상태와 종목 상태를 분리한다.** KOSPI가 실시간이어도 일부 movers가 stale일 수 있다.
4. **TAPE는 탐색 rail이어야 한다.** 지수 클릭 → 시장 개요, mover 클릭 → 종목 상세, 근거 클릭 → evidence/news로 연결한다.
5. **잠금은 방향을 유출하지 않는다.** 흐린 차트, 색상, 화살표, 순위로 Premium 신호를 추론하게 만들지 않는다.
6. **차트에는 표 대안을 둔다.** 기간·최저/최고·기준 시각·동일 데이터 표를 함께 제공한다.
7. **상태 카피는 구체적으로 쓴다.** 실시간, 지연, 오래됨, 사용 불가, 데모 fixture를 구분한다.

## 6. 피해야 할 클리셰

- 자동으로 계속 흐르는 marquee ticker
- 빨강/파랑 색상만으로 상승·하락 구분
- 의미 없는 `LIVE` badge
- 모든 정보를 동일한 둥근 카드로 표현하는 card soup
- 출처·기간·단위 없는 sparkline
- 실제 Premium 방향을 암시하는 blur/placeholder
- 검정 배경 + 네온 초록만으로 Bloomberg/TradingView를 흉내 내는 터미널 스타일
- 서로 다른 거래소·공급자의 quote를 하나의 숫자처럼 섞기
- stale 값을 최신값과 같은 대비로 표시하기
- 빈번한 값 변화를 flash/애니메이션으로 강조하기

## 7. 종합 결론

**권장 포지션:** 근거·신선도 우선의 한국 시장판 rail.

본 제품은 단순한 차트 도구나 주문 앱이 아니라, 국내 개별주식의 시장 변화에서 종목 분석과 근거 확인까지 이어지는 리서치 플랫폼이어야 한다. 시각적으로는 기관 터미널의 밀도보다 AOI Alpha식 브랜드 서사와 Seeking Alpha식 근거 연결을 선택하되, AOI의 hero나 Bloomberg의 외형을 복사하지 않는다.

신뢰도: **높음**. 공식 제품·도움말과 현재 repo의 계약을 함께 검토했다.

## 8. 리스크 및 미확인

- 공급자별 지연·거래소·재배포 권한은 제품 규칙으로 일반화하면 안 된다.
- 특정 서비스의 15분 지연 규칙은 공통 표준이 아니다.
- 단일 전역 freshness badge는 일부 stale 데이터의 오인을 유발한다.
- 한국 시장의 상승=빨강, 하락=파랑 관습도 텍스트·기호와 함께 써야 한다.
- `매수·매도`, `신호`, `기회` 카피는 금융 규제·법무 검토가 필요하다.
- 모바일·키보드·스크린리더에서 높은 정보 밀도가 부담이 될 수 있다.
- 로그인 후 화면, 네이티브 앱의 실제 인터랙션, 내부 디자인 시스템은 공개 자료로 확인하지 못했다.
