/**
 * GHL OAuth Service for Railway
 * 
 * This service handles:
 * 1. OAuth authorization flow with GoHighLevel
 * 2. Token exchange (auth code → access token)
 * 3. Token refresh (automatic)
 * 4. Token storage and retrieval for n8n
 * 
 * Endpoints:
 * - GET  /                    - Health check & status
 * - GET  /authorize           - Start OAuth flow (redirects to GHL)
 * - GET  /oauth/callback      - Handle GHL callback, exchange code for tokens
 * - GET  /api/token           - Get current access token (for n8n)
 * - POST /api/refresh         - Force token refresh
 * - GET  /api/locations       - List installed locations
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
  apiKey: process.env.API_KEY || crypto.randomBytes(32).toString('hex'), // For securing endpoints
  port: process.env.PORT || 3000
};

// Required scopes for your n8n workflow
const SCOPES = [
  'contacts.readonly',
  'contacts.write',
  'conversations.readonly', 
  'conversations.write',
  'conversations/message.write',
  'calendars.readonly',
  'calendars.write',
  'calendars/events.write',
  'locations.readonly',
  'locations/customFields.readonly',
  'locations/customFields.write',
  'locations/tags.readonly',
  'locations/tags.write',
  'users.readonly'
].join(' ');

// =============================================================================
// IN-MEMORY TOKEN STORAGE
// For production, replace with database (PostgreSQL, Redis, etc.)
// =============================================================================

const tokenStore = new Map();
// Structure: locationId -> { accessToken, refreshToken, expiresAt, locationName, installedAt }

// =============================================================================
// MIDDLEWARE
// =============================================================================

// API Key authentication for sensitive endpoints
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

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Health Check & Status
 */
app.get('/', (req, res) => {
  const configured = !!(config.clientId && config.clientSecret);
  const installedLocations = Array.from(tokenStore.keys());
  
  res.json({
    status: 'running',
    service: 'GHL OAuth Service',
    version: '1.0.0',
    configured: configured,
    redirectUri: config.redirectUri,
    installedLocations: installedLocations.length,
    endpoints: {
      authorize: '/authorize',
      callback: '/oauth/callback',
      getToken: '/api/token?locationId=XXX&apiKey=YOUR_API_KEY',
      refresh: '/api/refresh',
      locations: '/api/locations?apiKey=YOUR_API_KEY'
    },
    setup: configured ? null : {
      message: 'Missing configuration. Set these environment variables:',
      required: ['GHL_CLIENT_ID', 'GHL_CLIENT_SECRET'],
      optional: ['REDIRECT_URI', 'API_KEY']
    }
  });
});

/**
 * Start OAuth Authorization Flow
 * Redirects user to GHL to authorize the app
 */
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

  console.log(`[OAuth] Redirecting to GHL authorization: ${authUrl.toString()}`);
  res.redirect(authUrl.toString());
});

/**
 * OAuth Callback Handler
 * GHL redirects here after user authorizes
 */
app.get('/oauth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  // Handle authorization errors
  if (error) {
    console.error(`[OAuth] Authorization error: ${error} - ${error_description}`);
    return res.status(400).send(`
      <html>
        <head><title>Authorization Failed</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ Authorization Failed</h1>
          <p><strong>Error:</strong> ${error}</p>
          <p><strong>Description:</strong> ${error_description || 'No description provided'}</p>
          <p><a href="/authorize">Try again</a></p>
        </body>
      </html>
    `);
  }

  // Validate authorization code
  if (!code) {
    return res.status(400).send(`
      <html>
        <head><title>Missing Code</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ Missing Authorization Code</h1>
          <p>No authorization code was provided by GHL.</p>
          <p><a href="/authorize">Try again</a></p>
        </body>
      </html>
    `);
  }

  try {
    console.log(`[OAuth] Exchanging authorization code for tokens...`);

    // Exchange code for tokens
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
    console.log(`[OAuth] Token exchange successful!`);
    console.log(`[OAuth] Location ID: ${tokens.locationId}`);
    console.log(`[OAuth] User Type: ${tokens.userType}`);

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Store tokens
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

    console.log(`[OAuth] Tokens stored for location: ${tokens.locationId}`);

    // Success page
    res.send(`
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .success { color: #27ae60; }
            .box { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }
            .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Authorization Successful!</h1>
          
          <div class="box">
            <h3>Installation Details</h3>
            <p><strong>Location ID:</strong> <code>${tokens.locationId}</code></p>
            <p><strong>Company ID:</strong> <code>${tokens.companyId || 'N/A'}</code></p>
            <p><strong>User Type:</strong> <code>${tokens.userType}</code></p>
            <p><strong>Token Expires:</strong> ${expiresAt.toLocaleString()}</p>
          </div>

          <div class="warning">
            <strong>⚠️ Important:</strong> Save your API Key for accessing tokens:
            <br><br>
            <code style="word-break: break-all;">${config.apiKey}</code>
          </div>

          <div class="box">
            <h3>Next Steps for n8n</h3>
            <p>Update your n8n HTTP Header Auth credential with:</p>
            <ol>
              <li>Go to n8n → Credentials</li>
              <li>Find your GHL credential (HTTP Header Auth)</li>
              <li>Set the header name to: <code>Authorization</code></li>
              <li>Set the header value to: <code>Bearer ${tokens.access_token.substring(0, 20)}...</code></li>
            </ol>
            <p>Or use this endpoint to get fresh tokens:</p>
            <code>GET /api/token?locationId=${tokens.locationId}&apiKey=YOUR_API_KEY</code>
          </div>

          <div class="box">
            <h3>Test Your Token</h3>
            <p><a href="/api/token?locationId=${tokens.locationId}&apiKey=${config.apiKey}" target="_blank">
              Click here to view your token details
            </a></p>
          </div>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('[OAuth] Token exchange failed:', err.response?.data || err.message);
    
    res.status(500).send(`
      <html>
        <head><title>Token Exchange Failed</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ Token Exchange Failed</h1>
          <p><strong>Error:</strong> ${err.response?.data?.error || err.message}</p>
          <p><strong>Description:</strong> ${err.response?.data?.error_description || 'Unknown error'}</p>
          <pre style="text-align: left; background: #f5f5f5; padding: 20px; overflow: auto;">
${JSON.stringify(err.response?.data || {}, null, 2)}
          </pre>
          <p><a href="/authorize">Try again</a></p>
        </body>
      </html>
    `);
  }
});

/**
 * Get Access Token
 * n8n calls this endpoint to get the current valid token
 */
app.get('/api/token', requireApiKey, async (req, res) => {
  const { locationId } = req.query;

  if (!locationId) {
    // If no locationId specified, return first available or list all
    const locations = Array.from(tokenStore.keys());
    if (locations.length === 0) {
      return res.status(404).json({
        error: 'No tokens',
        message: 'No locations have been authorized yet. Visit /authorize to connect a location.'
      });
    }
    if (locations.length === 1) {
      req.query.locationId = locations[0];
    } else {
      return res.status(400).json({
        error: 'Multiple locations',
        message: 'Multiple locations are connected. Please specify locationId.',
        availableLocations: locations
      });
    }
  }

  const tokenData = tokenStore.get(req.query.locationId);
  
  if (!tokenData) {
    return res.status(404).json({
      error: 'Not found',
      message: `No tokens found for location ${req.query.locationId}`,
      availableLocations: Array.from(tokenStore.keys())
    });
  }

  // Check if token is expired or expiring soon (within 5 minutes)
  const expiresAt = new Date(tokenData.expiresAt);
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt - now < fiveMinutes) {
    console.log(`[Token] Token expiring soon, refreshing...`);
    
    try {
      const newTokens = await refreshToken(tokenData.refreshToken, req.query.locationId);
      return res.json({
        accessToken: newTokens.accessToken,
        expiresAt: newTokens.expiresAt,
        locationId: req.query.locationId,
        refreshed: true
      });
    } catch (err) {
      console.error('[Token] Refresh failed:', err.message);
      // Return existing token even if refresh failed
    }
  }

  res.json({
    accessToken: tokenData.accessToken,
    expiresAt: tokenData.expiresAt,
    locationId: req.query.locationId,
    refreshed: false,
    installedAt: tokenData.installedAt
  });
});

/**
 * Force Token Refresh
 */
app.post('/api/refresh', requireApiKey, async (req, res) => {
  const { locationId } = req.body || req.query;

  if (!locationId) {
    return res.status(400).json({
      error: 'Missing locationId',
      message: 'Please provide locationId in request body or query'
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

/**
 * List Installed Locations
 */
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

  res.json({
    count: locations.length,
    locations: locations
  });
});

/**
 * Webhook endpoint for GHL app events (optional)
 */
app.post('/webhook/ghl', (req, res) => {
  console.log('[Webhook] Received GHL webhook:', req.body);
  
  // Handle uninstall events
  if (req.body.type === 'UNINSTALL') {
    const locationId = req.body.locationId;
    if (locationId && tokenStore.has(locationId)) {
      tokenStore.delete(locationId);
      console.log(`[Webhook] Removed tokens for uninstalled location: ${locationId}`);
    }
  }

  res.json({ received: true });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Refresh an access token
 */
async function refreshToken(refreshToken, locationId) {
  console.log(`[Refresh] Refreshing token for location: ${locationId}`);

  const response = await axios.post(
    `${config.baseUrl}/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken
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

  // Update stored tokens
  const existingData = tokenStore.get(locationId) || {};
  tokenStore.set(locationId, {
    ...existingData,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || existingData.refreshToken,
    expiresAt: expiresAt.toISOString(),
    expiresIn: tokens.expires_in,
    lastRefreshed: new Date().toISOString()
  });

  console.log(`[Refresh] Token refreshed successfully, expires: ${expiresAt.toISOString()}`);

  return {
    accessToken: tokens.access_token,
    expiresAt: expiresAt.toISOString()
  };
}

// =============================================================================
// START SERVER
// =============================================================================

app.listen(config.port, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           GHL OAuth Service Started                        ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Port: ${config.port}                                              ║`);
  console.log(`║  Redirect URI: ${config.redirectUri?.substring(0, 43) || 'Not set'}  ║`);
  console.log(`║  Client ID: ${config.clientId ? 'Configured ✓' : 'NOT SET ✗'}                           ║`);
  console.log(`║  Client Secret: ${config.clientSecret ? 'Configured ✓' : 'NOT SET ✗'}                       ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                                ║');
  console.log('║    GET  /              - Status & health check             ║');
  console.log('║    GET  /authorize     - Start OAuth flow                  ║');
  console.log('║    GET  /oauth/callback - OAuth callback handler           ║');
  console.log('║    GET  /api/token     - Get access token (for n8n)        ║');
  console.log('║    POST /api/refresh   - Force token refresh               ║');
  console.log('║    GET  /api/locations - List connected locations          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  if (!config.clientId || !config.clientSecret) {
    console.log('\n⚠️  WARNING: Missing GHL credentials!');
    console.log('   Set GHL_CLIENT_ID and GHL_CLIENT_SECRET environment variables.');
  }
});
