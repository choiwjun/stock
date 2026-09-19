# 05. Wireframe Specification

## 문서 상태

화면 구조 정본이다. 기존 `MARKET TAPE` 구현 wireframe을 baseline으로 두고, 리서치 기반 `EVIDENCE TAPE` wireframe은 사용자 지시로 구현에 반영되었다(`docs/design/evidence-tape-ui-system.md`). 고해상도 시각 디자인과 실제 카피는 `06-design-plan.md`·`06-design-spec.md` 기준을 따른다. 아래 상태와 P0 경로는 생략할 수 없다.

## 0. 리서치 기반 `EVIDENCE TAPE` wireframe (구현 반영)

### 시장판 desktop

```text
[Command Bar: 브랜드 | 시장 | 스크리너 | 관심종목 | 검색 | 계정]
[Market Tape: 장 상태 | KOSPI | KOSDAQ | 거래대금 | freshness | 기준 시각]
[시장 제목 + 장 세션 + Freshness Rail]
[Market Pulse: KOSPI/KOSDAQ | 상승·보합·하락 breadth | 거래대금·수급]
[Movers: 상승 | 하락 | 거래량 상위 | 관심종목]
[시장 흐름 표 + sparkline/table 전환]
[검색·구조화 스크리너] [출처·산정 기준·고지]
```

### 종목 상세 desktop

```text
[Stock Identity: 종목명·코드·거래 상태·관심]
[Freshness Rail: 상태·asOf·receivedAt·source]
[Quote Lead: 현재가·등락·거래량·세션 고저]
[Section Index: 가격 | 수급 | 뉴스 | 재무 | 신호]
[ChartWithTable: 차트 + 동일 데이터 표]
[Evidence Panels: 수급 | 뉴스·공시 | 재무 | 신호 권한 상태]
[출처·산정 기준·위험 고지]
```

### 모바일

- 첫 화면에서 시장은 장 상태→기준 시각→KOSPI/KOSDAQ→breadth→movers 3개 순으로 보인다.
- 종목은 식별→quote→차트/표→근거 섹션 순으로 세로 배치한다.
- 내부 tape/table만 가로 스크롤하며, 페이지 전체 overflow는 허용하지 않는다.
- 긴 desktop 카드·sticky detail tab은 사용하지 않는다.

### 공통 상태

`loading`, `empty`, `error`, `stale`, `unavailable`, `degraded`, `permission-locked`, `keyboard-focus`를 각 wireframe에 별도 표시한다. 실제 Premium 방향·근거를 잠금 상태에서 유추하게 하는 blur·marker·색상은 사용하지 않는다.

## 1. 공통 프레임 — `MARKET TAPE` 제안

- 데스크톱: 64px 명령 바 + 40px 시장 테이프 + 최대 1440px 리서치 캔버스. 긴 사이드바 대신 상단 작업 내비게이션을 사용한다.
- 모바일: 압축된 상단 바 + 가로 시장 테이프 + 1열 콘텐츠 + 하단 주요 탭.
- 기본 표면은 잉크 네이비/블랙 캔버스, 앱 프레임·데이터 rail·widget panel은 명도 레이어로 분리한다. Chainx처럼 카드·위젯 밀도를 높이되, 얇은 규칙선·섹션 헤더·밀도 차이로 위계를 만든다.
- 모든 데이터 블록은 `asOf`, `dataStatus`, source 또는 출처 표시를 가지며 공통 freshness rail에서 먼저 요약한다.
- 로딩·empty·error·stale·permission-locked·degraded 상태는 정상 상태와 별도로 와이어프레임에 표시한다.

### 시장 화면 wireframe

```text
[명령 바: 브랜드 | 시장 시그널 스크리너 관심종목 | 검색 | 계정]
[시장 테이프: 장 상태 | KOSPI | KOSDAQ | 거래대금 | freshness]
[시장 레이더 / 기준 시각 / 전체 movers 보기]
[지수 2개] [상승·하락 breadth] [거래대금·수급]
[급등] [급락] [거래량 상위] [신호 레이더]
[전체 시장 흐름: 밀도 높은 표 + 미니 sparkline]
```

### 종목 화면 wireframe

```text
[종목 식별·관심 추가] [장 상태·freshness]
[현재가·등락·거래량] [세션 고저·52주 범위]
[가격 흐름 차트 / 기간·표 전환] [신호 도시에 / 권한 상태]
[수급] [뉴스] [재무] [신호 이력]
[출처·산정 기준·위험 고지]
```

## 2. 시장·검색

시장 화면은 장 상태와 기준 시각, 시장 요약, 상승/하락/거래량/수급 이상, 신호 잠금/발생 요약 순서로 배치한다. 검색은 종목명·코드·거래소·보안 유형·거래 상태를 표시하고 결과 없음과 검색 오류를 분리한다.

## 3. 종목 상세

```text
[종목 식별 / 관심 추가·삭제 / 데이터 상태]
[현재가 / 등락 / 거래량 / asOf / source]
[기간·지표 선택 기본 차트 + 텍스트 데이터 표]
[신호 요약: 잠금 또는 구독자 상태]
[수급] [뉴스] [재무] [신호 이력]
[출처 / 산정 기준 / 위험 고지]
```

관심 추가 성공·중복·저장 실패·로그인 필요를 각 상태로 설계한다. 신호 잠금 화면은 실제 방향·정확한 발생 시각·근거를 노출하지 않는다.

## 4. 실시간 시그널

### 구독자

- 상단: 연결 상태, 마지막 정상 시각, 신선도
- 필터: 종목·상태·강도 등 권한이 허용된 구조화 조건
- 행/카드: 종목·방향·강도·발생/발행 시각·유효기간·버전
- 확장: 당시 근거, 평가 revision 참조, 위험 고지

### 비구독자

- 잠금 상태와 제공 가치만 표시
- 실제 방향·강도·정확한 이벤트 시각·근거를 필터·정렬·집계·차트 마커에서도 노출하지 않음
- 로그인 필요와 구독 필요를 구분

## 5. 스크리너

조건 영역, 활성 조건 칩, 결과 기준 시각, 결과 표, 결과 없음/조건 오류/데이터 지연을 포함한다. MVP는 사전 승인된 구조화 조건만 제공한다. 자연어 입력과 저장 필터는 화면에 만들지 않는다.

## 6. 관심목록

- empty: 추가 방법과 검색 CTA
- populated: 종목명·현재가·등락·신선도·마지막 갱신
- saving/saved/duplicate/error 상태
- 삭제 확인·삭제 완료·삭제 실패 상태
- 모바일에서 재방문·삭제가 하단 탭에서 2단계 이내

## 7. 구독·계정

구독 페이지는 상품 가치, 가격, 자동갱신, 환불·해지 정책, 결제 상태를 보여준다. 계정/구독 상태 화면에는 active, pending, cancellation-scheduled, refund-pending, payment-failed, expired를 분리한다. 각 상태에 현재 권한·종료 시각·다음 행동을 표시한다.

## 8. 공통 상태와 반응형

- Loading: 구조를 유지하는 스켈레톤, 레이아웃 이동 최소화
- Empty: 원인과 다음 행동
- Error: 오류 ID·재시도·문의
- Stale: 마지막 정상 시각과 사용 주의
- Reconnect: 백오프 중·재연결 성공·복구 불가
- Permission: 로그인 필요·구독 필요·회수됨 분리
- 모바일: 표의 우선 열/카드/가로 스크롤을 컴포넌트별로 결정
- 320px 폭, 키보드, 터치, safe-area를 검증

## 9. 필수 프로토타입 경로

1. 시장 → 검색 → 종목 상세 → 관심 추가 → 관심목록 재방문 → 삭제
2. 종목 상세 → 잠금 신호 → 구독 → 결제 처리중 → 활성 신호
3. 구독 → 실시간 시그널 → stale → replay/resync → 권한 회수
4. 스크리너 → 구조화 조건 → 결과 → 종목 상세
5. 로그인 만료 → 재로그인 → 원래 작업 복귀
6. 결제 실패/해지 예정/환불 처리중 → 상태 이해·복구
