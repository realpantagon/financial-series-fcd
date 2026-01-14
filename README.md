# FCD Tracker 📊

A mobile-first Foreign Currency Deposit (FCD) tracker with OCR capabilities powered by Typhoon AI. Upload bank slips, automatically extract transaction data, and track your FCD entries with beautiful charts and statistics.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8.svg)

## ✨ Features

- 📸 **OCR Integration** - Upload FCD slips and auto-extract THB, USD, Rate, and Date using Typhoon OCR
- 📊 **Exchange Rate Charts** - Visualize rate trends over time with interactive charts
- 💰 **Statistics Dashboard** - Track total USD, THB, average rate, and total interest
- 📱 **Mobile-First Design** - Optimized for mobile devices with responsive Tailwind CSS
- 🔄 **Modal Workflow** - Upload → Extract → Review → Fill form seamlessly
- 🗂️ **Entry Management** - Add, view, and track all your FCD entries
- ☁️ **Supabase Backend** - Secure PostgreSQL database with real-time capabilities

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or pnpm
- Supabase account ([supabase.com](https://supabase.com))
- Typhoon API key ([opentyphoon.ai](https://opentyphoon.ai))

### 1. Create Database in Supabase

Go to your Supabase project → SQL Editor → New Query, then run:

```sql
CREATE TABLE public."Pantagon_fcd" (
  id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  status TEXT NOT NULL,
  date DATE NOT NULL,
  usd NUMERIC(12,2) NOT NULL,
  thb NUMERIC(14,2),
  rate NUMERIC(10,4),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT Pantagon_fcd_pkey PRIMARY KEY (id)
);

-- Optional: Enable Row Level Security (RLS)
ALTER TABLE public."Pantagon_fcd" ENABLE ROW LEVEL SECURITY;

-- Optional: Create policy to allow public access (adjust as needed)
CREATE POLICY "Enable read access for all users" ON public."Pantagon_fcd"
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON public."Pantagon_fcd"
  FOR INSERT WITH CHECK (true);
```

> **Note:** Replace `"Pantagon_fcd"` with your preferred table name. If you change it, update the table name in `src/api/fcd/api.ts`.

### 2. Get Supabase Credentials

1. Go to your Supabase project dashboard
2. Click **Settings** → **API**
3. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

### 3. Get Typhoon API Key

1. Visit [OpenTyphoon AI](https://opentyphoon.ai)
2. Sign up or log in to your account
3. Navigate to **API Keys** section
4. Click **Create New Key**
5. Copy your API key (starts with `sk-`)

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Typhoon OCR API Configuration
VITE_TYPHOON_API_KEY=sk-your-typhoon-api-key-here
```

### 5. Install Dependencies

```bash
pnpm install
# or
npm install
```

### 6. Run Development Server

```bash
pnpm dev
# or
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) 🎉

## 📦 Deploy to Cloudflare Pages

### Option 1: Simple Deployment (Not Recommended for Production)

> ⚠️ **Security Warning:** This exposes your Typhoon API key in the browser bundle. Use Option 2 for production.

1. **Build the project:**
   ```bash
   pnpm build
   ```

2. **Login to Cloudflare:**
   ```bash
   npx wrangler login
   ```

3. **Deploy:**
   ```bash
   npx wrangler pages deploy dist --project-name=fcd-tracker
   ```

4. **Add Environment Variables:**
   - Go to Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables
   - Add the following variables:
     ```
     VITE_SUPABASE_URL=https://your-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     VITE_TYPHOON_API_KEY=sk-your-key
     ```
   - Redeploy for changes to take effect

### Option 2: Secure Deployment with Cloudflare Workers (Recommended)

This method protects your Typhoon API key by proxying requests through a Cloudflare Worker.

1. **Create a Worker to proxy OCR requests:**

Create `functions/api/ocr.ts`:

```typescript
export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const formData = await request.formData();
    
    const response = await fetch('https://api.opentyphoon.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.TYPHOON_API_KEY}`
      },
      body: formData
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

2. **Update frontend to use Worker endpoint:**

In `src/pages/FCDDashboard.tsx`, change the OCR endpoint:

```typescript
// Replace this line:
const typhoonResponse = await fetch("https://api.opentyphoon.ai/v1/ocr", {

// With this:
const typhoonResponse = await fetch("/api/ocr", {
  method: "POST",
  // Remove Authorization header - Worker handles it
  body: formData,
});
```

3. **Remove VITE_TYPHOON_API_KEY from .env** (keep Supabase vars)

4. **Deploy with environment variables:**
   ```bash
   pnpm build
   npx wrangler pages deploy dist --project-name=fcd-tracker
   ```

5. **Add TYPHOON_API_KEY as a Worker secret:**
   - Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables
   - Add `TYPHOON_API_KEY` (without `VITE_` prefix) as a secret
   - Only add Supabase vars as `VITE_*` for frontend

## 🛠️ Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS 4 (utility-first, mobile-first)
- **Backend:** Supabase (PostgreSQL + REST API)
- **OCR:** Typhoon AI (typhoon-ocr-1.5-2b model)
- **Charts:** Recharts (responsive data visualization)
- **Date Handling:** date-fns
- **Deployment:** Cloudflare Pages (+ Workers for security)

## 📁 Project Structure

```
ocr-fcd/
├── src/
│   ├── api/fcd/           # Supabase API integration
│   │   ├── api.ts         # CRUD operations
│   │   ├── calculations.ts # Stats calculations
│   │   └── types.ts       # TypeScript types
│   ├── components/        # Reusable components
│   ├── pages/             # Main pages
│   │   └── FCDDashboard.tsx # Main dashboard
│   └── utils/             # Supabase client
├── public/
├── .env                   # Environment variables
└── package.json
```

## 🔐 Security Best Practices

1. **Never commit `.env` to version control** - Added to `.gitignore`
2. **Use Cloudflare Workers** to hide API keys from frontend bundle
3. **Enable Supabase RLS** (Row Level Security) for database protection
4. **Rotate API keys** regularly, especially if exposed
5. **Use environment-specific keys** (dev vs production)

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 💡 Tips

- **Custom Table Name:** If you want a different table name, update it in `src/api/fcd/api.ts` (all `.from('Pantagon_fcd')` references)
- **OCR Accuracy:** Ensure slip images are clear and well-lit for best extraction results
- **Mobile Testing:** Use Chrome DevTools mobile emulation for testing responsive design
- **Chart Customization:** Modify chart config in `FCDDashboard.tsx` (colors, axis format, etc.)

## 📧 Support

For issues or questions, please open an issue on GitHub.

---

Built with ❤️ using React, TypeScript, and Typhoon AI
# financial-series-fcd
