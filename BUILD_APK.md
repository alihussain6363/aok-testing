# How to Build & Export Android APK

This guide explains how to generate the installable `.apk` file for your physical Android mobile device.

---

## Method 1: Build APK via Expo Cloud (EAS Build) — Recommended

> **No Android Studio or JDK required on your computer.** Expo builds the `.apk` in the cloud and provides a direct download link and QR code to install it immediately on your phone.

### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
```
*(Or use `npx eas-cli` without global install)*

### Step 2: Log in to Expo
```bash
npx eas-cli login
```
*(If you don't have an Expo account yet, register for free at [expo.dev](https://expo.dev))*

### Step 3: Run the APK Build
```bash
npm run build:apk
```
*or directly:*
```bash
npx eas-cli build -p android --profile preview
```

### Step 4: Install on Your Mobile Device
- When the build finishes (takes ~5–10 minutes in the cloud), EAS will output a **download URL** and a **QR Code**.
- Scan the QR code or open the link on your Android phone.
- Tap **Download APK** and install it on your device!

---

## Method 2: Build APK Locally on Your Computer

If you have **JDK 17+** and the **Android SDK** installed:

### Step 1: Generate Native Android Project
```bash
npm run prebuild
```
This generates the native `android/` directory configured with Gradle.

### Step 2: Assemble Release APK
```bash
cd android
./gradlew assembleRelease
```
*(On Windows PowerShell: `.\gradlew assembleRelease`)*

### Step 3: Locate Your APK
The generated APK will be at:
```
android/app/build/outputs/apk/release/app-release.apk
```
You can copy this file to your Android phone via USB cable, WhatsApp, Google Drive, or `adb install`.

---

## Testing in Development (Before Building APK)

To test the app interactively right now with hot reload:
```bash
npm run start
```
Install the **Expo Go** app from the Google Play Store on your Android device and scan the QR code displayed in the terminal!
