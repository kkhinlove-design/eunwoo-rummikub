# 은우의 루미큐브 (eunwoo-rummikub)

## 프로젝트 개요
은우와 친구들이 온라인으로 함께 즐기는 루미큐브 보드게임 웹앱.
eunwoo-sudoku와 동일한 기술 스택 및 아키텍처 패턴 사용.

## 기술 스택
- **프레임워크**: Next.js 15 (App Router) + TypeScript
- **스타일링**: Tailwind CSS
- **DB/실시간**: Supabase (PostgreSQL + Realtime)
- **배포**: Vercel
- **패키지 매니저**: npm

## 프로젝트 구조
```
src/
├── app/
│   ├── page.tsx              # 메인 (닉네임/캐릭터 선택)
│   ├── lobby/page.tsx        # 로비 (방 생성/참가)
│   ├── game/[roomId]/page.tsx # 게임 플레이
│   └── layout.tsx
├── components/
│   ├── Tile.tsx              # 타일 컴포넌트
│   ├── MeldSet.tsx           # 세트(런/그룹) 컴포넌트
│   ├── PlayerHand.tsx        # 손패 영역
│   ├── GameBoard.tsx         # 테이블(보드) 영역
│   ├── PlayerInfo.tsx        # 플레이어 정보 표시
│   ├── GameControls.tsx      # 뽑기/되돌리기/턴종료 버튼
│   └── CharacterSelect.tsx   # 캐릭터 선택 화면
├── lib/
│   ├── supabase.ts           # Supabase 클라이언트
│   ├── game-logic.ts         # 순수 게임 로직 (검증, 점수 등)
│   ├── tile-utils.ts         # 타일 생성, 셔플
│   └── realtime.ts           # Supabase Realtime 훅
└── types/
    └── game.ts               # TypeScript 타입 정의
```

## 게임 규칙 명세

### 타일 구성
- 4색 (빨강, 파랑, 주황, 검정) × 숫자 1~13 × 2세트 = 104장
- 조커 2장 → 총 106장

### 유효한 세트
1. **런 (Run)**: 같은 색, 연속 숫자 3장 이상 (예: 빨강 3,4,5)
2. **그룹 (Group)**: 다른 색, 같은 숫자 3~4장 (예: 빨강5, 파랑5, 검정5)
3. 조커는 어디든 대체 가능

### 게임 흐름
1. 각 플레이어 14장씩 배분
2. 턴마다: 타일 내려놓기 OR 풀에서 1장 뽑기
3. **첫 등록**: 자기 손패만으로 30점 이상의 세트를 만들어야 함
4. 첫 등록 이후: 기존 테이블의 세트를 자유롭게 재조합 가능
5. 턴 종료 시 테이블 위 모든 세트가 유효해야 함
6. 손패를 모두 내려놓으면 승리

### 점수 계산 (벌점)
- 패배자: 남은 타일 숫자 합산 (조커 = 30점)
- 승리자: 0점

## 온라인 멀티플레이 설계

### 게임 상태 동기화
- 방장(host)이 타일 풀을 생성하고 배분
- 게임 상태는 Supabase `rooms` 테이블의 `game_state` JSONB에 저장
- 턴 변경, 보드 변경 시 Supabase Realtime으로 실시간 동기화
- 각 플레이어의 손패는 자기만 볼 수 있도록 `room_players.hand` JSONB에 분리 저장

### 턴 관리
- `rooms.current_turn` = 현재 턴 플레이어의 player_id
- 클라이언트에서 턴 종료 시 서버에 유효성 검증 후 다음 플레이어로 전환
- 턴 타이머 선택적 적용 (60초/90초/무제한)

### 방 코드 시스템
- 4자리 영문 대문자 코드 (예: ABCD)
- 친구에게 코드를 공유하여 참가

## 개발 규칙

### 코드 컨벤션
- 한국어 주석 사용
- 컴포넌트는 기능별로 분리
- 게임 로직(lib/)과 UI(components/)는 분리
- 순수 함수 위주로 게임 로직 작성 (테스트 용이)

### 상태 관리
- 서버 상태: Supabase (rooms, room_players 테이블)
- 클라이언트 상태: React useState (드래그, 선택, UI 상태)
- 실시간 동기화: Supabase Realtime subscription

### 중요 제약사항
- RLS는 공개 정책 (아이들 게임이므로 간단하게)
- 인증 없음 (닉네임 + 이모지만으로 식별)
- ₩0/월 운영비 목표 (Supabase Free, Vercel Free)

## 빌드/실행
```bash
npm install
npm run dev     # 개발 서버 (http://localhost:3000)
npm run build   # 프로덕션 빌드
```

## Supabase 설정
1. Supabase 프로젝트 생성
2. SQL Editor에서 migration.sql 실행
3. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 설정
4. Realtime 활성화 확인
