# 🌾 AnnaSetu — Hyperlocal Surplus Food Redistribution Platform

**AnnaSetu** is a hyperlocal food waste reduction and redistribution platform connecting verified FSSAI Food Business Operators (restaurants, catering services, corporate cafeterias, bakeries) with verified local relief NGOs and community kitchens.

---

## 🌟 Key Features

- **🛡️ FSSAI Verification & Safety Scoring**
  - Real-time 14-digit FSSAI license validation and establishment name matching.
  - Built-in food safety algorithm rating storage conditions (ambient, chilled, hot holding) and dynamic safe consumption windows.
  - Automated expiry countdown timers for real-time safety enforcement.

- **🍲 Real-Time Surplus Food Listing & Matching**
  - Donors can list surplus meals, packaging types, vehicle requirements, and pickup deadlines.
  - Smart distance & capacity-based matching algorithm connects donations to the closest registered relief NGOs.

- **📋 NGO Requisitions & Donor Pledging**
  - NGOs can post emergency meal requests and specific dietary needs.
  - Donors can pledge meals directly to fulfill open requisitions.

- **✉️ OTP & Notification Flow**
  - Real-time email verification via Nodemailer / Gmail SMTP.
  - Integrated local fallback for instant local testing without SMTP configuration.
  - Pickup PIN verification and status update alerts.

- **🏆 Gamification & Donor Quality Score**
  - Star ratings, hygiene milestones, and badges to incentivize consistent, high-quality donations.

- **💳 Subscription Tiers & Admin Portal**
  - Tiered membership plans (Free, Silver, Gold, Platinum).
  - UPI payment proof submission and receipt preview.
  - Dedicated Admin Dashboard to manage users, approve/reject subscriptions, update UPI ID, and view platform metrics.
  - **Default Admin Password**: `mayankaggarwal`

- **⚡ Dual Storage & Realtime Synchronization**
  - Works seamlessly with **Supabase** for cloud persistence and real-time broadcasts.
  - Fallback to browser **LocalStorage** and cross-tab `BroadcastChannel` for offline/development resilience.
  - Cloudflare Worker integration support (`wrangler.json`).

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite 8](https://vitejs.dev/)
- **Styling**: Vanilla CSS3 with responsive design & animations
- **Database / Realtime**: [Supabase](https://supabase.com/) (`@supabase/supabase-js`)
- **Backend / Edge**: Vite Dev Server Middleware & [Cloudflare Workers](https://workers.cloudflare.com/)
- **Email Service**: [Nodemailer](https://nodemailer.com/)

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18.0.0 or higher recommended)
- **npm** (v9.0.0 or higher) or **yarn** / **pnpm**

### 2. Installation
Open your terminal inside the project folder:
```bash
# Install project dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory by copying `.env.example`:
```bash
cp .env.example .env
```

Open `.env` and configure your credentials (optional — the app has mock fallback modes):
```env
# Supabase Configuration (Optional for Cloud Persistence)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Email Notification / OTP Settings (Optional for Gmail SMTP)
SMTP_EMAIL=your-email@gmail.com
SMTP_APP_PASSWORD="your-google-app-password"
SMTP_FROM_NAME="AnnaSetu Verification"
```

> **Note**: If `.env` is omitted, AnnaSetu runs smoothly in local in-memory/localStorage mode with simulated OTP alerts!

### 4. Running the Development Server
Start the local Vite development server:
```bash
npm run dev
```

The application will be live at:
- **Local**: `http://localhost:5173/`
- **Network**: `http://<your-local-ip>:5173/`

### 5. Production Build
To create an optimized production build:
```bash
npm run build
```
To preview the built production bundle locally:
```bash
npm run preview
```

---

## 📂 Project Structure

```text
├── public/                 # Static assets (favicons, icons, headers)
│   ├── apple-touch-icon.png
│   ├── favicon.png
│   └── _headers
├── src/
│   ├── components/         # Reusable UI components
│   │   └── SubscriptionComponents.jsx  # Plans, UPI modal, rating cards, admin panel
│   ├── services/           # Business logic & services
│   │   ├── aiService.js           # Food safety analysis & recommendation logic
│   │   ├── authService.js         # User registration, authentication, admin sessions
│   │   ├── backendService.js      # Food listings & requisitions syncing
│   │   ├── emailService.js        # Email OTP & alerts handling
│   │   ├── matchingEngine.js      # Distance, priority & NGO allocation algorithm
│   │   ├── seedData.js            # Initial seed NGOs and listings
│   │   └── subscriptionService.js # UPI subscriptions, donor quality scoring
│   └── worker.js           # Cloudflare Worker API entry point
├── App.css                 # Main application styles
├── App.jsx                 # Core application controller & pages
├── index.css               # Global base styles
├── index.html              # Single page entry HTML
├── main.jsx                # React root mount entry point
├── supabase.js             # Supabase client initialization
├── testSupabase.js         # Supabase connection diagnostic helper
├── vite.config.js          # Vite config with custom backend mock server plugin
├── wrangler.json           # Cloudflare Worker deployment configuration
├── .env.example            # Sample environment variables template
└── .gitignore              # Files excluded from Git version control
```

---

## 📤 How to Upload to GitHub

You can directly upload this folder to GitHub using either method:

### Method 1: Using Git Command Line (Recommended)

```bash
# 1. Initialize git repository
git init

# 2. Add all files to staging
git add .

# 3. Create initial commit
git commit -m "Initial commit - AnnaSetu surplus food redistribution platform"

# 4. Set main branch
git branch -M main

# 5. Link your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/your-username/your-repo-name.git

# 6. Push code to GitHub
git push -u origin main
```

### Method 2: GitHub Web UI (Drag and Drop)
1. Go to [GitHub](https://github.com/) and create a new repository.
2. Under "Quick setup", click **"uploading an existing file"**.
3. Drag and drop all files and folders from this directory into GitHub.
4. Click **"Commit changes"**.

---

## 🔒 Security Notice
- Never commit `.env` or files containing actual passwords/API keys to GitHub.
- The `.gitignore` file is pre-configured to ignore `.env`, `node_modules`, and build artifacts (`dist`).

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
