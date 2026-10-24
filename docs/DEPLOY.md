# Vercel Deployment & Pre-Demo Guide

This document outlines the exact deployment workflow for deploying the **Legal-Lens** frontend to [Vercel](https://vercel.com), dynamic runtime backend URL configuration, and a comprehensive pre-demo verification checklist.

---

## 1. Step-by-Step Vercel Deployment

### Step 1: Import Repository
1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **"Add New..."** &rarr; **"Project"**.
3. Under **Import Git Repository**, select the repository:
   ```text
   NotNirav/Legal-Lens
   ```

### Step 2: Configure Project & Root Directory
Because the Legal-Lens frontend resides inside the `frontend` subfolder:
1. In the **Root Directory** field, click **Edit** and choose:
   ```text
   frontend
   ```
2. **Framework Preset**: Vercel will automatically detect **Vite**. If not, select **Vite** from the dropdown.
3. **Build & Output Settings**:
   - **Build Command**: `npm run build` (or `vite build`)
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### Step 3: Configure Environment Variables
Expand the **Environment Variables** section and configure:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://legal-lens-tunnel.trycloudflare.com` | **Must be an HTTPS endpoint** pointing to your Cloudflare Tunnel, ngrok, or production FastAPI backend. |

> [!WARNING]
> **Mixed Content Constraint (HTTPS &rarr; HTTP Block)**:
> Vercel serves applications exclusively over secure HTTPS (`https://*.vercel.app`).
> Modern web browsers strictly block plain `http://` calls (such as `http://localhost:8000` or raw `http://` IP tunnels) made from HTTPS origins.
> Your backend API URL **MUST** use `https://` (e.g. Cloudflare Quick Tunnel or ngrok HTTPS URL). If an HTTP URL is accidentally supplied, the app flags a visible **"Mixed Content"** warning badge and offers guidance.

### Step 4: Deploy
Click **"Deploy"**. The build typically completes in under 30 seconds.

---

## 2. Dynamic Backend Switching Without Redeploying (`?api=`)

When running live demos with a local Ollama/FastAPI instance exposed via Cloudflare Tunnel or ngrok, the public tunnel URL may change whenever the tunnel restarts. **You do NOT need to redeploy the frontend to update the backend URL.**

### How Runtime URL Override Works
Open your deployed Vercel URL with the `?api=` query parameter:
```text
https://legal-lens.vercel.app/?api=https://new-tunnel-name.trycloudflare.com
```

1. **Automatic Persistence**:
   - The API layer (`src/lib/api.js`) automatically validates the URL.
   - It strips any trailing slashes and saves it to `localStorage.getItem('legal_lens_api_url')`.
   - All subsequent API calls immediately route through the new tunnel.
2. **Persistent Across Refreshes**:
   - Once set, the URL remains active in that browser even if you remove `?api=` from the address bar.
3. **Visual Confirmation**:
   - The active endpoint is visibly displayed in the footer API indicator: `API: https://...`
   - If the endpoint is offline or waking up, an amber top banner will display the exact active endpoint with a **Retry** button.
4. **Resetting to Default**:
   - To revert to the deployment's default `VITE_API_URL`, run this in the browser console:
     ```javascript
     localStorage.removeItem('legal_lens_api_url');
     location.reload();
     ```

---

## 3. Demo Mode Activation (`?demo=1`)

For hackathon presentations and jury walkthroughs, Legal-Lens includes an integrated **Demo Mode** pre-loaded with the 11 golden evaluation questions from `eval/golden_demo.json` (5 English, 5 Hindi, 1 Out-of-Scope).

### Enabling Demo Mode
Append `?demo=1` (or combine with `?api=`):
```text
https://legal-lens.vercel.app/?api=https://my-tunnel.trycloudflare.com&demo=1
```

### Features Enabled by Demo Mode
1. **Navbar Demo Switch**: A glowing gold toggle switch appears in the navbar and mobile flyout menu, allowing you to toggle Demo Mode on/off at will.
2. **Golden Questions Tray**: A dedicated tray appears in the chat workspace with:
   - Filter pills: **All (11)**, **English (5)**, **हिन्दी (5)**, **Out-of-Scope (1)**.
   - **1-Click Run**: Automatically sets state to Maharashtra, switches the language to match the query, and executes streaming inquiry in one click.
   - **Pre-fill**: Loads the question into the input composer for manual editing.

---

## 4. Pre-Demo Verification Checklist

Run through this 8-step verification checklist 10 minutes before presenting to the judges:

- [ ] **1. Backend Health OK**:
  - Open `https://<tunnel-url>/health` in your browser.
  - Confirm JSON output:
    ```json
    {
      "status": "ok",
      "chunks": 1607,
      "models": { "writer": "gemma4:latest", "vision": "gemma4:latest", "reviewer": "gemma4:latest" },
      "cache_entries": 11
    }
    ```
- [ ] **2. Tunnel URL Updated in Frontend**:
  - Load the Vercel site with `?api=https://<tunnel-url>&demo=1`.
  - Check the bottom footer API pill; verify it shows your HTTPS tunnel URL and a green status dot.
  - Verify **no** red "Mixed Content (HTTP on HTTPS)" warning pill appears.
- [ ] **3. Startup Connectivity Banner Dismissed**:
  - Confirm that the top *"Server is waking up or offline"* warning banner disappears once `/health` succeeds.
- [ ] **4. State Dropdown Loads**:
  - Check the State Jurisdiction dropdown in the chat header.
  - Verify Maharashtra is selected with the green "State & Central Laws Active" badge.
  - Click "Detect my location" to test GPS + Nominatim reverse-geocoding.
- [ ] **5. English Golden Question (1-Click Run)**:
  - In Demo Mode, click **1-Click Run** on *"Can my landlord evict me immediately without any prior written notice in Maharashtra?"*
  - Verify:
    - Real-time pipeline status steps (*"Searching the law…"*, *"Checking official web sources…"*, *"Writing the answer…"*)
    - Streaming tokens fill smoothly
    - Source citation chips (`[S1]`, `[L2]`, etc.) link to interactive source cards
    - Second-model review badge appears (*"Second-model review: Supported"*)
- [ ] **6. Hindi Golden Question (Devanagari Rendering)**:
  - Click the **हिन्दी (5)** tab in the Golden Tray and click **1-Click Run** on *"क्या महाराष्ट्र में मकान मालिक बिना किसी पूर्व लिखित नोटिस के मुझे तुरंत घर से निकाल सकता है?"*
  - Verify clean Devanagari typography with Noto Sans Devanagari fallback and localized UI headers.
- [ ] **7. Document Upload (Multimodal Vision)**:
  - Click the paperclip icon in the message box.
  - Select an eviction notice, rental agreement, or employment letter (JPG/PNG/WEBP).
  - Verify client-side downscaling preview, upload progress, and the extracted metadata card (*"What we read from your document"*).
- [ ] **8. Mobile Viewport (360px)**:
  - Open Chrome DevTools Device Mode (set width to 360px &mdash; e.g. Samsung Galaxy S8 / iPhone SE).
  - Check that the sticky header, state dropdown, golden chips, and chat composer fit comfortably with zero horizontal scroll overflow.
