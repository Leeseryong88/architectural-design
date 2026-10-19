# 면적노트 (Myeonjeok Note)

한국 건축사사무소가 인허가용 면적 자료를 준비할 때 **건축도면 PDF의 정보를 자동으로 옮겨 적고, 서로 다른 자료(건축개요·평면도·면적산출표·수동 다각형 측정값)의 면적값을 비교하여 검토 시간을 줄이는 웹 서비스(SaaS MVP)**입니다.

> **중요 원칙**: 본 제품은 PDF만으로 법정 면적이나 법적 적합성을 완전 자동 확정하는 시스템이 아닙니다. 모든 추출값과 산정선 경계, 산입·제외 사유는 설계자가 직접 검토·확정해야 합니다.

---

## 1. 설치 및 로컬 실행 명령

### 1.1 패키지 설치
```bash
npm install
```

### 1.2 가상 도면 PDF 및 한글 임베딩 폰트 생성 (필요 시 재생성)
저장소에는 이미 생성된 가상 도면(`public/demo/sample-architectural-drawings.pdf`)과 OFL 한글 폰트(`public/fonts/NanumGothic-Regular.ttf`)가 포함되어 있습니다. 다시 생성하려면 아래 명령을 실행합니다.
```bash
npm run generate:demo
```

### 1.3 로컬 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:3000`으로 접속합니다.

---

## 2. 데모 모드(`demo`) 실행법 및 데모 자료 사용법

외부 Firebase 프로젝트나 Gemini API 키가 없어도 즉시 전체 워크플로우를 사용할 수 있습니다.

1. `.env.local` 파일이 없거나 `NEXT_PUBLIC_APP_MODE=demo`로 설정된 상태에서 `npm run dev`를 실행합니다.
2. 첫 화면(프로젝트 목록)에 접속하면 **`[예제] 성수동 근린생활시설 신축공사`** 프로젝트가 브라우저 `IndexedDB`에 자동 준비됩니다. (언제든 상단의 **`예제 프로젝트 불러오기 / 초기화 (가상 도면 6p)`** 버튼으로 초기 상태를 복원할 수 있습니다.)
3. 예제 프로젝트에는 직접 생성한 6페이지 가상 건축도면(`public/demo/sample-architectural-drawings.pdf`, SHA-256: `589caea74ffbab277d0b20f36537869893eadb04a50904899057c7938c8b8ded`)과 이에 연결된 고정 추출 fixture가 포함되어 있습니다.
   - **포함된 가상 도면 구성**:
     - `P.1`: 건축개요 (연면적 `785.00 ㎡` 기재 — 면적산출표 `770.00 ㎡`와 **15.00 ㎡ 문서 간 불일치 1건** 포함)
     - `P.2`: 지하 1층 평면도 (`B1 휴게음식점 154.00 ㎡`, `B1 기계/전기실 66.00 ㎡` — **제외 근거 미확인 1건** 포함, `20,000 mm` 축척 보정용 치수 포함)
     - `P.3`: 지상 1층 평면도 (`1F 소매점` 외곽 `300.00 ㎡` 내 `설비샤프트/오픈 20.00 ㎡` 공제 영역 포함 → 순면적 `280.00 ㎡`)
     - `P.4`: 지상 2층 평면도 (`2F 사무소 270.00 ㎡`, `18,000 mm × 15,000 mm`)
     - `P.5`: 주단면도 (지하 1층, 지상 2층 층고 및 최고높이 표시)
     - `P.6`: 층별·용도별 면적산출표 (상세 행·소계·총계 구분 및 합계 `770.00 ㎡`)
4. **데모에서 확인 가능한 흐름**:
   - 왼쪽 패널에서 페이지 분류 수정 및 선택 페이지 예제 추출 결과 불러오기
   - 오른쪽 패널에서 `예제 추출 결과` 후보 클릭 → 중앙 도면에서 근거 위치(`bbox`) 강조 확인 후 **확정·수정·반려**
   - 중앙 캔버스에서 **작업영역 지정 → 두 점 축척 보정(mm/m) → 축척 검산 → 직선 다각형 산정선 작성 → 내부 공제 영역 작성 → 꼭짓점 드래그 이동/추가/삭제 및 실행 취소(Undo)/다시 실행(Redo)**
   - 하단 패널에서 구역별 **A. 문서 기재 면적 / B. 기하 측정 면적 / C. 채택 기준 면적** 비교, 바닥면적·용적률 산입/제외 사유 입력, 실시간 불일치·오류 검사 확인
   - `3. 출력 및 확정본` 탭에서 **검토용 엑셀(.xlsx, 6개 시트)** 및 **검토용 PDF(원본 도면 위 산정선·공제·구역번호·축척·범례 합성)** 즉시 다운로드, 모든 차단 오류 해결 후 **불변 확정본(스냅샷)** 생성 및 재조회
5. **임의 PDF 업로드 시 동작**:
   - 데모 모드에서 사용자가 다른 일반 PDF를 업로드하면 고정 예제 fixture를 억지로 적용하지 않습니다. 수동 면적 측정 및 직접 입력은 그대로 사용할 수 있으며, 실제 AI 추출은 `live` 모드 설정이 필요하다고 안내합니다.

---

## 3. 실제 모드(`live`) 전환 — Firebase 및 Gemini 연결법

환경변수를 입력하면 **코드 수정 없이** 즉시 실제 모드로 전환됩니다.

### 3.1 Firebase 프로젝트 및 인증 제공자 활성화
1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트를 생성합니다.
2. **Authentication** 메뉴로 이동하여 `시작하기`를 클릭한 뒤, **로그인 방법(Sign-in method)** 탭에서 **이메일/비밀번호(Email/Password)** 제공자를 **사용 설정(Enable)** 합니다.
3. **Cloud Firestore** 데이터베이스와 **Firebase Storage** 버킷을 생성합니다.

### 3.2 Firestore·Storage 보안 규칙 및 인덱스 적용 방법
저장소 루트에 포함된 `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`을 Firebase CLI로 배포합니다.
```bash
npm install -g firebase-tools
firebase login
firebase use <YOUR_FIREBASE_PROJECT_ID>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 3.3 Gemini API 연결법
1. [Google AI Studio](https://aistudio.google.com/)에서 Gemini API 키를 발급받습니다.
2. 공식 문서 기준 이미지 입력과 구조화 JSON 출력(`responseMimeType: "application/json"`)을 지원하는 모델 ID를 `GEMINI_MODEL_ID`에 지정합니다.
   - 설정 예시: `GEMINI_MODEL_ID=gemini-2.5-flash` 또는 `GEMINI_MODEL_ID=gemini-2.5-pro`

---

## 4. 환경변수 설명 (`.env.example` 기준)

`.env.example` 파일을 `.env.local`로 복사한 뒤 값을 입력합니다.

- `NEXT_PUBLIC_APP_MODE`: `demo` 또는 `live` (`live` 모드에서 필수 환경변수가 누락되면 데모 모드로 우회하지 않고 설정 오류 화면을 표시합니다.)
- `NEXT_PUBLIC_FIREBASE_API_KEY`: Firebase 웹 앱 API Key
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: Firebase Auth 도메인 (`<project-id>.firebaseapp.com`)
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Firebase 프로젝트 ID
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: Firebase Storage 버킷 (`<project-id>.firebasestorage.app` 또는 `<project-id>.appspot.com`)
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`: 발신자 ID
- `NEXT_PUBLIC_FIREBASE_APP_ID`: 웹 앱 ID
- `FIREBASE_PROJECT_ID`: 서버 전용 Admin SDK 프로젝트 ID (`NEXT_PUBLIC_` 접두사 없음)
- `FIREBASE_CLIENT_EMAIL`: 서비스 계정 이메일 (`NEXT_PUBLIC_` 접두사 없음)
- `FIREBASE_PRIVATE_KEY`: 서비스 계정 비공개 키 (`NEXT_PUBLIC_` 접두사 없음)
  - **줄바꿈 처리 주의**: 로컬 `.env.local`에서는 `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` 형태로 입력합니다. Vercel 환경변수 설정 창에서는 원본 줄바꿈 그대로 붙여넣거나 `\n` 문자열 그대로 넣어도 서버(`src/lib/config/server-env.ts`)에서 `replace(/\\n/g, "\n")`으로 안전하게 처리합니다.
- `GEMINI_API_KEY`: 서버 전용 Gemini API 키 (`NEXT_PUBLIC_` 접두사 없음)
- `GEMINI_MODEL_ID`: 서버에서 호출할 Gemini 모델 ID (예: `gemini-2.5-flash`)

---

## 5. 저장 위치와 모드별 차이

- **데모 모드 (`demo`)**:
  - 프로젝트·동·층·작업영역·산정선·추출 후보·확정본 스냅샷 및 PDF/엑셀 바이너리 전체를 브라우저 `IndexedDB`(`idb-keyval`)에 저장합니다.
  - 새로고침이나 재접속 시에도 로컬 저장 내용이 복원됩니다.
- **실제 모드 (`live`)**:
  - 구조화 데이터는 `Cloud Firestore`에 프로젝트 하위 컬렉션(`buildings`, `floors`, `documents`, `pages`, `regions`, `runs`, `candidates`, `zones`, `snapshots`) 단위로 분리 저장합니다.
  - 원본 PDF(최대 20MB)와 스냅샷 출력 파일(`.xlsx`, `.pdf`)은 인증된 사용자가 `Firebase Storage`(`users/{uid}/projects/{projectId}/...`)에 직접 업로드·관리하며, Vercel 서버 로컬 파일시스템을 영구 저장소로 사용하지 않습니다.
  - AI 요청 횟수 및 동시 작업 제한은 서버 프로세스 메모리가 아닌 Firestore `userAiQuotas/{uid}` 트랜잭션으로 제어합니다.

---

## 6. Vercel 배포 방법 및 실제 도면 확인 순서

### 6.1 Vercel 배포 방법
1. GitHub/GitLab/Bitbucket 저장소에 본 소스코드를 푸시합니다.
2. [Vercel 대시보드](https://vercel.com/)에서 `Add New Project`로 저장소를 연결합니다.
3. `Environment Variables` 섹션에 `.env.example`의 변수들을 등록합니다 (`NEXT_PUBLIC_APP_MODE=live` 및 Firebase·Gemini 설정값).
4. `Deploy`를 실행합니다.

### 6.2 사용자 설정 후 실제 도면으로 확인할 순서
1. 배포된 URL 또는 로컬 서버(`NEXT_PUBLIC_APP_MODE=live`)에 접속하여 이메일 회원가입 및 로그인을 수행합니다.
2. 새 프로젝트를 생성하고 `1. 프로젝트 기본정보·법규` 탭에서 대지면적 및 적용 법규 메모를 입력합니다.
3. `2. 도면 검토 작업실` 탭 왼쪽에서 인허가용 건축도면 PDF(20MB 이하, 30페이지 이하)를 업로드합니다.
4. 분석할 페이지(최대 10페이지)를 선택하고 `선택 페이지 Gemini 분석`을 실행합니다.
5. 오른쪽 패널에 표시된 추출 후보의 도면 근거 위치를 확인하며 `확정·반영`, `수정`, `반려`를 수행합니다.
6. 평면도 페이지에서 `1. 작업영역 지정` → `2. 축척 보정(두 점)` → `3. 구역 산정선 작성` → `4. 내부 공제 작성` 순서로 기하 면적을 측정합니다.
7. 하단 서랍의 `불일치·오류 목록`에서 미검토 후보나 면적 불일치, 제외 사유 누락을 모두 확인·해결합니다.
8. `3. 출력 및 확정본` 탭에서 엑셀 및 산정선 합성 PDF를 출력하고 불변 확정본을 생성합니다.

---

## 7. 알려진 한계 및 초기 지원 제외 범위

- **초기 지원 범위 제한**: PC 웹 환경 기준, 프로젝트당 단일 건축물 동(데이터 모델은 `Building` 독립 엔티티로 분리), PDF 파일당 20MB·30페이지 이하, 분석 1회당 최대 10페이지 선택으로 제한됩니다.
- **미구현·제외 범위 (요구사항 기준)**:
  - DWG 직접 편집, 벽 중심선 완전 자동 추출, 원본 PDF 벡터 선 자동 스냅은 포함하지 않습니다(사용자 작성 꼭짓점 스냅 및 직교 보조만 지원).
  - AI에 의한 도형 경계 자동 확정, 필로티·다락·발코니 등의 법적 제외 여부 자동 확정, 전국 지자체 조례 자동 적용은 수행하지 않습니다.
  - 세움터 직접 접수, 결제, 실시간 공동 편집, 새 PDF 버전에 기존 산정선 자동 이식은 지원하지 않습니다.
  - 별도 백그라운드 큐 워커를 두지 않고 페이지별 서버 요청으로 처리하므로, 분석 도중 브라우저 탭을 닫으면 미완료 페이지는 중단되며 재접속 시 실패/미완료 페이지 재시도로 이어서 실행합니다.

---

## 8. 실행 확인 미수행 안내

이번 작업은 요구사항 원칙에 따라 **소스코드·설정 예시·보안 규칙·데모 자료·실행 안내 문서 작성에 한정**하여 수행되었으며, **테스트 작성·실행, 타입 검사(`tsc`), 린트(`next lint`), 프로덕션 빌드(`next build`), 브라우저 자동화 실행 확인, 실제 Firebase·Gemini 연결 및 Vercel 배포는 수행하지 않았습니다.**
