# 12. Coding Convention

## 문서 상태

스택 확정 전 공통 규칙 정본이다. 언어·프레임워크 결정 후 도구 버전, 명령, config 예시를 같은 변경에서 채운다. 구현자는 문서에 없는 enum·경로·권한을 임의로 추가하지 않는다.

## 1. 공통 원칙

- 도메인 용어는 `CONTEXT.md`와 planning 정본을 따른다.
- 제품 규칙·권한·신호 상태를 UI 문자열/클라이언트 숨김에만 구현하지 않는다.
- 외부 입력·공급자 응답·웹훅은 경계에서 schema 검증한다.
- 시간대·정밀도·단위·sequence scope를 명시한다.
- API DTO·DB 모델·화면 view model을 분리한다.
- 보안·법무·개인정보 결정은 코드 주석이 아니라 승인 문서와 테스트에 연결한다.

## 2. 모듈 경계

```text
src/
  app/                 route·bootstrap
  domain/              instrument·quote·signal·subscription rules
  application/         use case·authorization·orchestration
  infrastructure/      DB·provider·payment·message adapters
  presentation/        screen·component·state mapping
  shared/              types·validation·logging
  tests/
```

`domain`은 외부 프레임워크와 결합하지 않는다. provider SDK는 adapter 뒤에 둔다. stream gateway와 entitlement 권위 모듈의 계약을 공유한다.

## 3. 프레젠테이션 구현 규칙 — `SIGNALLAB RESEARCH DESK V2`

- 디자인 토큰은 CSS custom property로 중앙화하고 화면별 임의 색상/반경/간격을 만들지 않는다.
- 시장 의미색은 `rise`, `fall`, `live`, `stale`, `error` 의미 토큰으로만 사용하며 텍스트·기호·수치 부호를 함께 렌더링한다.
- 데이터 수치는 tabular figures를 사용하고, 가격/등락/거래량의 단위를 시각적으로 생략하지 않는다.
- market tape·quote strip·movers table·dossier·permission gate는 상태 계약을 가진 독립 렌더 함수/컴포넌트로 유지한다.
- 차트·sparkline에는 시각화가 꺼져도 읽을 수 있는 텍스트 요약과 표/상세 데이터 경로를 제공한다.
- 모든 `data-action`은 키보드로 실행 가능해야 하며, 장식용 live update는 `aria-hidden`으로 숨긴다.
- 새 UI 상태를 추가할 때 planning 문서의 loading/empty/error/stale/permission/degraded 상태표를 먼저 갱신한다.

## 4. 이름·타입

- 변수/함수: 의미 있는 camelCase 또는 해당 언어 표준
- 타입/컴포넌트: PascalCase
- DB: snake_case, 프로젝트 전체 단복수 규칙 통일
- 이벤트: `subject.action.vN`; `eventId`, `streamKey`, `epoch`, `sequence` 필수
- 중앙 타입: `Direction`, `SignalStatus`, `DataStatus`, `EntitlementStatus`, `ErrorCode`
- `data`, `temp`, `misc`와 무의미한 `status` 단독 필드 금지
- nullable과 optional, `asOf`와 `receivedAt`, `occurredAt`와 `publishedAt` 구분

## 5. API·실시간

- 경로는 `/api/v1` 정본을 사용한다.
- OpenAPI/JSON Schema에서 타입·필수·권한·오류를 생성/검증한다.
- `requestId`, `traceId`, `eventId`, cursor를 로그와 테스트에 보존한다.
- mutation은 `Idempotency-Key`, 목록은 opaque cursor를 사용한다.
- 동일 `streamKey/epoch`에서만 sequence를 비교하고, 중복·역순·gap·epoch 변경을 명시적으로 처리한다.
- REST·stream·reconnect·topic add마다 entitlement를 검증한다.
- 권한 회수 실패 시 deny-by-default; 버퍼·캐시도 권한을 확인한다.

## 6. DB·마이그레이션

- 모든 변경은 버전 관리 migration
- expand → backfill/verify → switch → contract 순서
- FK·UNIQUE·CHECK·ownership 불변성을 DB에도 선언
- signal/payment event는 append-only, 정정은 새 event
- 대량 backfill·index 생성의 lock/online 영향과 실패 복구 문서화
- PostgreSQL 제약 종류별 `NOT VALID`, 사전 unique index, `CREATE INDEX CONCURRENTLY` 실행 맥락을 migration runner에 맞춤
- migration마다 up/retry/rollback 또는 복구 절차와 데이터 검증 query 제공

## 7. UI·접근성

- 모든 핵심 컴포넌트는 loading/empty/error/stale/degraded/permission-locked/focus 상태를 정의
- 색상만으로 상승·하락·오류를 표현하지 않음
- 차트는 텍스트 요약과 데이터 표/탐색 방법 제공
- 실시간 업데이트는 필요한 경우에만 polite live region
- 모달/바텀시트 포커스 이동·복귀, 오류 입력 연결
- 320px·확대/리플로·키보드·터치·reduced motion 검증

## 8. 로그·보안

- 토큰·카드번호·민감 provider payload·원문 개인정보 로그 금지
- 구조화 로그에 correlation/request/event/stream 키와 민감하지 않은 결과 코드만 기록
- 사용자 소유권·entitlement 판정 결과와 거부 사유를 감사 가능한 형태로 남김
- secrets manager, dependency/container/secret scan, rate limit을 CI/운영에 연결

## 9. 테스트 피라미드

- 도메인: 상태 전이·유효기간·권한·소유권 단위 테스트
- 계약: OpenAPI·JSON Schema·오류 envelope
- 통합: transaction/outbox, DB constraint, provider adapter
- 보안: IDOR, field/filter/sort/aggregation leakage, CSRF, Origin, revoke
- 이벤트: 중복·역순·gap·replay 만료·epoch·재시작
- 결제: 서명·idempotency·pending·환불·역순·권위 재조회
- UI/E2E: P0 6개 경로, 반응형, 키보드·스크린리더 핵심 작업
- HTTP process-spawn 회귀는 고정 포트·startup timeout 경합을 피하기 위해 `npm test`에서 Node test concurrency 1로 실행한다.

## 10. 도구 기준

스택 확정 후 아래 명령과 버전을 고정한다.

```text
format        # 포맷 검사
lint          # 정적 규칙
typecheck     # 타입 검사
unit          # 단위/도메인 테스트
contract      # OpenAPI/event schema
integration   # DB/provider/transaction
security      # dependency/secret scan
e2e           # P0 브라우저 흐름
```

CI는 로컬과 같은 lockfile·runtime 버전을 사용하고, 실패 시 로그·재현 명령을 출력한다.

## 11. 리뷰·변경

PR은 목적, PRD/API/DB/티켓 연결, 테스트, migration/rollback, 권한·보안 영향, 화면 캡처를 포함한다. API·DB·권한·금융 표현 변경은 관련 담당자 리뷰 없이는 병합하지 않는다. 승인되지 않은 기획·디자인 변경을 구현에 섞지 않는다.
