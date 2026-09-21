# 06a. Approved Design Specification

## 문서 상태

- 상태: `SIGNALLAB RESEARCH DESK V2` 전면 리디자인 사용자 승인 / 구현 핸드오프
- 범위: `public/index.html`, `public/styles.css`, `public/app.js`의 presentation layer 및 화면 상태
- 비범위: API endpoint, 권한 판정, 데이터 모델, 신호 계산 규칙의 변경

## 1. Visual direction

`SignalLab Research Desk V2`는 어두운 graphite 캔버스 위에 데이터 표면을 층으로 쌓는 프리미엄 금융 리서치 터미널이다. 기존 종이색 화면, 반복 카드, 개발용 sandbox chrome은 제거한다.

- Canvas: `#080D12`
- Chrome: `#0F171F`
- Panel: `#151F2A`
- Raised/hover: `#1C2936`
- Line: `#2B3B4A`
- Text: `#F3F6F8`
- Muted: `#9AAEBD`
- Interaction: `#A69BFF`
- Live: `#57D4C9`
- Rise: `#FF7181` + `상승`/`+`
- Fall: `#72A9FF` + `하락`/`−`
- Warning: `#F2B86B`
- Error: `#FF8278`

검증되지 않은 색상 조합은 사용하지 않는다. 상태는 항상 텍스트·기호·수치 부호를 함께 제공한다.

## 2. Global frame

### Desktop

```text
[232px Sidebar] [64px Topbar: brand / search / session / account]
                 [40px MarketRail]
                 [Page content, 12-column grid]
```

### Mobile

```text
[56px Topbar]
[MarketRail: internal horizontal scroll]
[64px Sticky task navigation]
[Page content: one column]
```

Sidebar는 데스크톱에서만 보이며, mobile에서는 market rail 아래 sticky task navigation으로 대체한다. 화면 하단 fixed overlay는 콘텐츠를 가리므로 사용하지 않는다. 전체 page overflow는 숨기지 않고 원인을 제거한다.

## 3. Screen contracts

### Market

- H1 `오늘 시장`
- session/freshness를 H1 근처에 배치
- KOSPI/KOSDAQ와 breadth를 첫 데이터 그룹으로 배치
- movers는 compact table/list로 제공
- 검색·스크리너 CTA는 결과 탐색의 다음 행동으로 배치

### Stock

- identity → freshness → quote lead → local navigation → chart/table → evidence 순서
- quote의 현재가·등락·거래량에 tabular figures 적용
- chart는 text summary와 table fallback을 동반
- signal dossier는 권한별 필드를 서버 응답대로 표시

### Signals

- subscriber: connection state, filters, signal rows, evidence details
- guest/member: directionless permission explanation only
- stale/reconnecting/revoked 상태는 active 상태와 동일하게 보이지 않음

## 4. Component behavior

| Component | Required states | Notes |
|---|---|---|
| `Sidebar` | active, collapsed, focus | route label은 사용자 언어 |
| `MarketRail` | realtime, delayed, stale, unavailable | 내부 가로 스크롤, 상태 텍스트 포함 |
| `QuoteLead` | loading, populated, stale, unavailable | 기준 시각과 부호 병기 |
| `PriceChart` | loading, populated, empty, error | 표 대체 경로 필수 |
| `SignalDossier` | locked, active, validating, suspended, expired | 실제 premium 필드는 권한 필요 |
| `PermissionGate` | login-required, subscription-required, revoked | 잠긴 방향 추론 금지 |
| `SearchField` | idle, typing, loading, empty, error | label과 결과 수 제공 |
| `DataTable` | loading, empty, error, stale | semantic table; mobile compact grid keeps rank, instrument, price, rate, freshness visible |
| `ReconnectBanner` | connected, reconnecting, resynced, failed | 마지막 정상 수신 시각 포함 |
| `RiskDisclosure` | collapsed, expanded | 고지 버전과 source 유지 |

## 5. Copy rules

- 버튼은 결과를 말한다: `관심종목에 추가`, `다시 시도`, `구독 확인`.
- 내부 상태값을 그대로 사용자에게 노출하지 않는다. `ENTITLEMENT_REQUIRED` 대신 `활성 구독이 필요합니다`를 사용한다.
- 장식성 영문 eyebrow와 과도한 대문자 라벨을 사용하지 않는다.
- `매수/매도`는 승인된 고지와 함께 사용하며, 수익 보장·추천처럼 읽히는 문구를 사용하지 않는다.

## 6. Accessibility contract

- visible focus, keyboard order, skip link, ESC close, focus return
- semantic headings, table headers/caption, button/link semantics
- chart summary/table fallback
- `aria-live="polite"`는 상태 변화에 제한
- reduced motion
- 320px/200% zoom/reflow
- non-color status representation

## 7. Validation evidence

구현 완료 판단에는 다음을 첨부한다.

- `/market`, `/stocks/005930` 데스크톱 캡처
- 375px 모바일 캡처
- market → stock → watchlist 흐름 캡처/테스트
- loading/empty/error/stale/locked 상태 캡처
- keyboard focus 및 automated accessibility 결과
- 기존 API/security/contract test 결과
