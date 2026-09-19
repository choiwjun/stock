# Database migration

`migrations/001_initial.sql`은 `docs/planning/09-database-design.md`의 PostgreSQL 논리 모델을 실제 제약조건으로 내린 초기 migration입니다.

- 현재 상태와 append-only 신호 이벤트·revision을 분리합니다.
- `(stream_key, epoch, sequence)`와 `(ticker, strategy_key)` 유일성을 DB에서 보장합니다.
- 이벤트 당시 evidence snapshot, outbox, consumer checkpoint를 보존합니다.
- 사용자·관심목록·구독·entitlement·결제 이벤트의 FK/유일성/상태 제약을 포함합니다.
- 세션은 원문 토큰이 아니라 `token_hash`·`csrf_token_hash`와 만료/폐기 시각만 저장하도록 분리합니다.
- 결제 이벤트는 검증된 최소 필드와 `payload_hash`로 동일 event ID의 payload 충돌을 판정하며, 원문 provider payload를 무제한 저장하지 않습니다.
- `security_type`, 가격·보존·RPO/RTO·provider 정책은 아직 출시 승인 전입니다.

운영 적용 전에는 반드시 expand → backfill/verify → switch → contract 절차와 staging 복구 리허설을 수행해야 합니다. 이 저장소에는 PostgreSQL 서버가 연결되어 있지 않으므로 이번 검증은 정적 migration 불변식 검사까지입니다.
