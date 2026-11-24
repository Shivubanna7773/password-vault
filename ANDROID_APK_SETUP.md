# Android APK setup — Keystone Vault

Android package ID: `com.shivubanna7773.keystonevault`.

## 1. Register Android app in Firebase

1. Open Firebase Console for project `soy-cabinet-fg33w`.
2. Go to Project settings → Your apps → Add app → Android.
3. Enter exactly `com.shivubanna7773.keystonevault`.
4. Download `google-services.json`.
5. In Firebase Authentication → Sign-in method, enable Google.

## 2. Add Firebase config to GitHub Actions

In Windows PowerShell, in the folder containing the downloaded file:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\google-services.json")) | Set-Clipboard
```

In GitHub → repository Settings → Secrets and variables → Actions → New repository secret:
- Name: `GOOGLE_SERVICES_JSON_BASE64`
- Value: paste the clipboard content.

Do not commit `google-services.json` to the repository.

## 3. First APK build and SHA-1

1. Open Actions → Build Android APK → Run workflow.
2. When it completes, open the build log and find the printed SHA-1 fingerprint.
3. Download artifact `keystone-vault-debug-signing-key` and extract `debug.keystore`.
4. In Firebase Project settings → Android app, add that SHA-1 fingerprint.
5. Download the refreshed `google-services.json` from Firebase and update the `GOOGLE_SERVICES_JSON_BASE64` secret using step 2.

## 4. Preserve the same signing key

In PowerShell, from the folder containing the extracted `debug.keystore`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\debug.keystore")) | Set-Clipboard
```

Create another GitHub Actions repository secret:
- Name: `ANDROID_DEBUG_KEYSTORE_BASE64`
- Value: paste the clipboard content.

Keep this keystore private and backed up. Future APKs use the same signing certificate, so the SHA-1 remains stable.

## 5. Build and install

Run Actions → Build Android APK → Run workflow again after updating the Firebase config and adding the keystore secret. Download `keystone-vault-debug-apk` and install `app-debug.apk` on your Android phone.

Google Sign-In requires the Google provider enabled in Firebase and the SHA-1 of the signing certificate used by the APK registered on the same Android Firebase app.
