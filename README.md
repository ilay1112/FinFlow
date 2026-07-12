# tbiz 🚀

tbiz is a professional, mobile-optimized financial management application designed for freelancers and small businesses. It combines the power of a modern accounting suite with the total privacy of your own **Google Drive**.

## 🛡️ Your Data, Your Drive
tbiz is built on a **"Zero-Server" Privacy Model**. Unlike traditional accounting software, we do not store your sensitive financial data, client lists, or receipts on our servers. 

### How it Works:
- **Direct Integration**: tbiz connects directly from your browser to the Google Drive API.
- **Private Storage**: All application data (`app_data.json`) and receipt files are stored in a secure, nested folder named `tbiz Data` inside your personal Google Drive.
- **Total Control**: You own the storage. You can audit, move, or delete your data at any time through the standard Google Drive interface.
- **Security**: Authentication is handled via Google OAuth 2.0 with restricted file-level permissions (`drive.file` scope). tbiz can *only* access the files it creates.

## ✨ Key Features

### 🏢 Multi-Business Support
- **Workspace Management**: Manage multiple business profiles under a single Google account.
- **Instant Switching**: Seamlessly switch between different businesses with isolated data and settings.
- **Secure Deletion**: Fully delete a workspace and all its associated data from Google Drive with two-step verification.

### 📊 Real-time Dashboard
- **Financial Analytics**: Revenue vs. Expense tracking with interactive Recharts.
- **Performance Metrics**: Monitor net profit, tax liability estimates, and monthly growth at a glance.
- **Quick Actions**: One-tap access to create invoices, log expenses, or add clients.

### 🧾 Comprehensive Expense Management
- **Smart Tracking**: Log expenses by vendor and category with support for tax-deductible marking.
- **Cloud Receipts**: Snap or upload receipts directly to your Google Drive. Files are automatically organized by business and year.
- **Integrated Payments**: Link expenses directly to booking agent payouts for accurate financial history.

### 📝 Professional Invoicing & Documents
- **High-Fidelity PDF**: Professional document generation with pixel-perfect RTL (Hebrew) support.
- **Dynamic Legal Logic**: Automatically handles legal titles (**Receipt** vs **Tax Invoice**) based on business type (**Esek Patur** vs **Esek Morshe**).
- **Flexible Items**: Manage line items with responsive pricing and automated tax/subtotal calculations.

### 🤝 Booking Agent Management
- **Commission Tracking**: Automated commission calculations with support for custom rates and **Minimum Commission** thresholds.
- **Debt Management**: Track **Paid** vs **To Pay** amounts for each agent in real-time.
- **Flexible Payouts**: Mark debt as paid with custom amounts and direct receipt uploads, automatically generating corresponding expense entries.

### 🌍 Optimized User Experience
- **Bilingual & RTL**: Native support for English (LTR) and Hebrew (RTL) with automatic UI realignment.
- **Mobile-First Design**: Optimized for small screens with responsive tables, compact sidebars, and iOS Safari compatibility (preventing auto-zoom).
- **Offline-First**: Immediate responsiveness using `localStorage` with robust background synchronization to Drive.

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
tbiz uses [CapacitorJS](https://capacitorjs.com/) and the [@capgo/capacitor-social-login](https://capgo.app/docs/plugins/social-login/) plugin for native Google Authentication.

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
