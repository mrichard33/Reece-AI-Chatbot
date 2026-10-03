# Reece-AI-Chatbot

🤖 **An intelligent, NEPQ-trained AI sales assistant that qualifies leads and books appointments around the clock.**

## What It Does

Reece is a conversational AI chatbot designed for home improvement companies (specifically impact windows & doors) that:

- **Qualifies leads** using NEPQ (Neuro-Emotional Persuasion Questions) sales methodology
- **Books appointments** directly into your calendar
- **Manages conversations** across SMS and live chat
- **Speaks multiple languages** (English, Spanish, Portuguese, French, Creole)
- **Remembers context** across sessions with intelligent memory management
- **Integrates seamlessly** with GoHighLevel CRM

## Key Features

| Feature | Description |
|---------|-------------|
| 🧠 **NEPQ Sales Flow** | 9-stage conversation framework that helps prospects sell themselves |
| 📅 **Smart Scheduling** | Real-time calendar availability with automatic appointment booking |
| 🌐 **Multi-Language** | Auto-detects and responds in the customer's preferred language |
| 💾 **Session Memory** | Persists conversation context, trust scores, and customer insights |
| 🔐 **OAuth Service** | Dedicated token management for secure GHL API access |
| ⚡ **n8n Powered** | Flexible workflow automation with 50+ integrated nodes |

## Architecture

- **OAuth Service**: Node.js/Express service for GHL token management (Railway)
- **Workflow Engine**: n8n for conversation orchestration and API integrations
- **AI Backend**: GPT-4o with custom NEPQ prompting and intent analysis
- **Vector Store**: Supabase for RAG-based knowledge retrieval
- **CRM**: GoHighLevel for contact management, messaging, and scheduling

## Tech Stack

`Node.js` `Express` `n8n` `OpenAI GPT-4o` `GoHighLevel API` `Supabase` `Railway`

---

Built for 24/7 automated lead engagement and appointment setting.

## SET UP
# GHL OAuth Service for n8n

A dedicated OAuth service for connecting GoHighLevel to n8n workflows. Handles the complete OAuth 2.0 flow, token storage, and automatic token refresh.

## 🚀 Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

### Step-by-Step Railway Deployment

#### 1️⃣ Create a New Project on Railway

1. Go to [railway.app](https://railway.app) and log in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"** (recommended) or **"Empty Project"**

#### 2️⃣ If Using GitHub (Recommended):

1. Push this code to a new GitHub repository
2. In Railway, select that repository
3. Railway will auto-detect it's a Node.js app

#### 3️⃣ If Using Empty Project:

1. Create an empty project
2. Click **"Add Service"** → **"Empty Service"**
3. Go to **Settings** → **Deploy** → Connect your repo OR use Railway CLI

#### 4️⃣ Configure Environment Variables

In Railway, go to your service → **Variables** tab and add:

```
GHL_CLIENT_ID=your_client_id_from_ghl
GHL_CLIENT_SECRET=your_client_secret_from_ghl
API_KEY=your_secure_random_key
ALLOWED_LOCATION_IDS=your_ghl_location_id   # optional, recommended
```

`API_KEY` is required: the success page no longer shows it (it used to show it to
anyone who installed the app). `ALLOWED_LOCATION_IDS` (comma-separated) refuses
installs from any other GHL location. Send the key in the `X-Api-Key` header.

#### 5️⃣ Get Your Public URL

1. Go to **Settings** → **Networking**
2. Click **"Generate Domain"** to get a Railway URL
3. Your URL will be something like: `https://ghl-oauth-production-xxxx.up.railway.app`

---

## 📋 GHL Marketplace App Setup

### Step 1: Register as a Developer

1. Go to [marketplace.gohighlevel.com](https://marketplace.gohighlevel.com)
2. Sign up or log in
3. Complete developer verification if required

### Step 2: Create Your App

1. Click **"My Apps"** → **"Create App"**
2. Fill in the details:
   - **App Name**: Your app name (e.g., "Reece AI Chatbot")
   - **Description**: What your app does
   - **App Type**: 
     - `Private` = Only for your agency
     - `Public` = Anyone can install

### Step 3: Configure OAuth Settings

In your GHL app settings, set the **Redirect URI** to:

```
https://YOUR-RAILWAY-URL.up.railway.app/oauth/callback
```

Example:
```
https://ghl-oauth-production-abc123.up.railway.app/oauth/callback
```

### Step 4: Select Scopes

Enable these scopes for your n8n workflow:

| Scope | Description |
|-------|-------------|
| `contacts.readonly` | Read contact data |
| `contacts.write` | Update contacts |
| `conversations.readonly` | Read conversations |
| `conversations.write` | Create/update conversations |
| `conversations/message.write` | Send messages |
| `calendars.readonly` | Read calendar data |
| `calendars.write` | Update calendars |
| `calendars/events.write` | Create appointments |
| `locations.readonly` | Read location info |
| `locations/customFields.readonly` | Read custom fields |
| `locations/customFields.write` | Update custom fields |
| `locations/tags.readonly` | Read tags |
| `locations/tags.write` | Add/remove tags |
| `users.readonly` | Read user info |

### Step 5: Save Your Credentials

After creating the app, you'll receive:
- **Client ID**: `xxxxxxxxxxxxxxxxxxxx`
- **Client Secret**: `xxxxxxxxxxxxxxxxxxxx`

⚠️ **Save the Client Secret immediately** - it's only shown once!

---

## 🔐 Installing Your App

### Method 1: Direct Authorization Link

Visit this URL (replace with your values):

```
https://YOUR-RAILWAY-URL.up.railway.app/authorize
```

This will redirect you to GHL to authorize the app.

### Method 2: GHL Marketplace (for Public Apps)

1. Go to your GHL sub-account
2. Settings → Integrations → Marketplace
3. Find and install your app

---

## 📡 API Endpoints

### Health Check
```
GET /
```
Returns service status and configuration info.

### Start OAuth Flow
```
GET /authorize
```
Redirects to GHL authorization page.

### OAuth Callback
```
GET /oauth/callback?code=xxx
```
GHL redirects here after authorization. Exchanges code for tokens.

### Get Access Token (for n8n)
```
GET /api/token?locationId=xxx&apiKey=YOUR_API_KEY
```
Returns the current access token. Auto-refreshes if expired.

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJS...",
  "expiresAt": "2024-01-15T10:30:00.000Z",
  "locationId": "abc123",
  "refreshed": false
}
```

### Force Token Refresh
```
POST /api/refresh?apiKey=YOUR_API_KEY
Content-Type: application/json

{"locationId": "abc123"}
```

### List Connected Locations
```
GET /api/locations?apiKey=YOUR_API_KEY
```
Returns all installed locations and their token status.

---

## 🔧 Connecting to n8n

### Option A: Use HTTP Request Node with Dynamic Token

Create a workflow that fetches the token before GHL API calls:

1. **HTTP Request Node** - Get Token:
   - URL: `https://YOUR-RAILWAY-URL/api/token?locationId=YOUR_LOCATION_ID&apiKey=YOUR_API_KEY`
   - Method: GET

2. **HTTP Request Node** - Call GHL API:
   - URL: `https://services.leadconnectorhq.com/contacts/...`
   - Authentication: None (we'll add header manually)
   - Headers: 
     - `Authorization`: `Bearer {{ $json.accessToken }}`
     - `Version`: `2021-07-28`

### Option B: Update n8n Credential Manually

After installing your GHL app:

1. Visit: `https://YOUR-RAILWAY-URL/api/token?locationId=YOUR_LOCATION&apiKey=YOUR_KEY`
2. Copy the `accessToken` value
3. In n8n → Credentials → Your GHL Credential
4. Update the Bearer token value

⚠️ **Note**: Tokens expire! Option A is recommended for production.

### Option C: Create a Pre-Request Workflow

Create a sub-workflow that all GHL workflows call first to get a fresh token.

---

## 🔄 Token Refresh

Tokens automatically refresh when:
- You call `/api/token` and the token expires within 5 minutes
- You manually call `/api/refresh`

GHL tokens typically expire in 24 hours.

---

## 🛡️ Security Notes

1. **Always use HTTPS** (Railway provides this automatically)
2. **Set a strong API_KEY** in environment variables
3. **Never expose your API_KEY** in client-side code
4. **Rotate API_KEY periodically** for production

---

## 🐛 Troubleshooting

### "Invalid JWT" Error
- Token has expired
- Call `/api/refresh` or reinstall the app

### "Unauthorized" Error  
- Wrong or missing API key
- Check `X-Api-Key` header or `apiKey` query parameter

### "No tokens found"
- App not installed for that location
- Visit `/authorize` to install

### OAuth Callback Fails
- Check Redirect URI matches exactly in GHL app settings
- Ensure Railway URL is correct

### Token Refresh Fails
- Client credentials may have changed
- Reinstall the app via `/authorize`

---

## 📁 File Structure

```
ghl-oauth-service/
├── server.js        # Main application
├── package.json     # Dependencies
├── .env.example     # Environment variables template
└── README.md        # This file
```

---

## 🚀 Production Recommendations

1. **Add a Database**: Replace in-memory `tokenStore` with PostgreSQL or Redis
2. **Add Monitoring**: Connect to Railway's built-in metrics or add Sentry
3. **Add Rate Limiting**: Protect API endpoints from abuse
4. **Set Up Alerts**: Monitor for token refresh failures

---

## 📞 Support

If you encounter issues:
1. Check Railway logs for error messages
2. Verify GHL app credentials
3. Ensure redirect URI matches exactly
4. Test the `/` endpoint for configuration status
