# Stock UX Research

2026-09-19 KST 기준 국내·글로벌 주식 리서치 제품과 AOI Alpha를 비교한 조사 자료다. 각 문서는 확인된 사실, 해석, 제안, 미확인 사항을 구분하고 가능한 한 공식 1차 출처를 인용한다.

| 문서 | 범위 | 상태 |
|---|---|---|
| [stock-ux-korean.md](./stock-ux-korean.md) | Toss Securities, Kiwoom Hero, Samsung POP/mPOP, Mirae Asset M-STOCK | 완료 |
| [stock-ux-global.md](./stock-ux-global.md) | TradingView, Koyfin, Bloomberg Terminal, Seeking Alpha, Robinhood | 완료 |
| [stock-ux-visual-gap.md](./stock-ux-visual-gap.md) | AOI Alpha와 현재 프로젝트 시각 격차 | 완료 |

## 공통 결론

- 시장 개요는 숫자 나열보다 시장 국면·폭·수급·근거가 연결되어야 한다.
- quote에는 값만 아니라 거래소/공급자/source/asOf/freshness를 붙여야 한다.
- 차트와 표를 대체 관계가 아니라 함께 제공해야 한다.
- 반복 카드와 marquee ticker를 피하고, 사용자 판단으로 이어지는 rail을 설계해야 한다.
- 국내 상승·하락 색상은 텍스트·기호·상태 라벨과 함께 사용한다.
- 실제 Premium 신호 방향이나 근거를 잠금 상태에서 유추하게 만들면 안 된다.

## 다음 산출물

이 조사 결과를 바탕으로 `docs/research/stock-design-synthesis.md`에서 새 visual direction, 정보 구조, 시장판/종목 상세 wireframe, 컴포넌트·상태·반응형 규칙을 통합한다. 통합안은 코드 구현 전 사용자 승인을 받는다.
