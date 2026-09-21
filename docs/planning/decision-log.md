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
| DEC-010 | 디자인 방향 | 신뢰 중심 금융 리서치 터미널, 데이터 상태·근거·기준 시각 우선 | 승인 (시각 방향은 DEC-023으로 갱신) | `06-design-plan`, `06-design-spec` | 제품 |
| DEC-011 | 디자인 토큰 | 의미 색상·Pretendard 폴백·4px 간격·tabular figures·reduced motion 기준을 구현 기준으로 사용 | 승인 | `06-design-spec` 토큰 기준·접근성 수용 기준 | 디자인/기술 |
| DEC-012 | 반응형·상태 | 데스크톱 다중 열, 모바일 한 열/하단 탭, 권한·신호·신선도·연결·작업 상태를 분리 | 승인 | `05-wireframe-spec`, `06-design-spec`, `04-user-flow` | 제품/디자인 |
| DEC-013 | 디자인 완료 범위 | 디자인 명세·상태·프로토타입 경로·추적표를 구현 핸드오프 기준으로 확정. 공급자·법무·결제·알고리즘 정책은 출시 차단으로 유지 | 승인 | `06-design-spec` 8~10절 | 제품 |
| DEC-014 | replay 검증 경로 | sandbox에서 `GET /api/v1/stream/replay`로 연속 이벤트를 복구하고, 보존 범위 밖 cursor는 전체 snapshot으로 fallback | 제안 | `STREAM-001` 구현·최종 OpenAPI 승인 전 검증용 | 기술 리드 |
| DEC-015 | 전면 UI/UX 리디자인 | 기존 결정을 DEC-023의 `SIGNALLAB RESEARCH DESK V2`로 supersede | 폐기 (DEC-023으로 대체) | paper canvas와 dark chrome 혼합을 유지하지 않음 | 제품/디자인 |
| DEC-016 | 모바일 고정 요소 | 모바일 market tape는 문서 흐름의 가로 스크롤 rail로 두고, 종목 상세 탭은 sticky를 해제한다. 줄바꿈되는 명령 바·상단 고정 chrome과 콘텐츠가 겹치지 않도록 한다 | 승인 (구현 결정, 2026-09-19) | 320px·375px에서 horizontal page overflow와 sticky overlap을 방지. tape/table 내부 스크롤은 유지 | 디자인/기술 |
| DEC-017 | 리서치 기반 재설계 | `EVIDENCE TAPE` 구조 아이디어는 DEC-023의 wireframe으로 흡수 | 폐기 (DEC-023으로 대체) | Market Pulse→Movers→Flow/Table 및 Stock Identity→Quote→Evidence 흐름은 유지하되 시각 시스템을 교체 | 제품/디자인 |
| DEC-018 | Chainx-inspired 시각 전환 | 외부 제품을 기준명으로 삼지 않고 `SIGNALLAB RESEARCH DESK V2` 자체 디자인 시스템으로 재정의 | 폐기 (DEC-023으로 대체) | 특정 제품 복제가 아닌 금융 리서치 도메인과 사용자 작업에 근거한 독자 시스템을 사용 | 제품/디자인 |
| DEC-019 | staging 배포 대상 | Neon 신규 프로젝트 `stock-research`(project `flat-surf-27471705`)를 생성하고, 기존 `market-dashboard` Pages 프로젝트는 보존한다. 단기 검증은 Cloudflare Container + Node sandbox runtime을 사용하며 Neon JSON snapshot은 staging 전용으로 제한한다 | 폐기 (DEC-021로 대체) | 프로젝트를 삭제했고 Cloudflare Containers도 Workers Paid blocker로 중단했다. 실제 provider·auth·payment·domain repository가 승인되기 전 production 배포를 금지한다 | 기술/운영 |
| DEC-020 | Cloudflare plan gate | Workers Free plan에서는 Cloudflare Containers API가 차단되므로, Workers Paid plan 및 비용/instance limit 승인 전에는 staging URL을 발행하거나 static Pages로 우회하지 않는다 | 보류 (Cloudflare 계정) | local Docker image build와 Wrangler Worker upload는 가능했지만 `/containers/me`가 `Unauthorized: ... requires the Workers Paid plan`으로 거부됨 | 기술/운영 |
| DEC-021 | Neon staging 폐기 및 다음 배포 방향 | 신규 Neon `stock-research` staging은 삭제하고, 다음 검증 스택은 Vercel + Supabase를 우선 검토한다. REST·권한·freshness·cursor 계약은 유지하며 Realtime 직접 구독과 SSE compatibility adapter 중 하나를 구현 전에 승인한다 | 제안 (세부 승인 대기) | Cloudflare Containers의 Paid plan blocker를 피하고 Vercel serverless/Supabase managed Postgres·Realtime 조합을 검토한다. 기존 `shiftnote-poc`·`sujibgi`는 보존 | 제품/기술 |
| DEC-022 | 초기 stream transport | 기존 클라이언트·API 계약을 보존하기 위해 staging 1차 구현은 Vercel catch-all handler의 SSE compatibility path로 진행한다. Vercel 실행시간·동시성·재연결 한계를 검증하고, 장기 multi-instance realtime은 Supabase Realtime 직접 구독 또는 별도 stream host로 재검토한다 | 승인 (staging 한정) | `streamKey/epoch/sequence`, cursor, replay/resync, entitlement revoke 계약을 우선 보존한다. 이 결정은 production SSE 지속성을 보장하지 않으며 STREAM-002의 검증을 차단 조건으로 둔다 | 제품/기술 |
| DEC-023 | `SIGNALLAB RESEARCH DESK V2` 전면 리디자인 | 기존 화면을 정리하지 않고 시각 스타일·레이아웃·IA 표현·컴포넌트·상태·반응형 UX를 전면 교체한다. 하나의 어두운 금융 리서치 캔버스, sidebar/topbar/market rail, quote lead, evidence panels, 모바일 작업 우선순위를 사용한다. API·DB·권한 계약은 유지한다 | 승인 (사용자, 현재 세션) | 사용자가 기존 디자인의 스타일·레이아웃·UI·UX 전반을 저품질로 평가하고 전면 재설계를 승인함. `UI-REDESIGN-001` 구현 착수 | 제품/디자인 |
| DEC-024 | 1차 CSS QA 교정 | 모바일 하단 fixed overlay를 제거하고 market rail 아래 sticky 작업 탭으로 배치한다. 공통 section gap·검색 입력·connection banner·flow bar를 명시하고, movers의 모바일 순위·종목·가격·등락률·신선도 핵심 열을 compact grid로 모두 보존한다 | 승인 (구현 교정, 2026-09-21) | 실제 desktop/mobile 캡처에서 기본 input 노출, 여백 리듬 단절, 콘텐츠를 가리는 nav, 모바일 핵심 열 제거를 확인함. `.team/design/*-audit.md`와 `UI-REDESIGN-001`을 갱신 | 제품/디자인 |

## 결정 등록 규칙

- 상태는 `제안 → 검토중 → 승인` 또는 `제안 → 폐기`로 이동한다.
- 승인자는 역할과 날짜를 남긴다.
- 결정 변경 시 기존 결정은 삭제하지 않고 새 행으로 supersede한다.
