# Decision Log

상태가 확정되거나 변경될 때 작성한다. `제안`은 구현 기준이 아니며, `승인` 행만 정본 계약으로 취급한다.

| ID | 주제 | 결정 | 상태 | 근거/영향 | 담당 |
|---|---|---|---|---|---|
| DEC-001 | 제품 범위 | 국내 개별주식 고객용 반응형 웹; 주문·계좌·앱·외부 알림·ETF/ETN/펀드 제외 | 승인 전 확정 | `00-brief`, `02-prd` | PO |
| DEC-002 | API 정본 | planning README의 `/stocks/{ticker}/flows`, `/stocks/{ticker}/signals`, `/watchlists`, `/subscriptions/*` 경로 사용 | 제안 | 기존 상세 API와 충돌 해소 필요 | 기술 리드 |
| DEC-003 | 신호 공개 | 실제 방향·근거·버전·정확한 이력은 활성 구독자만; 비구독자는 방향을 유추할 수 없는 잠금 미리보기만 | 제안 | 필드·필터·정렬·캐시 권한 통합 필요 | PO/법무 |
| DEC-004 | 신호 식별 | MVP는 종목당 기본 공개 전략 1개(`strategy_key=default`)로 시작하고 다중 전략 확장 필드를 둠 | 제안 | `signals_current` 유일성·이벤트 커서 결정 | 알고리즘/기술 |
| DEC-005 | 이벤트 커서 | 스트림별 `(streamKey, epoch, sequence)` 사용; gap이면 resync/replay | 제안 | 종목 혼합 스트림의 순서 오류 방지 | 기술 리드 |
| DEC-006 | 장애 상태 | 엔진이 스스로 장애 상태를 기록하지 못하므로 watchdog 또는 조회 시 effective-status 판정 필요 | 미결정 | `lastHeartbeatAt`, `lastEvaluatedAt`, staleAfter 필요 | 기술/운영 |
| DEC-007 | 구독 회수 | 환불·만료·정지·로그아웃 시 열린 스트림도 회수; 목표 최대 지연을 별도 승인 | 미결정 | 게이트웨이 revoke 전파·캐시 무효화 필요 | 보안/결제 |
| DEC-008 | 성과·AI 점수 | 성과 대시보드, AI 점수, 자연어 스크리너, 저장 필터는 MVP 확정 전까지 후속/비활성 | 제안 | 기존 와이어프레임과 PRD 범위 충돌 | PO |
| DEC-009 | 보존·삭제 | 데이터별 보존 기간·법적 근거·삭제·백업 재적용 표를 법무/개인정보 담당자가 승인 | 미결정 | 원본 payload와 분석 로그의 장기 보관 위험 | 개인정보 담당 |
| DEC-010 | 디자인 방향 | 신뢰 중심 금융 리서치 터미널, 라이트 기본, 데이터 상태·근거·기준 시각 우선 | 승인 | `06-design-spec` 디자인 게이트 결과 | 제품 |
| DEC-011 | 디자인 토큰 | 의미 색상·Pretendard 폴백·4px 간격·tabular figures·reduced motion 기준을 구현 기준으로 사용 | 승인 | `06-design-spec` 토큰 기준·접근성 수용 기준 | 디자인/기술 |
| DEC-012 | 반응형·상태 | 데스크톱 다중 열, 모바일 한 열/하단 탭, 권한·신호·신선도·연결·작업 상태를 분리 | 승인 | `05-wireframe-spec`, `06-design-spec`, `04-user-flow` | 제품/디자인 |
| DEC-013 | 디자인 완료 범위 | 디자인 명세·상태·프로토타입 경로·추적표를 구현 핸드오프 기준으로 확정. 공급자·법무·결제·알고리즘 정책은 출시 차단으로 유지 | 승인 | `06-design-spec` 8~10절 | 제품 |
| DEC-014 | replay 검증 경로 | sandbox에서 `GET /api/v1/stream/replay`로 연속 이벤트를 복구하고, 보존 범위 밖 cursor는 전체 snapshot으로 fallback | 제안 | `STREAM-001` 구현·최종 OpenAPI 승인 전 검증용 | 기술 리드 |
| DEC-015 | 전면 UI/UX 리디자인 | `MARKET TAPE / 장중 리서치 데스크`: 상단 명령 바·시장 테이프·잉크 네이비 chrome·paper canvas·한국 시장 상승/하락 색상·시장 레이더·movers 중심 화면. API/DB/권한 계약은 유지 | 승인 (사용자, 2026-09-19) | 기존 카드형 라이트 터미널의 주식 도메인성·정보 위계 부족을 해결. `UI-REDESIGN-001` 구현 착수, 상용 출시는 별도 blocker | 제품/디자인 |
| DEC-016 | 모바일 고정 요소 | 모바일 market tape는 문서 흐름의 가로 스크롤 rail로 두고, 종목 상세 탭은 sticky를 해제한다. 줄바꿈되는 명령 바·상단 고정 chrome과 콘텐츠가 겹치지 않도록 한다 | 승인 (구현 결정, 2026-09-19) | 320px·375px에서 horizontal page overflow와 sticky overlap을 방지. tape/table 내부 스크롤은 유지 | 디자인/기술 |
| DEC-017 | 리서치 기반 재설계 | `EVIDENCE TAPE / 근거 우선 리서치 데스크`: 반복 카드 대신 Market Pulse→Movers→Flow/Table, 종목은 Stock Identity→Quote Lead→ChartWithTable→Evidence Panels. paper canvas·ink chrome·강한 display type·tabular figures·규칙선·실제 데이터 그래픽을 사용 | 제안 (superseded, 2026-09-19) | 국내·글로벌 주식 UX 및 AOI Alpha 비교 조사 결과. AOI의 hero/외형과 Bloomberg/TradingView 클리셰는 복제하지 않고, 근거·신선도·판단 흐름을 제품 고유 언어로 만든다 | 제품/디자인 |
| DEC-018 | Chainx-inspired 시각 전환 | Chainx – Stock Investment의 상단 market ticker·데스크톱 sidebar·강한 KPI·dark widget grid·chart toolbar·purple interaction accent를 참고해 `Chainx-inspired EVIDENCE DESK / 다크 투자 리서치 커맨드센터`로 전환한다. Chainx의 포트폴리오·잔고·매수 기능은 가져오지 않으며, 국내 개별주식·근거·freshness·권한 계약과 상승 레드/하락 블루를 유지한다 | 승인 (사용자, 2026-09-20) | 기존 light/paper 화면이 사용자의 기대보다 촌스럽다는 피드백. 원본 디자인의 자산·카피 복제는 금지하고 정보 구조와 시각 원칙만 재해석한다 | 제품/디자인 |
| DEC-019 | staging 배포 대상 | Neon 신규 프로젝트 `stock-research`(project `flat-surf-27471705`, AWS Asia Pacific 1 Singapore)를 생성하고, 기존 `market-dashboard` Pages 프로젝트는 보존한다. 단기 검증은 Cloudflare Container + Node sandbox runtime을 사용하며 Neon JSON snapshot은 staging 전용으로 제한한다 | 승인 (사용자, 2026-09-20) | 현재 Node `http`/SSE runtime을 Pages에 그대로 올리면 API가 동작하지 않는다. 실제 provider·auth·payment·domain repository가 승인되기 전 production 배포를 금지한다 | 기술/운영 |

## 결정 등록 규칙

- 상태는 `제안 → 검토중 → 승인` 또는 `제안 → 폐기`로 이동한다.
- 승인자는 역할과 날짜를 남긴다.
- 결정 변경 시 기존 결정은 삭제하지 않고 새 행으로 supersede한다.
