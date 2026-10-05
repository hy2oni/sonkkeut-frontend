# 임시 이벤트 체험 APK (개발 진행 중)

최신화: 2026-10-05. 이 브랜치는 체험용 변경사항 보관용입니다. 정식 UI 통합은 별도 develop_ui_integration 브랜치에서 진행합니다.

이 브랜치 `test/event-walkthrough`는 최신 통합 앱 v0.1.8 (`7ef0deb`)의 주문·화면 흐름을 체험하기 위한 테스트 버전입니다.

- 앱 이름: **손끝길 이벤트 체험**, 패키지: `com.sonkkeut.eventtest` (기존 앱과 함께 설치 가능).
- 아래 임시 패널의 **다음 이벤트**로 화면 인식 → 손끝 이동 → 누름 안내 → 결과 확인을 진행합니다.
- 주문 화면의 예시 또는 직접 입력을 사용하고, **네, 이 주문으로 안내 시작**을 누르세요.
- **오류 이벤트 펼치기**에서 손끝 상실·화면 상실·실패·불확실·금액 오류·조기 결제를 체험합니다.
- 중단 시 **메인으로 → 안내 계속 → 다음 이벤트**, 막히면 **처음부터 체험**을 사용하세요.
- 카메라·마이크·Whisper 다운로드가 필요 없습니다. 가상 음성 버튼은 예시 문장을 넣으며 실제 녹음하지 않습니다.
- 카메라 입력·AI 결과·누름 판정은 가상입니다. 실제 v0.1.8 주문 파서·확인 화면·주문 상태 전환을 사용합니다.
- 이 테스트의 안내는 화면으로 확인합니다. 실제 TTS·진동·인식 성능을 검증하는 APK가 아닙니다.
- 서버 조회·익명 통계 전송은 비활성화되어 있습니다. 실제 키오스크 주문이나 결제에 사용하지 마세요.

빌드: `android/gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a "-Pandroid.overridePathCheck=true"`

설치 파일은 빌드 완료 후 이 저장소의 `artifacts/sonkkeut-event-test.apk`에 제공합니다. 개발용 서명이며 Metro 서버 없이 실행됩니다. 원본 배포 APK 링크는 아래 기존 문서에 있습니다.

검증: 기존 테스트 63개 + 체험 흐름/오류/화면 테스트 4개, 총 67개 통과. TypeScript·ESLint 통과. Android release 빌드 성공. `Sonkkeut_Event_Test` Android 15 에뮬레이터 설치·실행, 카메라 권한 없이 1잔 주문의 입력/확인→포장→메뉴→담기→장바구니→결제 도착→처음부터 체험을 실제 버튼으로 확인했습니다. 기존 Pixel_6 Android 37(16KB 페이지)에서는 원본 네이티브 라이브러리 정렬 문제로 실행되지 않아 Android 15 별도 기기를 사용합니다.

APK SHA-256: `3e04c95a2449cfe76fa2a1930bb147845689945bbe0c66cdff260749828adb1c`

---

# 손끝길 Android·공개 서비스 연결

프론트 앱, 팀의 온디바이스 영상·OCR·음성 모델과 백엔드를 연결했습니다. AWS EC2·Spring Boot·MySQL에 연결하는 기본 주소는 **https://amazing-manually-transcript-est.trycloudflare.com**, 시연 매장 코드는 **Z9XZSN**, 모델 버전은 **2026.10.03**입니다. APK에는 M1·M1-R·M2와 팀 OCR v2의 ONNX가 들어 있습니다. 팀 Whisper v3는 첫 사용 시 원본 릴리스 약 485 MB를 내려받아 검증한 뒤 기기 안에서 실행합니다.

AWS 서버는 팀의 기존 GitHub Actions → ECR → EC2 SSM 경로로 배포합니다. Cloudflare quick tunnel을 통해 HTTPS로 공개하므로 터널 컨테이너 재시작 시 주소가 바뀔 수 있습니다. 새 주소는 백엔드 Actions 배포 요약에서 확인하고 앱의 서버 설정에서 변경할 수 있습니다. 고정 주소 운영에는 별도의 도메인·고정 터널 설정이 필요합니다.

## 음성 인식 개선과 메뉴 검색 보정 (v0.1.8)

음성을 텍스트로 변환한 뒤 매장별 SQLite 메뉴 DB에서 이름·별칭·유사 발음을 찾아 보정합니다. 인식 원문과 보정 문장을 화면에 표시하고, 후보가 비슷하면 메뉴 선택을 요청합니다. 품절·미등록 메뉴·불확실한 수량을 자동 주문하지 않으며 사용자 확인 전에는 목표 안내를 시작하지 않습니다. 소음 때문에 녹음이 길어질 때 사용할 ‘말하기 완료’도 추가했습니다. 페이지 이동 후 늦은 음성 결과는 폐기합니다.

기존 Whisper v3 가중치는 그대로 두고 네이티브 디코딩을 5개 후보 비교로 개선했습니다. SDK 0.1.4 / 앱 0.1.8입니다. 앱과 같은 디코딩 조건의 PC 합성 음성 평가에서 주문 정확도는 조용함 62.5%→95.8%, 합성 잡음 15dB 41.7%→79.2%, 5dB 20.8%→33.3%였습니다. 소음 환경 실사용 성능을 보장할 수준은 아니며 S26 Ultra 실제 녹음 검증이 필요합니다.

Jest 63개·TypeScript·ESLint, 실제 Whisper JNI·메뉴 DB·OCR·영상 모델을 포함한 Android 테스트 13개가 통과했습니다. 자세한 조건과 한계는 [음성 평가·메뉴 DB 연결 설명](https://github.com/fingertip-vision/sonkkeut-ai/blob/codex/unified-ai-20261003/docs/speech-menu-rag.md)을 확인하세요.

## 새 UX 커밋 반영 (v0.1.7)

팀의 `feature/ux-ui` 커밋 `ed78c49`와 `develop` 개발 이력을 병합했습니다. 새 글자 크기·자동 음성·진동·안내 속도 설정을 AI·AWS 연결 앱에도 적용했습니다. 설정은 다음 실행에 복원되며, 자동 음성을 꺼도 재안내·화면 읽기는 사용할 수 있습니다. TalkBack 사용 중 자동 TTS는 억제합니다. 기존 남색·노란색 메인, 스크롤 없는 카메라와 실제 OCR·Whisper·주문 확인·AWS 자동 연결은 유지합니다.

[화면 구성·실제 캡처·개발 진입점](docs/app-screens.md)과 [Compose 원본 개발 기록](docs/compose-prototype.md)을 확인하세요. 현재 공개 APK는 `App.tsx`·`android/` 경로이며, 루트 `app/`의 Compose 프로토타입은 별도 패키지입니다.

검증: Jest 54개·TypeScript·ESLint, Android 10개 통과(음성 모델 미설치로 Whisper 검사 1개 생략), release APK의 설정 복원·큰 글자·테마·재안내·카메라 중지/계속. S26 Ultra 실물, 한국어 음성·진동 감각과 TalkBack 사용성은 미검증입니다.

## 고대비·스크롤 없는 메인 화면 (v0.1.6)

기본 테마를 짙은 남색 배경·밝은 글자·노란색 버튼으로 바꿨습니다. **메뉴·설정 → 화면·카메라·음성 설정**에서 밝은 테마를 선택할 수 있으며 테마·카메라 화각·목표 강조 설정은 저장됩니다. 앱의 고정 글자 색상과 배경 조합은 두 테마 모두 명도 대비 4.5:1 이상입니다. 영상 자체와 목표 테두리 대비는 장면에 따라 달라집니다.

메인 화면에는 스크롤이 없고 넓은 세로 카메라, 현재 안내 문구, 고정된 **안내 중지 / 안내 계속**, **재안내** 버튼을 둡니다. 주문 입력·확인, 실제 OCR 글자, 안내 기록·매장 메뉴·종료, 음성 모델·서버 설정은 별도 화면으로 분리했습니다. 화면을 처음 찾으면 주문 입력 화면을 열고, 확인 후 새 화면을 인식해 안내를 시작합니다. 메뉴를 열면 안내와 카메라가 멈추고 메인에 돌아와 **안내 계속**을 누르면 새 화면을 확인합니다. 결과를 확인하지 못한 담기는 중복 진행하지 않습니다. 음성 입력과 확인 문구를 화면에서도 볼 수 있습니다.

카메라는 세로 방향을 유지하고 `contain`으로 영상 전체를 표시해 가장자리를 자르지 않습니다. 목표 테두리 좌표도 같은 비율과 여백으로 맞춥니다. **가까이서 화면 전체 담기**를 켜면 지원 기기에서 초광각·최소 줌을 사용합니다. 미지원 또는 초광각 시작 오류 시 기본 렌즈로 전환합니다. 실제 키오스크 전체가 담기는 거리는 렌즈와 기기·키오스크 크기에 따라 다르므로 네 모서리가 보이도록 각도와 거리를 조절하세요.

Jest 51개·TypeScript·ESLint와 release APK에서 두 테마·설정 저장, 스크롤 없는 메인, 글자 크기 2배의 버튼 표시, 카메라 반복 실행·중지·재개·메뉴 복귀, 자동 연결·저장 메뉴의 오프라인 시작·Wi-Fi 재연결을 확인했습니다. 캡처는 실제 에뮬레이터 앱이고 카메라는 테스트 영상입니다. S26 Ultra의 실제 초광각·키오스크 전체 주문은 아직 확인하지 않았습니다.

## 밝은 홈·설정·안내 화면 (v0.1.5)

아이보리 바탕과 청록색으로 앱 화면을 다시 구성했습니다. 홈은 키오스크 그림·시작 버튼·세 단계 이용 안내·매장 메뉴를 중심으로 정리했습니다. 홈·설정 탭을 추가했고 서버·음성 모델·목표 강조는 설정 화면에서 조절합니다. 안내 화면에는 단계 표시, 현재 안내 문구, 카메라 촬영 가이드와 고정된 일시 정지·종료 버튼을 배치했습니다. 자동 연결과 오프라인 메뉴, 팀 AI의 방향·OCR·누름 결과·자막·주문 진행은 유지합니다.

Jest 41개·TypeScript·ESLint와 release APK의 홈·설정 이동, 자동 연결, 오프라인 저장 메뉴 시작, Wi-Fi 재연결, 반복 카메라 실행·정지·재개를 확인했습니다. 미리보기는 실제 에뮬레이터 APK의 캡처이며 카메라 부분은 테스트 영상입니다. S26 Ultra 실물 전체 주문은 사용자 확인이 필요합니다.

## 자동 연결과 화면 안내 (v0.1.4)

앱 실행 시 저장 설정을 불러온 뒤 Wi-Fi·모바일 데이터로 배포 서버와 매장 메뉴를 자동 확인합니다. 인터넷이 없으면 저장된 메뉴를 사용하고 재연결·앱 복귀 시 다시 확인합니다. 서버 응답 실패는 5·15·30·60초 간격으로 재시도하고 연결 성공 후 60초 간격으로 상태를 확인합니다. 잘못된 매장 코드·삭제된 매장은 설정 오류로 표시합니다. 주문 안내 중에는 메뉴·별칭·매장·통계 목적지를 유지하며 새 메뉴는 종료 후 적용합니다.

화면에는 큰 방향 화살표, 현재 목표 버튼 이름·노란 테두리, 누름 결과, 확인한 주문과 실제 담기 확인 수량, 최근 안내 자막을 표시합니다. **화면 글자 보기·읽기**에서 실제 OCR 글자를 공간 순서대로 확인할 수 있으며 불확실한 인식은 표시하고 목표로 사용하지 않습니다. 일시 정지·종료 버튼은 화면 아래에 고정합니다. 자체 음성 설치는 **음성 모델 준비하기**에 모았습니다. 결제는 키오스크에서 직접 진행합니다.

Jest 41개·TypeScript·ESLint, 최종 release APK의 자동 온라인 시작·오프라인 저장 메뉴 시작·Wi-Fi 자동 재연결·카메라 반복 시작·정지·재개를 검증했습니다. 실제 AI 이벤트 계약으로 방향·판정·OCR 표시와 주문 중 메뉴 보존을 React 컴포넌트 테스트에서 확인했습니다. 에뮬레이터 카메라 장면에는 키오스크가 없고 S26 Ultra 실물 전체 주문은 아직 검증하지 않았습니다.

## 카메라 시작 오류 수정 (v0.1.3)

이전 v0.1.2에서 시작 버튼을 누르면 Frame Processor Error: Value is undefined, expected an Object로 앱이 종료되는 현상을 배포 APK에서 재현했습니다. VisionCamera 4.6.4의 플러그인 연결이 두 번째 인자를 객체로 변환하므로, 회전값이 없을 때 undefined를 전달하는 대신 인자를 생략하도록 AI SDK 0.1.2를 수정했습니다. 회전값 0·90도 전달은 유지합니다. 앱 Jest 회귀 검사 27개·TypeScript·ESLint와 배포 APK의 카메라 시작·일시 정지·재개 검증을 수행했습니다. S26 Ultra 실물 검증은 사용자의 재설치 확인이 필요합니다.

## 지금 확인하기

휴대폰에서 [APK 다운로드](https://github.com/fingertip-vision/sonkkeut-frontend/releases/download/v0.1.8-speech-rag-20261005/sonkkeut-aws.apk)를 열어 직접 설치할 수 있습니다. 이 개발 시연 앱은 첫 음성 모델 설치 중 약 1GB의 여유 공간이 필요합니다. [APK 검증 기록](https://github.com/fingertip-vision/sonkkeut-frontend/releases/download/v0.1.8-speech-rag-20261005/speech-rag-apk-validation.json)에서 크기·SHA-256·포함 모델을 확인할 수 있습니다.

휴대폰 없이 [상세 시뮬레이션](https://amazing-manually-transcript-est.trycloudflare.com/simulation)을 열 수 있습니다. 주문 3종, 손끝 자동·수동 이동, 신뢰도 조절, 품절·잘못 누름·화면 변화 없음·손 유실 복구를 확인합니다. 웹은 가상 좌표·모의 인식 결과를 사용하며 카메라나 실제 OCR·음성 모델을 실행하지 않습니다. 현재 PC의 전체 사용법은 `outputs/LOCAL_GUIDE.md`에 있습니다.

1. PC 브라우저에서 [시연 키오스크](https://amazing-manually-transcript-est.trycloudflare.com/kiosk)를 엽니다. `?flow=2`, `?flow=3`으로 배치가 다른 시연 화면도 열 수 있습니다.
2. ARM64 Android 휴대폰에서 USB 디버깅을 허용하고 이 PC에 연결합니다.
3. PowerShell에서 공개 서비스용 APK를 설치합니다.

```powershell
cd 'C:\Users\User\Documents\Codex\2026-10-02\fingertip-vision\outputs'
.\install-android.ps1 -Aws
```

기기가 여러 대이면 `install-android.ps1 -Aws -Device SERIAL`로 ADB 번호를 지정합니다. 스크립트는 `../sonkkeut-aws.apk`를 설치하고 앱을 실행합니다. 공개 서비스 연결에는 인터넷이 필요하며, PC 로컬 서버나 `adb reverse` 설정은 필요하지 않습니다.

4. 앱을 열면 저장 설정에 따라 서버·메뉴를 자동 확인합니다. 시작 화면의 **서버 연결됨**을 확인하세요. 기본 매장은 **Z9XZSN**입니다. 다른 매장은 **메뉴·설정 → 화면·카메라·음성 설정 → 서버·매장 설정 → 설정 저장·자동 연결**에서 변경합니다. 이전 공개 기본 설정 쌍만 AWS로 이전하며 사용자 지정 설정은 유지합니다.
5. **손끝길 시작**을 누르고 카메라·마이크 권한을 허용합니다. 휴대폰 카메라로 PC의 키오스크 화면을 비춥니다.
6. **자체 음성 모델 받기 (약 485MB)**로 모델을 준비한 뒤 **자체 모델로 말로 주문하기**를 사용합니다. 다운로드와 압축 내부 파일은 SHA-256으로 검증합니다. 준비된 모델은 이후 녹음을 기기 안에서 처리합니다. 주문 문장 입력과 별도 **기기 음성 인식으로 주문하기**도 사용할 수 있습니다.
7. 예: `따뜻한 아메리카노 두 잔하고 카페라떼 한 잔 포장해주세요`. **입력한 주문 확인 → 네, 이 주문으로 안내 시작**으로 주문을 확인한 뒤 목표 버튼에 검지를 옮기세요. 음성·진동 안내 후 눌린 결과를 확인하며 다음 단계를 진행합니다.

시연 화면은 실제 결제를 수행하지 않습니다. 결제 화면에 도착하면 주문 안내가 끝납니다. 별도 기기 음성 인식은 Android 12 이상에서 기기의 온디바이스 한국어 인식 서비스·언어팩이 필요합니다. 한국어 TTS의 언어 데이터도 기기에서 준비해야 합니다.

## 연결 구조

`Camera → M1 화면 모서리 → M1-R 보정 → 호모그래피 → M2 요소 검출 → 팀 OCR v2·CTC → 화면 구조 → 확인한 주문의 계획 → MediaPipe 손끝 → 음성·진동 → 누름 검증`

`Microphone → 팀 Whisper v3·CTranslate2 → 메뉴 문맥을 반영한 한국어 주문 → 사용자 확인 → 주문 계획`

- 영상·OCR·손끝·자체 음성 모델은 휴대폰 안에서 실행합니다. 카메라·녹음·주문 문장을 백엔드로 보내지 않습니다. 공개 백엔드는 Paddle·Whisper 추론을 실행하지 않습니다.
- OCR은 ML Kit의 줄 위치를 이용해 자체 ONNX로 읽습니다. 선택·장바구니·총액 보완과 낮은 신뢰도 텍스트 대체에 ML Kit를 사용하며, 대체한 OCR은 불확실 표시를 유지합니다.
- 서버는 매장 메뉴, 모델 버전·해시, 동의한 익명 사용 통계를 제공합니다. 메뉴는 앱에 캐시됩니다. 통계는 기본 꺼짐이며, 동의한 경우 전송 실패 데이터를 저장해 재전송합니다. 서버는 같은 이벤트의 중복 집계를 막습니다.
- 메뉴·수량·온도·포장/매장을 확인한 뒤 안내를 시작합니다. 여러 잔은 담기 성공을 확인하며 한 잔씩 처리합니다. 지원하지 않는 추가 요청이나 불확실한 인식은 확인을 요청합니다.
- 선택 결과·장바구니 수량·총액 등 필요한 증거가 없거나 맞지 않으면 진행을 멈추고 재확인을 안내합니다.

## 모델 식별

[모델 명세](https://github.com/fingertip-vision/sonkkeut-ai/blob/codex/unified-ai-20261003/android/react-native-sonkkeut/android/src/main/assets/sonkkeut/model-manifest.json)에 각 모델의 SHA-256·크기·입출력·원본 릴리스·검증 범위가 있습니다. 같은 정보는 APK와 서버의 `/api/models/latest`에 제공됩니다. APK의 네 ONNX는 번들 모델이며, 자체 Whisper는 고정된 원본 ZIP을 처음 내려받아 검증·설치합니다. 이 동작은 임의 최신 모델로 자동 교체하는 기능과 별개입니다.

| 모델 | 입력 | 출력 | 역할·설치 |
|---|---|---|---|
| m1_screen_corners_int8.onnx | 1×3×640×640 | 1×17×8400 | 화면과 네 모서리, APK 포함 |
| m1r_corner_refiner.onnx | N×1×64×64 | N×2 | 모서리 보정, APK 포함 |
| m2_screen_elements_int8.onnx | 1×3×640×640 | 1×9×8400 | tab/menu/price/button/back, APK 포함 |
| m3_kiosk_rec_v2.onnx | 1×3×48×가변 너비 | 1×T×11947 확률 | 팀 OCR v2·CTC, APK 포함 |
| whisper-elder-v3-ct2.zip | 16 kHz 음성 → 1×80×3000 log-mel | 한국어 문장 | 팀 Whisper v3·ARM64 CTranslate2, 첫 사용 다운로드 |

Python CPU 제공자와 `sonkkeut.ai.v1` 응답 계약·좌표 변환은 AI 저장소의 [통합 안내](https://github.com/fingertip-vision/sonkkeut-ai/blob/codex/unified-ai-20261003/docs/unified-ai.md)를 확인하세요.

## 메뉴·통계 관리와 로컬 재현

- [공개 메뉴 관리](https://amazing-manually-transcript-est.trycloudflare.com/owner): 매장 생성·점주 인증 후 메뉴를 관리합니다.
- [공개 통계](https://amazing-manually-transcript-est.trycloudflare.com/dashboard): 매장 코드와 점주 키로 해당 매장 통계를 조회합니다.
- 현재 PC의 공개 서비스 정보는 `outputs/DEPLOYMENT_STATUS.json`에 있습니다. 로컬 FastAPI의 API 문서는 서버 실행 후 `http://127.0.0.1:18080/docs`에서 확인합니다.

기존 로컬 재현용 APK는 `../sonkkeut-local.apk`이며 시연 코드는 **BYDHTF**입니다. 아래 명령으로 로컬 서버를 실행하고 해당 APK를 설치하면 스크립트가 `adb reverse tcp:18080 tcp:18080`을 설정합니다. USB를 다시 연결하면 포트 연결을 다시 설정해야 합니다.

```powershell
.\start-local.ps1
.\install-android.ps1
```

이 경로의 앱 설정은 `http://127.0.0.1:18080`·**BYDHTF**입니다. 로컬 DB와 관리 키는 저장소 밖 `work/`에 보관합니다. `work/demo-store.json`, `work/local-admin.key`는 로컬 매장의 비공개 키이며 공개 매장과 별개입니다. 종료는 `../stop-local.ps1`을 사용합니다. 현재 PC의 자세한 재현 순서는 `outputs/LOCAL_GUIDE.md`를 확인하세요.

## 다시 빌드하기

저장소만 받아 새 환경에서 빌드하려면 두 저장소를 나란히 준비합니다. JDK 17·Android SDK 35·NDK 26.1.10909125·CMake 3.22.1을 설치하고 `ANDROID_HOME`을 설정하세요.

```powershell
git clone --branch codex/unified-ai-20261003 https://github.com/fingertip-vision/sonkkeut-ai.git
git clone --branch integrate/aws-20261005 https://github.com/fingertip-vision/sonkkeut-frontend.git
cd sonkkeut-frontend
npm ci
cd android
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

결과는 `android/app/build/outputs/apk/release/app-release.apk`입니다. 아래 도구는 현재 PC 작업 폴더에 준비되어 있습니다.

```powershell
cd 'C:\Users\User\Documents\Codex\2026-10-02\fingertip-vision\outputs'
.\build-android.ps1 -StoreCode Z9XZSN -OutputName sonkkeut-aws.apk
```

현재 PC에 준비된 JDK 17, `work/android-sdk`, `work/gradle-cache`를 사용합니다. Windows의 긴 C++ 빌드 경로를 피하려고 빌드 동안 V:를 outputs 폴더에 연결합니다. 다른 V: 연결이 있으면 덮어쓰지 않고 중지합니다. AI 소스를 수정하면 빌드 스크립트가 npm에 복사 설치된 모듈도 갱신합니다.

결과는 `../sonkkeut-aws.apk`입니다. Android API 24 이상 ARM64용 개발 서명 APK입니다. 앱스토어 배포에는 별도 릴리스 서명이 필요합니다. 파일 이름을 바꾸는 `-OutputName`은 서버 주소 기본값을 바꾸지 않으므로, 로컬 전용 빌드에는 앱 설정도 확인하세요.

새 PC에서는 Python 환경과 Android SDK를 준비해야 합니다. 로컬 백엔드도 재현하려면 outputs 폴더에서:

```powershell
py -3.12 -m venv ..\work\backend-venv
..\work\backend-venv\Scripts\python.exe -m pip install -r .\sonkkeut-backend\requirements-dev.lock.txt
cd .\sonkkeut-frontend
npm ci
```

Android SDK platform 35, build-tools 35/34, NDK 26.1.10909125, CMake 3.22.1과 JDK 17이 필요합니다. `build-android.ps1`의 경로를 해당 PC 환경에 맞추세요. 자체 음성 런타임의 소스·빌드 출처는 [`../sonkkeut-ai/docs/unified-ai.md`](../sonkkeut-ai/docs/unified-ai.md)와 SDK README에 있습니다.

## 검증 범위

새 통합에서는 팀 OCR을 합성 한국어 3개에 실제 추론했고 Python·Kotlin CTC 결과가 일치했습니다. Python 통합 계약 테스트 15개를 포함해 CPU 환경에서 38개가 통과했습니다(기존 PyTorch 실가중치 테스트 3개 제외). 팀 Whisper의 실제 CPU 추론, OCR → 음성·주문 해석 → 확인된 목표 계획의 HTTP 연결도 검증했습니다.

Android 자체 Whisper는 API 35의 ARM64 변환 에뮬레이터에서 합성 한국어 음성과 메뉴 문맥으로 실제 추론했습니다. 기록된 20.376초는 물리적 휴대폰의 음성 처리 성능이 아닙니다. TypeScript·ESLint·주문 상태 검증과 APK·네이티브 통합 테스트의 개별 결과는 아래 기록을 확인하세요.

- [`../model-manifest.json`](../model-manifest.json): 실제 모델 출처·해시와 모델별 검증 범위
- [`../DEPLOYMENT_STATUS.json`](../DEPLOYMENT_STATUS.json): 공개 URL·저장소·배포 및 공개 API 검증
- [`../../work/unified-ai-smoke/model-verification.json`](../../work/unified-ai-smoke/model-verification.json), [`../../work/unified-ai-smoke/real-api-result.json`](../../work/unified-ai-smoke/real-api-result.json): 이번 실제 모델 CPU·HTTP 검증
- [`../validation.json`](../validation.json): 이전 로컬 APK의 검사 기록(새 공개 APK와 구분)
- [`../simulation-checks.json`](../simulation-checks.json): 브라우저 모의 시뮬레이션 60회·560단계·80회 복구·안전 검사 15개 기록

실제 휴대폰 카메라·마이크로 주문 전체를 수행하는 현장 검증은 남아 있습니다. 일반 키오스크의 선택 색상만으로 옵션 선택을 추정하지 않으며 시연은 `선택됨` 문구와 장바구니 수량을 표시합니다. 표시 방식이 다른 키오스크에는 인식 규칙 및 누름 확인 조건 조정이 필요할 수 있습니다. 기능 명세서의 정확도·지연·현장 성공률 목표는 측정 완료로 보고하지 않습니다.
