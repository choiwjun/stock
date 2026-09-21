# 06. Design Plan

## 문서 상태

- 상태: `SIGNALLAB RESEARCH DESK V2` 시각·인터랙션 방향 사용자 승인 / 구현 기준
- 목적: 낮은 완성도의 혼합형 화면을 폐기하고, 금융 데이터를 빠르게 읽고 검증하는 하나의 제품 언어를 정의한다.
- 디자인 대상: 시장판, 종목 상세, 실시간 시그널, 스크리너, 관심종목, 구독/권한, 오류/지연/복구 상태.

## 1. 제품 인상

**프리미엄 금융 리서치 터미널**이다. 매매 앱이나 마케팅 랜딩이 아니다.

첫인상은 장식보다 다음 세 가지를 전달해야 한다.

1. 현재 시장을 빠르게 파악할 수 있다.
2. 숫자와 상태가 어디서 왔는지 확인할 수 있다.
3. 프리미엄 신호도 과장하지 않고 검증 가능한 근거로 보여준다.

기존의 종이색 캔버스, 어두운 chrome 혼합, 반복되는 카드와 개발용 컨트롤은 폐기한다. 모든 화면은 어두운 graphite 캔버스, 명확한 표면 레이어, 절제된 보라색 인터랙션, 한국 주식 의미색을 공유한다.

## 2. 디자인 원칙

- **판단 순서를 디자인한다:** 상태 → 숫자 → 변화 → 근거 → 다음 행동.
- **중요도에 따라 표면을 다르게 한다:** 모든 콘텐츠를 동일한 카드로 감싸지 않는다.
- **금융 상태를 숨기지 않는다:** 기준 시각·지연·출처·권한은 축약하되 사라지지 않는다.
- **프리미엄은 더 깊은 근거다:** 네온·블러·수익 암시 대신 이력·버전·evidence를 제공한다.
- **카피는 사용자의 언어다:** 장식적인 영문 소문자 라벨과 내부 용어를 줄이고 한국어 행동 라벨을 우선한다.
- **한 화면에 한 가지 주인공:** 시장 화면은 시장 pulse, 종목 화면은 quote lead, 시그널 화면은 이벤트 근거가 주인공이다.

## 3. 시각 시스템

### 3.1 색상 역할

| 역할 | 값 | 사용 |
|---|---|---|
| Canvas | `#080D12` | 앱 전체 배경 |
| Surface 1 | `#0F171F` | sidebar, topbar |
| Surface 2 | `#151F2A` | 주요 패널 |
| Surface 3 | `#1C2936` | hover, 선택, 입력 |
| Line | `#2B3B4A` | 규칙선, 표 경계 |
| Text | `#F3F6F8` | 본문·핵심 수치 |
| Muted | `#9AAEBD` | 보조 설명 |
| Interaction | `#A69BFF` | 링크·선택·주요 CTA·포커스 |
| Live | `#57D4C9` | 연결됨·실시간 |
| Rise | `#FF7181` | 상승, `+`, `상승`과 병기 |
| Fall | `#72A9FF` | 하락, `−`, `하락`과 병기 |
| Warning | `#F2B86B` | 지연·확인 필요 |
| Error | `#FF8278` | 실패·사용 불가 |
| Success | `#67D391` | 저장·완료 |

일반 텍스트는 4.5:1, 큰 텍스트와 UI 경계는 3:1 이상을 목표로 한다. 의미색은 색상·기호·문구·수치 부호를 함께 사용하며, 인터랙션 보라색은 상승/하락 의미에 사용하지 않는다.

### 3.2 타이포그래피

- 한국어 UI와 제목: `Pretendard`, 폴백 `SUIT`, system sans-serif.
- 숫자·코드·시각: `IBM Plex Mono`, 폴백 `ui-monospace`.
- H1: 32–48px, 700, 짧은 목적 문장.
- H2: 20–24px, 700.
- 본문: 14–16px, line-height 1.55.
- 보조: 12–13px, line-height 1.45.
- 숫자는 `font-variant-numeric: tabular-nums`로 고정한다.
- 모든 라벨을 대문자 영문으로 만들지 않는다. 필요한 제품명·코드만 예외로 둔다.

### 3.3 레이아웃과 밀도

- 4px 기반 spacing scale: 4/8/12/16/20/24/32/40/48.
- 데스크톱 12열 그리드, sidebar 232px, gutter 16–24px.
- 핵심 데이터 패널은 높은 밀도, 설명·고지 패널은 낮은 밀도로 구분한다.
- radius는 8px 기본, 주요 container 12px. 모든 블록에 큰 radius를 적용하지 않는다.
- 그림자는 최소화하고 surface 대비·규칙선·간격으로 위계를 만든다.
- 그래디언트, 유리 효과, 과도한 glow, 의미 없는 decorative chart는 사용하지 않는다.

## 4. 화면별 방향

### 시장

시장 상태 rail과 Market Pulse가 첫 주인공이다. breadth와 movers는 동일한 데이터 언어로 연결하고, 검색·스크리너는 사용자의 다음 행동으로 배치한다.

### 종목

Quote lead를 가장 크게 보여주되 signal보다 앞세운다. 차트는 실제 데이터와 표를 함께 제공하고, 오른쪽 dossier는 권한과 근거를 명확히 분리한다.

### 시그널

구독자에게는 방향·강도·발생/발행 시각·유효기간·알고리즘 버전·evidence를 한 행/상세 패널로 제공한다. 비구독자는 실제 방향을 유추할 수 없는 권한 안내만 본다.

### 구독·권한

가격보다 제공되는 리서치 가치와 권한 경계를 먼저 설명한다. 결제 성공과 entitlement 활성은 별도의 상태로 보인다.

## 5. 컴포넌트와 상태 인벤토리

### 공통

`AppShell`, `Sidebar`, `Topbar`, `MarketRail`, `PageHeader`, `FreshnessRail`, `StatusBadge`, `Button`, `SearchField`, `Tabs`, `Table`, `Sparkline`, `Toast`, `Dialog`.

### 금융 데이터

`MarketPulse`, `IndexStat`, `BreadthBar`, `MoverList`, `QuoteLead`, `PriceChart`, `ChartDataTable`, `FlowSummary`, `NewsList`, `FinancialSnapshot`, `SignalDossier`.

### 권한·복구

`PermissionGate`, `SubscriptionStatus`, `ReconnectBanner`, `RiskDisclosure`, `ErrorPanel`, `EmptyState`, `LoadingSkeleton`.

각 컴포넌트는 `default`, `loading`, `empty`, `error`, `stale`, `unavailable`, `permission-locked`, `degraded`, `selected`, `focus-visible` 상태를 정의한다.

## 6. 반응형과 입력 방식

- 375px부터 mobile-first로 설계하고 640/1024/1440px에서 레이아웃을 확장한다.
- 모바일은 한 열, 터치 타깃 최소 44px, market rail 아래 sticky 작업 탭을 사용한다. 하단 fixed overlay는 사용하지 않는다.
- 데스크톱은 sidebar·다중 열·hover 정보를 사용하되 hover만으로 중요 정보를 전달하지 않는다.
- 키보드 사용자는 논리적 tab order와 skip link, visible focus를 가진다.
- 표·market rail·탭만 내부 가로 스크롤을 허용하며, movers 핵심 열은 compact grid로 보존한다.
- `prefers-reduced-motion`에서는 업데이트 애니메이션과 전환을 즉시 또는 짧게 줄인다.

## 7. 상태·콘텐츠·모션

- 로딩은 콘텐츠 형태를 유지하는 skeleton으로 처리한다.
- 빈 상태는 이유와 다음 행동을 함께 보여준다.
- 오류에는 무엇이 실패했는지, requestId, 재시도 방법을 제공한다.
- stale는 마지막 정상 수신 시각과 현재 데이터가 최신값이 아님을 명시한다.
- live update는 수치가 바뀐 셀만 짧게 강조하고 전체 화면을 움직이지 않는다.
- 페이지 진입 시 전체 요소를 순차적으로 띄우는 generic fade-up은 사용하지 않는다.

## 8. 접근성 기준

- WCAG 2.2 AA를 기본 목표로 한다.
- 색상 대비, 키보드, 포커스 가림, 320px 리플로, 200% 확대를 검증한다.
- 차트는 텍스트 요약과 탐색 가능한 표를 동반한다.
- 상승/하락은 색상 외에 `상승 +2.1%`, `하락 -1.2%`처럼 읽힌다.
- 실시간 변경은 `aria-live="polite"`를 제한적으로 사용한다.
- 모달·메뉴·탭은 포커스 이동과 복귀, ESC, 현재 상태를 지원한다.
- 오류 입력은 label·description·error를 programmatically 연결한다.

## 9. 프로토타입·검증 계획

1. 시장 첫 화면에서 장 상태와 가장 많이 움직이는 종목 찾기.
2. 종목 상세에서 기준 시각·현재가·차트·수급·뉴스 위치 찾기.
3. 비구독자가 잠긴 신호의 의미와 구독 가치를 설명하기.
4. 구독자가 신호 방향·발생 시각·evidence·유효기간을 확인하기.
5. stale/재연결/권한 회수 상태를 최신 신호로 오해하지 않기.
6. 관심종목 추가·재방문·삭제를 모바일에서 완료하기.

검증 산출물은 데스크톱/모바일 캡처, 키보드 시나리오, 접근성 검사 결과, 과제별 완료 시간·오해·도움 요청 기록이다.

## 10. 구현 게이트

- `05-wireframe-spec.md`의 구조를 위반하지 않는가.
- 일반 사용자 화면에 sandbox/개발용 역할 전환이 남아 있지 않은가.
- 모든 핵심 화면에 정상/로딩/빈/오류/stale/잠금 상태가 있는가.
- 색상·타입·간격 토큰이 화면별로 재정의되지 않는가.
- 실제 데이터와 권한 계약을 임의로 바꾸지 않았는가.
- 브라우저 캡처와 테스트 결과를 티켓에 첨부했는가.
