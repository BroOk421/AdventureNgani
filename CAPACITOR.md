# AdventureNgani sa phone (Capacitor)

Nakahanda na ang project para gawing Android app. Ganito ang gagawin sa computer mo:

1. I-install ang **Node.js 20+** at **Android Studio** (kasama ang Android SDK).
2. Sa folder ng project (kung nasaan ang `package.json`):
   ```
   npm install
   npm run android
   ```
   - `npm run android` = kinokopya ang game sa `www/`, sini-sync sa Android project, at binubuksan ang Android Studio.
3. Sa Android Studio: piliin ang phone mo (naka-USB debugging) o emulator, saka pindutin ang **Run ▶**.
   Para sa APK: **Build › Build Bundle(s) / APK(s) › Build APK(s)**.

Tuwing may babaguhin ka sa game (js, assets, index.html): `npm run cap:sync` ulit bago mag-Run.

Mga setting ng app:
- App id: `com.adventurengani.game`, pangalan: AdventureNgani (`capacitor.config.json`).
- Laging naka-landscape, full screen, at hindi namamatay ang screen habang naglalaro
  (`android/app/src/main/AndroidManifest.xml`, `MainActivity.java`).
- Kusang lumalabas ang mobile controls sa phone (`js/mobile.js`). Sa computer, makikita mo rin sila sa `index.html?mobile=1`.

iPhone/iPad: kailangan ng Mac na may Xcode — `npx cap add ios` tapos `npm run ios`.
