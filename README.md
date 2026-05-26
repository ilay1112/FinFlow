# FinFlow 💸

**FinFlow** is a professional, production-ready Small Business Financial Management application built with React and TypeScript. Designed specifically for Israeli independent contractors (*Esek Patur* / *Esek Morshe*) and small businesses, it offers a seamless, mobile-first experience for tracking expenses, managing clients, and generating high-fidelity PDF invoices with full Hebrew (RTL) support.

---

## 🚀 Key Features

### 📊 Comprehensive Dashboard
*   **Real-time Analytics:** Instant overview of total revenue, expenses, net profit, and estimated tax liability.
*   **Smart Period Toggling:** Easily switch between Monthly and Yearly views by clicking analytics cards.
*   **Trend Tracking:** Automatic period-over-period comparisons (vs. last month/year) with visual badges.
*   **Interactive Visualizations:** Responsive Bar and Pie charts for revenue vs. expenses and spending by category.

### 📄 Professional Invoicing
*   **High-Fidelity PDF Generation:** Uses `html2canvas` + `jsPDF` to generate pixel-perfect invoices that look exactly like the on-screen template.
*   **Perfect Hebrew (RTL) Support:** Robust handling of mixed Hebrew/Latin text and numbers, ensuring dates and currency amounts are oriented correctly.
*   **Status Management:** Track invoices through their lifecycle: Draft, Sent, Paid, and Overdue.
*   **Automatic Calculations:** Instant subtotal, tax, and total calculations based on your business type.

### 💸 Expense Management
*   **Dynamic Categorization:** Manage your own list of expense categories via a dedicated management interface.
*   **Receipt Handling:** Upload and preview digital receipts (PDF/Images) directly within the app.
*   **Tax Compliance:** Track tax-deductible status and missing receipts for simplified reporting.
*   **Export Support:** Export your transaction history to CSV for accounting purposes.

### 👥 Client Relationship Management
*   **Client Profiles:** Maintain a detailed database of clients, including contact info and physical addresses.
*   **Billing History:** View a complete history of invoices generated for each specific client.
*   **Revenue Insights:** Identify your top-performing clients and lifetime billing totals.

### 🌍 Internationalization & UX
*   **Dual Language:** Full support for English and Hebrew (LTR/RTL) with zero hardcoded strings.
*   **Mobile-First Design:** Fully responsive layout optimized for smartphones, tablets, and desktop computers.
*   **Local Persistence:** All data is securely stored in the browser's `localStorage`, ensuring privacy and offline capability.

---

## 🛠️ Tech Stack

*   **Framework:** [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **Icons:** [Lucide React](https://lucide.dev/)
*   **Charts:** [Recharts](https://recharts.org/)
*   **i18n:** [i18next](https://www.i18next.com/)
*   **PDF Logic:** [html2canvas](https://html2canvas.hertzen.com/) & [jsPDF](https://rawgit.com/MrRio/jsPDF/master/docs/index.html)
*   **Date Utils:** [date-fns](https://date-fns.org/)

---

## ⚙️ Local Setup

Follow these steps to get FinFlow running on your local machine:

### 1. Clone the Repository
```bash
git clone https://github.com/ilay1112/FinFlow.git
cd FinFlow
```

### 2. Install Dependencies
Ensure you have [Node.js](https://nodejs.org/) (v18+) installed.
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

### 4. Build for Production
```bash
npm run build
```
This generates a highly optimized `dist` folder ready for deployment.

---

## 📂 Project Structure

```text
src/
├── assets/             # Fonts (Heebo) and Static Images
├── components/         # Reusable UI Components (Cards, Modals, Buttons)
├── context/            # FinanceContext (Central State & Persistence)
├── i18n/               # Translation Dictionaries (EN/HE)
├── layouts/            # Main App Shell & Responsive Navigation
├── pages/              # View Components (Dashboard, Invoices, etc.)
├── services/           # PDF Generation Logic & Templates
└── utils/              # Helper Functions (Currency/Class Merging)
```

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ for Small Business Owners.*
