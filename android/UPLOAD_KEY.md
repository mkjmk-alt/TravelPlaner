# TravelPlaner Android 업로드 키 운영 메모

이 문서에는 비밀번호나 개인 신원 정보를 기록하지 않습니다.

## 현재 로컬 구성

- 키 파일: `android/travelplaner-upload.jks` — Git ignore, 권한 `600`
- 공개 인증서: `android/travelplaner-upload-cert.pem` — 개인키가 없어 Git 저장 가능
- 별칭: `travelplaner-upload`
- 키체인 서비스: `TravelPlaner Android Upload Key`
- 키체인 계정: `TravelPlaner`
- 알고리즘: RSA 4096 / SHA256withRSA
- 인증서 SHA-256: `DB:10:6A:AD:55:0F:75:23:32:81:CE:2F:4F:CE:7C:B1:E6:4F:A8:12:64:FF:50:14:88:04:10:97:18:C6:D8:72`

## 서명 빌드

아래 명령은 비밀번호를 터미널에 출력하지 않고 로그인 키체인에서 읽어 Gradle 환경변수로만 전달합니다.

```bash
cd android
upload_secret="$(security find-generic-password -a 'TravelPlaner' -s 'TravelPlaner Android Upload Key' -w)"
TRAVELPLANER_ANDROID_STORE_FILE="$PWD/travelplaner-upload.jks" \
TRAVELPLANER_ANDROID_STORE_PASSWORD="$upload_secret" \
TRAVELPLANER_ANDROID_KEY_ALIAS='travelplaner-upload' \
TRAVELPLANER_ANDROID_KEY_PASSWORD="$upload_secret" \
./gradlew bundleStoreRelease lintRelease
unset upload_secret
```

출력 AAB는 `android/app/build/outputs/bundle/release/app-release.aab`입니다. 매 빌드 후 SHA-256을 새로 기록합니다.

## 반드시 완료할 백업

1. `travelplaner-upload.jks`를 암호화된 외장 저장소나 신뢰할 수 있는 비밀 저장소에 별도 보관합니다.
2. 키체인 암호는 비밀번호 관리자에 별도로 보관합니다. JKS와 암호의 유일한 사본을 같은 기기에만 두지 않습니다.
3. Play Console에서 Play App Signing을 켜고 위 업로드 인증서 지문과 일치하는지 확인합니다.
4. 키를 분실하거나 노출한 경우 임의로 새 키로 재출시하지 말고 Play Console의 업로드 키 재설정 절차를 사용합니다.

업로드 키는 앱 서명 키와 다릅니다. Play App Signing을 사용하면 Google이 최종 앱 서명 키를 보호하고, 이 로컬 키는 AAB 업로드 권한 확인에 사용됩니다.
