const https = require('https');

function callClaude(prompt, mcpServers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      mcp_servers: mcpServers,
      messages: [{ role: 'user', content: prompt }]
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const { id: requestId, action, name, start, end, type, location, notes } = event.queryStringParameters || {};

  if (!requestId || !action) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: '<h2>Invalid request.</h2>' };
  }

  const approved = action === 'approve';

  const pageHtml = (icon, heading, message, color) => `<!DOCTYPE html>
<html><head><title>${heading}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@300;400&family=DM+Mono&display=swap" rel="stylesheet">
<style>body{font-family:'DM Mono',monospace;background:#FAF7F2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{background:white;border:1px solid #DDD5C8;border-radius:4px;padding:48px;max-width:480px;text-align:center}h1{font-family:'Fraunces',serif;font-weight:300;font-size:28px;margin-bottom:12px;color:${color}}.icon{font-size:48px;margin-bottom:20px}p{color:#8C7E6E;font-size:13px;line-height:1.7}</style>
</head><body><div class="box"><div class="icon">${icon}</div><h1>${heading}</h1><p>${message}</p></div></body></html>`;

  try {
    if (approved) {
      const [calRes, mondayRes] = await Promise.allSettled([
        callClaude(
          `Create a Google Calendar event on the primary calendar: Title: "${name} - ${type}", Start: ${start} (all-day), End: ${end} (all-day), Description: "Approved PTO | ${type}${location?' | Location: '+location:''}${notes?' | Notes: '+notes:''}"`,
          [{ type: 'url', url: 'https://calendarmcp.googleapis.com/mcp/v1', name: 'google-calendar' }]
        ),
        callClaude(
          `On the Monday.com board "Personal PTO/ Office Closed", find the item with Information containing "PTO Request ID: ${requestId}" and update its Status to "Approved".`,
          [{ type: 'url', url: 'https://mcp.monday.com/mcp', name: 'monday' }]
        )
      ]);
      console.log('approve - calendar:', calRes.status, 'monday:', mondayRes.status);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: pageHtml('✅', 'PTO Approved',
