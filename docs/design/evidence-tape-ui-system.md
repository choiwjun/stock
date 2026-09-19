# EVIDENCE TAPE — UI/UX 설계 시스템 (구현 기준)

- **작성일:** 2026-09-19 KST
- **상위 문서:** `docs/planning/05-wireframe-spec.md`, `docs/planning/06-design-spec.md`, `docs/research/stock-design-synthesis.md`
- **구현 산출물:** `public/index.html`, `public/styles.css`, `public/app.js`
- **상태:** 시각·구조 단일 시스템 구현 완료. 결제·시세 공급자·법무 문구 승인은 여전히 출시 차단 조건이다.

이 문서는 기존에 3중으로 덮어쓰기 되어 있던 스타일 계층(초기 토큰 → `MARKET TAPE` → `EVIDENCE TAPE`)을 하나의 의미 토큰 시스템으로 통합한 결과를 기록한다.

## 1. 분석에서 확인한 문제

| 구분 | 확인한 문제 | 조치 |
|---|---|---|
| 토큰 | `:root`가 3번 재정의되어 실제 적용값을 추적하기 어려웠고, 하락 색이 초기값(초록)과 승인값(파랑)에 동시 존재 | 단일 `:root`에서 의미 토큰 1회 정의, 하락은 `--fall-700` 계열로 통일 |
| 위계 | 지수·metric·검색·표가 같은 둥근 카드로 반복되어 시장 판단 초점이 약함 | 카드 라디우스 축소·그림자 제거, rule line·kicker·표면 톤으로 위계 구성 |
| 상태 | 신선도·출처가 표 하단에 흩어짐 | 값과 인접한 `freshness`/`quote-cell-label`, 상단 `market-tape`, 상세 `detail-freshness` 3단 배치 |
| 반응형 | 1180px 이하에서 내비게이션이 사라져 하단 탭 진입 전까지 이동 수단이 없음 | 1180px에서 topnav를 접고, 760px에서 하단 탭(44px 타깃)으로 전환 |
| 수치 | 숫자에 tabular 정렬만 적용되고 서체 구분이 없음 | 모든 수치에 `tabular-nums lining-nums`, 순번·커서에 mono 스택 |
| 모션 | skeleton·smooth scroll이 reduced motion에서도 동작 | `prefers-reduced-motion: reduce`에서 애니메이션·전환 무효화 |

## 2. 정보 구조

### 시장판 (`#/market`)

```text
Command Bar  브랜드 | 시장·시그널·스크리너·관심종목 | 전역 검색 | 권한·계정
Market Tape  국내 개별주식 | 장 상태 | KOSPI·KOSDAQ | 출처 | 기준 시각 | 범위 고지
Market Hero  "오늘 시장은 어디로 기울었나" + 장 세션·기준 시각·출처
Freshness Rail  연결 · 기준 시각 | 상태 배지 · 수신 시각
Market Pulse  좌: 판독 서사 + 지수   우: 시장 폭(breadth) + 거래대금/수급
Workbench  좌: Movers 표(+ 조건으로 더 찾기)   우: 검색 / 읽을 근거
Scope Strip  국내 개별주식 범위와 제외 항목 고지
Footer Note  출처 · 기준 시각 · 플랫폼 수신
```

### 종목 상세 (`#/stocks/:ticker`)

```text
Stock Dossier Head  종목명·코드·거래소·섹터·보안 유형 | 관심종목 액션
Detail Freshness    상태 배지 · 기준 시각 · 수신 시각
Quote Lead          현재가(라벨 분기) · 등락 · 거래량 · 거래 상태 · 출처
Detail Tabs         가격 | 수급 | 뉴스 | 재무 | 신호  (모바일은 sticky 해제)
Evidence Grid       좌: 가격 흐름(ChartWithTable) · 수급 · 신호
                    우: 뉴스 · 재무 · 출처와 위험 고지
```

### 그 외 화면

- 실시간 시그널: 연결 배너 → 제공 종목 표 → (구독자) 실시간 카드·이력 / (비구독자) 잠금 미리보기
- 조건 스크리너: 승인된 구조화 조건 폼 → 조건 요약 chip → 결과 표
- 관심종목: 저장 목록 표 + 삭제 / 빈 상태 CTA
- 구독·계정: 상품·가격 / 서버 entitlement 상태 카드 / 상태 사전 / 위험 고지

## 3. 디자인 토큰 (구현값)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--canvas` | `#f5f1e8` | paper canvas |
| `--raised` | `#fffcf6` | 패널·표·입력 표면 |
| `--subtle` | `#ebe4d7` | 보조 영역·구분선 |
| `--ink-950` / `--ink-800` | `#112331` / `#203848` | chrome 상단 바·하단 탭 |
| `--chrome-accent` | `#66d1c8` | chrome 내 선택 표시 |
| `--text` / `--secondary` / `--tertiary` | `#112331` / `#465766` / `#56697a` | 본문 / 설명 / 캡션 |
| `--primary` / `--focus` | `#203848` / `#007f83` | 주요 액션 / 키보드 포커스 |
| `--rise-700` (`--up`) | `#c3313b` | 상승 텍스트·기호 |
| `--fall-700` (`--down`) | `#2b64b4` | 하락 텍스트·기호 |
| `--live-600` | `#007f83` | 실시간·차트 선·강조 |
| `--amber-700` (`--warning`) | `#8a4b00` | 지연·오래된 데이터 |
| `--error` | `#b42318` | 사용 불가·오류 |
| `--info-bg` / `--info` | `#e8f3f1` / `#21646b` | 잠금·안내 표면 |

- 타이포: Pretendard 우선, `Noto Sans KR`·시스템 sans 폴백. 수치·순번·커서는 `--font-numeric`(IBM Plex Mono 계열) 폴백 스택.
- 간격: 4px 기반, 섹션 8px 배수. 라디우스는 카드 8px·컨트롤 5~6px로 제한해 카드 soup을 막는다.
- 그림자: 배경 카드에는 사용하지 않고 확인 시트·모달에만 사용한다.

## 4. 컴포넌트 상태 계약

| 컴포넌트 | 상태 |
|---|---|
| `FreshnessBadge` | `REALTIME`(청록) `DELAYED`·`STALE`(앰버) `UNAVAILABLE`(레드) — 모두 색 + 문구 동시 표기 |
| `QuoteLead` | 현재가 / 지연 시세 / 마지막 확인 가격 라벨 분기, `quote-status-notice` 경고 |
| `MoverList`·`StockRow` | loading · empty · error(+오류 ID·재시도) · stale |
| `StockSearch` | combobox/listbox 키보드 이동, 결과 없음과 검색 오류 분리 |
| `ChartWithTable` | 기간·최저·최고·기준 시각 + 동일 데이터 표, `role="img"` + 대체 표 |
| `WatchlistAction` | 저장 중(aria-busy) · 저장됨 · 중복 · 실패(+오류 ID) |
| `LiveSignalCard` | `ACTIVE` 이외 상태는 방향을 비활성 문구로 대체하고 위험 고지를 유지 |
| `SubscriptionState` | `PENDING` `ACTIVE` `CANCELLATION_SCHEDULED` `REFUND_PENDING` `PAYMENT_FAILED` `SUSPENDED` `EXPIRED` |
| `ConfirmSheet` | `role="dialog"`·`aria-modal`·포커스 복귀·Escape |
| `ReconnectBanner` | 연결 복구 중 · 데이터 `STALE` · 재연결 CTA |

## 5. 반응형 기준

| 폭 | 동작 |
|---|---|
| ≥1181px | 상단 topnav + 시장 테이프 sticky + 2열 workbench/evidence |
| 961~1180px | topnav 접힘(하단 탭 없음), 콘텐츠 1열 전환 |
| 761~960px | Market Pulse·Workbench·Evidence 1열, 인접 패널 2열 유지 |
| ≤760px | 상단 3행 그리드, 하단 탭(4항목, 44px), Movers 표만 내부 가로 스크롤, sticky detail tab 해제 |
| ≤420px | 1열, 시장 테이프 후반 항목 숨김, 확인 시트 바텀시트화 |

## 6. 검증

```bash
npm run check                      # 문법·계약
node --test test/contrast.test.js  # 승인 토큰 대비 자동 검사
node --test test/accessibility.test.js
npm test
node scripts/check-selectors.js    # app.js가 쓰는 모든 class가 CSS에 존재하는지
```

- `test/contrast.test.js`는 `text/canvas`, `secondary/raised`, `tertiary/raised`, `primary/raised`, `up/up-bg`, `down/down-bg`, `warning/warning-bg`, `error/error-bg`, `info/info-bg` 4.5:1, `focus/raised` 3:1을 실제 CSS 토큰 값으로 검사한다. `--tertiary`는 경계값(4.50) 문제로 `#697782` → `#56697a`로 조정했다.
- `test/accessibility.test.js`는 셸·시장 테이프·상승/하락 병기·대체 표·잠금 분리·확인 시트·검색 combobox·반응형 규칙을 정적으로 검사한다.

## 7. 남은 차단 조건

- 실제 시세 공급자·재배포권·SLA·`staleAfter`
- 결제대행사·가격·자동 갱신·환불 정책과 매수·매도 표현의 법무 승인
- 우선주·스팩·리츠 포함 여부, 자연어 스크리너 도입 여부
- 실제 프리미엄 신호 공개 시점과 성과 산정 기준
