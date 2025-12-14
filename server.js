/**
 * Reece AI Chatbot - OAuth Service
 * 
 * OAuth service for GoHighLevel Sub-Account integration.
 * 
 * Endpoints:
 * - GET  /                    - Health check & status
 * - GET  /authorize           - Start OAuth flow (redirects to GHL)
 * - GET  /oauth/callback      - Handle GHL callback, exchange code for tokens
 * - GET  /api/token           - Get current access token (for n8n)
 * - POST /api/refresh         - Force token refresh
 * - GET  /api/locations       - List installed locations
 * - POST /webhook/ghl         - Handle GHL webhook events
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  clientId: process.env.GHL_CLIENT_ID,
  clientSecret: process.env.GHL_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI || `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/oauth/callback`,
  baseUrl: 'https://services.leadconnectorhq.com',
  marketplaceUrl: 'https://marketplace.gohighlevel.com',
  apiKey: process.env.API_KEY || crypto.randomBytes(32).toString('hex'),
  port: process.env.PORT || 3000,
  appName: 'Reece AI Chatbot'
};

// =============================================================================
// SCOPES - Matching exactly what's enabled in the GHL App
// =============================================================================

const SCOPES = [
  // Contacts
  'contacts.readonly',
  'contacts.write',
  
  // Conversations
  'conversations.readonly',
  'conversations.write',
  'conversations/message.write',
  'conversations/message.readonly',
  'conversations/reports.readonly',
  'conversations/livechat.write',
  
  // Calendars
  'calendars.readonly',
  'calendars.write',
  'calendars/events.readonly',
  'calendars/events.write',
  'calendars/groups.readonly',
  'calendars/groups.write',
  'calendars/resources.readonly',
  'calendars/resources.write',
  
  // Locations (NO locations.write - Sub-Account level)
  'locations.readonly',
  'locations/customFields.readonly',
  'locations/customFields.write',
  'locations/customValues.readonly',
  'locations/customValues.write',
  'locations/tags.readonly',
  'locations/tags.write',
  'locations/templates.readonly',
  'locations/tasks.readonly',
  'locations/tasks.write',
  
  // Users
  'users.readonly',
  'users.write',
  
  // Opportunities
  'opportunities.readonly',
  'opportunities.write',
  
  // OAuth
  'oauth.readonly',
  'oauth.write',
  
  // Funnels
  'funnels/funnel.readonly',
  'funnels/page.readonly',
  'funnels/redirect.readonly',
  'funnels/redirect.write',
  'funnels/pagecount.readonly',
  
  // Media
  'medias.readonly',
  'medias.write',
  
  // Recurring Tasks
  'recurring-tasks.readonly',
  'recurring-tasks.write',
  
  // Links
  'links.readonly',
  'links.write',
  
  // Email
  'lc-email.readonly',
  
  // Invoices
  'invoices.readonly',
  'invoices.write',
  'invoices/estimate.readonly',
  'invoices/estimate.write',
  'invoices/template.readonly',
  'invoices/template.write',
  'invoices/schedule.readonly',
  'invoices/schedule.write',
  
  // Forms
  'forms.readonly',
  'forms.write',
  
  // Courses
  'courses.readonly',
  'courses.write',
  
  // Associations
  'associations.readonly',
  'associations.write',
  'associations/relation.readonly',
  'associations/relation.write',
  
  // Objects
  'objects/record.readonly',
  'objects/record.write',
  'objects/schema.readonly',
  'objects/schema.write',
  
  // Businesses
  'businesses.readonly',
  'businesses.write',
  
  // Campaigns
  'campaigns.readonly',
  
  // Payments
  'payments/orders.readonly',
  'payments/orders.write',
  'payments/orders.collectPayment',
  'payments/integration.readonly',
  'payments/integration.write',
  'payments/transactions.readonly',
  'payments/subscriptions.readonly',
  'payments/coupons.readonly',
  'payments/coupons.write',
  'payments/custom-provider.readonly',
  'payments/custom-provider.write',
  
  // Products
  'products.readonly',
  'products.write',
  'products/prices.readonly',
  'products/prices.write',
  'products/collection.readonly',
  'products/collection.write',
  
  // Social Planner
  'socialplanner/oauth.readonly',
  'socialplanner/oauth.write',
  'socialplanner/post.readonly',
  'socialplanner/post.write',
  'socialplanner/account.readonly',
  'socialplanner/account.write',
  'socialplanner/csv.readonly',
  'socialplanner/csv.write',
  'socialplanner/category.readonly',
  'socialplanner/category.write',
  'socialplanner/tag.readonly',
  'socialplanner/tag.write',
  'socialplanner/statistics.readonly',
  
  // Store
  'store/shipping.readonly',
  'store/shipping.write',
  'store/setting.readonly',
  'store/setting.write',
  
  // Surveys
  'surveys.readonly',
  
  // Workflows
  'workflows.readonly',
  
  // Emails
  'emails/builder.readonly',
  'emails/builder.write',
  'emails/schedule.readonly',
  
  // WordPress
  'wordpress.site.readonly',
  
  // Blogs
  'blogs/post.write',
  'blogs/check-slug.readonly',
  'blogs/post-update.write',
  'blogs/category.readonly',
  'blogs/author.readonly',
  'blogs/posts.readonly',
  'blogs/list.readonly',
  
  // Charges
  'charges.readonly',
  'charges.write',
  
  // Marketplace
  'marketplace-installer-details.readonly',
  
  // Phone/Twilio
  'twilioaccount.read',
  'phonenumbers.read',
  'numberpools.read',
  
  // Documents/Contracts
  'documents_contracts/list.readonly',
  'documents_contracts/sendLink.write',
  'documents_contracts_template/sendLink.write',
  'documents_contracts_template/list.readonly',
  
  // Voice AI
  'voice-ai-dashboard.readonly',
  'voice-ai-agents.readonly',
  'voice-ai-agents.write',
  'voice-ai-agent-goals.readonly',
  'voice-ai-agent-goals.write',
  
  // Knowledge Bases
  'knowledge-bases.readonly',
  'knowledge-bases.write',
  
  // Conversation AI
  'conversation-ai.readonly',
  'conversation-ai.write',
  
  // Agent Studio
  'agent-studio.readonly',
  'agent-studio.write'
].join(' ');

// =============================================================================
// IN-MEMORY TOKEN STORAGE
// For production, replace with database (PostgreSQL, Redis, etc.)
// =============================================================================

const tokenStore = new Map();

// =============================================================================
// MIDDLEWARE
// =============================================================================

const requireApiKey = (req, res, next) => {
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!providedKey || providedKey !== config.apiKey) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Valid API key required' 
    });
  }
  next();
};

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Api-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

app.get('/', (req, res) => {
  const configured = !!(config.clientId && config.clientSecret);
  const installedLocations = Array.from(tokenStore.keys());
  const scopeCount = SCOPES.split(' ').length;
  
  res.json({
    status: 'running',
    service: config.appName,
    version: '2.1.0',
    configured: configured,
    redirectUri: config.redirectUri,
    scopeCount: scopeCount,
    installedLocations: installedLocations.length,
    endpoints: {
      authorize: '/authorize',
      callback: '/oauth/callback',
      getToken: '/api/token?locationId=XXX&apiKey=YOUR_API_KEY',
      refresh: '/api/refresh',
      locations: '/api/locations?apiKey=YOUR_API_KEY',
      webhook: '/webhook/ghl'
    }
  });
});

app.get('/authorize', (req, res) => {
  if (!config.clientId) {
    return res.status(500).json({ 
      error: 'Not configured', 
      message: 'GHL_CLIENT_ID environment variable not set' 
    });
  }

  const authUrl = new URL(`${config.marketplaceUrl}/oauth/chooselocation`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('scope', SCOPES);

  console.log(`[OAuth] Redirecting to GHL authorization`);
  console.log(`[OAuth] Scopes requested: ${SCOPES.split(' ').length} scopes`);
  res.redirect(authUrl.toString());
});

app.get('/oauth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error(`[OAuth] Authorization error: ${error} - ${error_description}`);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Failed - ${config.appName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); min-height: 100vh; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #dc2626; margin-bottom: 20px; }
            .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; }
            a { color: #3b82f6; }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; margin-top: 20px; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authorization Failed</h1>
            <div class="error-box">
              <p><strong>Error:</strong> ${error}</p>
              <p><strong>Description:</strong> ${error_description || 'No description provided'}</p>
            </div>
            <a href="/authorize" class="btn">Try Again</a>
          </div>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    console.log(`[OAuth] Exchanging authorization code for tokens...`);

    const tokenResponse = await axios.post(
      `${config.baseUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code,
        redirect_uri: config.redirectUri
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    const tokens = tokenResponse.data;
    console.log(`[OAuth] ✅ Token exchange successful!`);
    console.log(`[OAuth] Location ID: ${tokens.locationId}`);

    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    tokenStore.set(tokens.locationId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiresAt.toISOString(),
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
      locationId: tokens.locationId,
      companyId: tokens.companyId,
      userId: tokens.userId,
      userType: tokens.userType,
      installedAt: new Date().toISOString()
    });

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connected! - ${config.appName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); min-height: 100vh; }
            .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #059669; margin-bottom: 8px; font-size: 28px; }
            .subtitle { color: #6b7280; margin-bottom: 30px; }
            .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
            .info-card h3 { color: #1e3a8a; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; }
            .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .info-row:last-child { border-bottom: none; }
            .info-label { color: #64748b; font-size: 14px; }
            .info-value { font-family: monospace; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 16px 20px; margin: 20px 0; }
            .warning-title { font-weight: 600; color: #92400e; margin-bottom: 4px; }
            .token-box { background: #1e293b; border-radius: 8px; padding: 12px 16px; margin-top: 8px; overflow-x: auto; }
            .token-box code { color: #4ade80; font-family: monospace; font-size: 11px; word-break: break-all; }
            .steps { background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; padding: 20px; margin: 20px 0; }
            .steps h3 { color: #166534; margin-bottom: 12px; }
            .steps ol { padding-left: 20px; color: #15803d; }
            .steps li { margin: 8px 0; }
            .steps code { background: #dcfce7; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 8px; }
            .btn:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Successfully Connected!</h1>
            <p class="subtitle">${config.appName} is now connected to your GoHighLevel account</p>
            
            <div class="info-card">
              <h3>Installation Details</h3>
              <div class="info-row">
                <span class="info-label">Location ID</span>
                <span class="info-value">${tokens.locationId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Company ID</span>
                <span class="info-value">${tokens.companyId || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">User Type</span>
                <span class="info-value">${tokens.userType}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Token Expires</span>
                <span class="info-value">${expiresAt.toLocaleString()}</span>
              </div>
            </div>

            <div class="warning">
              <div class="warning-title">⚠️ Save Your API Key</div>
              <div class="token-box">
                <code>${config.apiKey}</code>
              </div>
            </div>

            <div class="steps">
              <h3>🔧 Next Steps for n8n</h3>
              <ol>
                <li>Go to <strong>n8n → Credentials</strong></li>
                <li>Create/update <strong>HTTP Header Auth</strong> credential</li>
                <li>Header name: <code>Authorization</code></li>
                <li>Header value: <code>Bearer ${tokens.access_token.substring(0, 30)}...</code></li>
              </ol>
            </div>

            <a href="/api/token?locationId=${tokens.locationId}&apiKey=${config.apiKey}" class="btn" target="_blank">
              View Token Details →
            </a>
          </div>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('[OAuth] Token exchange failed:', err.response?.data || err.message);
    const errorData = err.response?.data || {};
    
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Token Exchange Failed - ${config.appName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); min-height: 100vh; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #dc2626; margin-bottom: 20px; }
            .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; }
            pre { background: #1e293b; color: #f1f5f9; padding: 16px; border-radius: 8px; overflow: auto; font-size: 12px; }
            .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; margin-top: 20px; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Token Exchange Failed</h1>
            <div class="error-box">
              <p><strong>Error:</strong> ${errorData.error || err.message}</p>
              <p><strong>Description:</strong> ${errorData.error_description || 'Unknown error'}</p>
            </div>
            <pre>${JSON.stringify(errorData, null, 2)}</pre>
            <a href="/authorize" class="btn">Try Again</a>
          </div>
        </body>
      </html>
    `);
  }
});

app.get('/api/token', requireApiKey, async (req, res) => {
  let { locationId } = req.query;

  if (!locationId) {
    const locations = Array.from(tokenStore.keys());
    if (locations.length === 0) {
      return res.status(404).json({
        error: 'No tokens',
        message: 'No locations have been authorized yet. Visit /authorize to connect.'
      });
    }
    if (locations.length === 1) {
      locationId = locations[0];
    } else {
      return res.status(400).json({
        error: 'Multiple locations',
        message: 'Multiple locations connected. Please specify locationId.',
        availableLocations: locations
      });
    }
  }

  const tokenData = tokenStore.get(locationId);
  
  if (!tokenData) {
    return res.status(404).json({
      error: 'Not found',
      message: `No tokens found for location ${locationId}`,
      availableLocations: Array.from(tokenStore.keys())
    });
  }

  const expiresAt = new Date(tokenData.expiresAt);
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now < fiveMinutes) {
    console.log(`[Token] Token expiring soon, refreshing...`);
    
    try {
      const newTokens = await refreshToken(tokenData.refreshToken, locationId);
      return res.json({
        accessToken: newTokens.accessToken,
        expiresAt: newTokens.expiresAt,
        locationId: locationId,
        refreshed: true
      });
    } catch (err) {
      console.error('[Token] Refresh failed:', err.message);
    }
  }

  res.json({
    accessToken: tokenData.accessToken,
    expiresAt: tokenData.expiresAt,
    locationId: locationId,
    refreshed: false,
    installedAt: tokenData.installedAt
  });
});

app.post('/api/refresh', requireApiKey, async (req, res) => {
  const { locationId } = req.body || req.query;

  if (!locationId) {
    return res.status(400).json({
      error: 'Missing locationId',
      message: 'Please provide locationId'
    });
  }

  const tokenData = tokenStore.get(locationId);
  
  if (!tokenData) {
    return res.status(404).json({
      error: 'Not found',
      message: `No tokens found for location ${locationId}`
    });
  }

  try {
    const newTokens = await refreshToken(tokenData.refreshToken, locationId);
    res.json({
      success: true,
      accessToken: newTokens.accessToken,
      expiresAt: newTokens.expiresAt,
      locationId: locationId
    });
  } catch (err) {
    res.status(500).json({
      error: 'Refresh failed',
      message: err.message
    });
  }
});

app.get('/api/locations', requireApiKey, (req, res) => {
  const locations = [];
  
  for (const [locationId, data] of tokenStore.entries()) {
    locations.push({
      locationId: locationId,
      companyId: data.companyId,
      userType: data.userType,
      installedAt: data.installedAt,
      expiresAt: data.expiresAt,
      isExpired: new Date(data.expiresAt) < new Date()
    });
  }

  res.json({ count: locations.length, locations: locations });
});

app.post('/webhook/ghl', (req, res) => {
  console.log('[Webhook] Received:', JSON.stringify(req.body, null, 2));
  
  const { type, locationId } = req.body;
  
  if (type === 'UNINSTALL' || type === 'uninstall') {
    if (locationId && tokenStore.has(locationId)) {
      tokenStore.delete(locationId);
      console.log(`[Webhook] Removed tokens for: ${locationId}`);
    }
  }

  res.json({ received: true });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function refreshToken(refreshTokenValue, locationId) {
  console.log(`[Refresh] Refreshing token for location: ${locationId}`);

  const response = await axios.post(
    `${config.baseUrl}/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshTokenValue
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    }
  );

  const tokens = response.data;
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

  const existingData = tokenStore.get(locationId) || {};
  tokenStore.set(locationId, {
    ...existingData,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || existingData.refreshToken,
    expiresAt: expiresAt.toISOString(),
    expiresIn: tokens.expires_in,
    lastRefreshed: new Date().toISOString()
  });

  console.log(`[Refresh] ✅ Token refreshed, expires: ${expiresAt.toISOString()}`);

  return {
    accessToken: tokens.access_token,
    expiresAt: expiresAt.toISOString()
  };
}

// =============================================================================
// START SERVER
// =============================================================================

app.listen(config.port, () => {
  const scopeCount = SCOPES.split(' ').length;
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                ║');
  console.log('║       🤖  REECE AI CHATBOT - OAuth Service                     ║');
  console.log('║          Version 2.1.0 (Sub-Account Compatible)                ║');
  console.log('║                                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Port:          ${String(config.port).padEnd(45)}║`);
  console.log(`║  Redirect URI:  ${(config.redirectUri || 'Not set').substring(0, 45).padEnd(45)}║`);
  console.log(`║  Client ID:     ${config.clientId ? '✅ Configured'.padEnd(45) : '❌ NOT SET'.padEnd(45)}║`);
  console.log(`║  Client Secret: ${config.clientSecret ? '✅ Configured'.padEnd(45) : '❌ NOT SET'.padEnd(45)}║`);
  console.log(`║  Scopes:        ${String(scopeCount + ' permissions').padEnd(45)}║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                                    ║');
  console.log('║    GET  /              → Status                                ║');
  console.log('║    GET  /authorize     → Start OAuth                           ║');
  console.log('║    GET  /oauth/callback→ OAuth callback                        ║');
  console.log('║    GET  /api/token     → Get access token                      ║');
  console.log('║    POST /api/refresh   → Refresh token                         ║');
  console.log('║    GET  /api/locations → List locations                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  if (!config.clientId || !config.clientSecret) {
    console.log('⚠️  WARNING: Missing GHL credentials!');
    console.log('');
  }
});
