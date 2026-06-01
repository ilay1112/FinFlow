# FinFlow 🚀

FinFlow is a professional, mobile-optimized financial management application designed for freelancers and small businesses. It combines the power of a modern accounting suite with the total privacy of your own **Google Drive**.

## 🛡️ Your Data, Your Drive
FinFlow is built on a **"Zero-Server" Privacy Model**. Unlike traditional accounting software, we do not store your sensitive financial data, client lists, or receipts on our servers. 

### How it Works:
- **Direct Integration**: FinFlow connects directly from your browser to the Google Drive API.
- **Private Storage**: All application data (`app_data.json`) and receipt files are stored in a secure, nested folder named `FinFlow Data` inside your personal Google Drive.
- **Total Control**: You own the storage. You can audit, move, or delete your data at any time through the standard Google Drive interface.
- **Security**: Authentication is handled via Google OAuth 2.0 with restricted file-level permissions (`drive.file` scope). FinFlow can *only* access the files it creates.

## ✨ Key Features
- **📊 Real-time Dashboard**: Revenue vs. Expense tracking with interactive Recharts analytics.
- **🧾 Intelligent Expense Logging**: Snap or upload receipts directly to the cloud.
- **📝 Professional Invoicing**: High-fidelity PDF generation with perfect RTL (Hebrew) support and dynamic legal titles (**Receipt** vs **Tax Invoice**).
- **🌍 Bi-lingual & Bi-directional**: Full support for English (LTR) and Hebrew (RTL) with persistent language selection.
- **💾 Offline-First**: Uses `localStorage` for immediate responsiveness, with background synchronization to Google Drive.
- **📱 Native Mobile Support**: Fully cross-platform with CapacitorJS integration.

## 🛠️ Tech Stack
- **Framework**: React 19 (Vite)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Charts**: Recharts
- **Storage**: Google Drive REST API
- **Mobile**: [CapacitorJS](https://capacitorjs.com/) & [Capgo Social Login](https://capgo.app/docs/plugins/social-login/)

## 🚀 Getting Started

### Prerequisites
- A Google Cloud Project with the **Google Drive API** enabled.
- An OAuth 2.0 Client ID configured for your deployment URL (e.g., `localhost` or Vercel).

### Installation
1. Clone the repository.
2. Install dependencies: `npm install`
3. Create a `.env.local` file in the root:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
   ```
4. Start the development server: `npm run dev`

### 📱 Native Mobile Setup (Android & iOS)
FinFlow uses [CapacitorJS](https://capacitorjs.com/) and the [@capgo/capacitor-social-login](https://capgo.app/docs/plugins/social-login/) plugin for native Google Authentication.

#### 1. Setup Auth
Follow the [Capgo Social Login Setup Documentation](https://capgo.app/docs/plugins/social-login/) to configure your Native Android and iOS projects in the Google Cloud Console.

#### 2. Native Configuration
- **Android**: Update `android/app/src/main/res/values/strings.xml` with your `server_client_id`.
- **iOS**: Update `ios/App/App/Info.plist` with the required URL schemes.

#### 3. Build & Sync
```bash
# Build the web application
npm run build

# Sync changes to native platforms
npx cap sync
```

## 📄 License
This project is open-source. See the LICENSE file for details.
