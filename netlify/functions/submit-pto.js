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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  try {
    const { requestId, name, start, end, type, location, notes, approveUrl, rejectUrl } = JSON.parse(event.body);
    console.log('submit-pto:', name, start, end);

    const formatDate = d => new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'});
    const dateRange = start===end ? formatDate(start) : formatDate(start) + ' - ' + formatDate(end);

    const slackPrompt = 'Send a Slack direct message to both Nisha Dua and Susan Lyne with this message:\n\n*New PTO Request - Approval Needed*\n*Who:* ' + name + '\n*Dates:* ' + dateRange + '\n*Type:* ' + type + (location ? '\n*Location:* ' + location : '') + (notes ? '\n*Notes:* ' + notes : '') + '\n\nApprove: ' + approveUrl + '\nReject: ' + rejectUrl + '\n\nAny one partner can approve.';

    const mondayPrompt = 'Create an item on the Monday.com board called "Personal PTO/ Office Closed":\n- Name: ' + name + '\n- Dates: ' + start + ' to ' + end + '\n- Status: Pending Approval\n- Location: ' + (location || 'N/A') + '\n- Notes: ' + (notes || '') + '\n- Information: PTO Request ID: ' + requestId + ' | Submitted: ' + new Date().toLocaleDateString() + ' | Awaiting approval';

    const emailPrompt = 'Send two emails:\n1. To nisha@bbgv.com, Subject: "PTO Approval Needed: ' + name + ' - ' + dateRange + '", Body: Hi Nisha, ' + name + ' submitted a PTO request for ' + dateRange + ' (' + type + '). Approve: ' + approveUrl + ' Reject: ' + rejectUrl + '. Thanks, BBGV PTO Tracker\n2. To susan@bbgv.com, Subject: "PTO Approval Needed: ' + name + ' - ' + dateRange + '", Body: Hi Susan, ' + name + ' submitted a PTO request for ' + dateRange + ' (' + type + '). Approve: ' + approveUrl + ' Reject: ' + rejectUrl + '. Thanks, BBGV PTO Tracker';

    const [slackRes, mondayRes, emailRes] = await Promise.allSettled([
      callClaude(slackPrompt, [{ type: 'url', url: 'https://mcp.slack.com/mcp', name: 'slack' }]),
      callClaude(mondayPrompt, [{ type: 'url', url: 'https://mcp.monday.com/mcp', name: 'monday' }]),
      callClaude(emailPrompt, [{ type: 'url', url: 'https://gmailmcp.googleapis.com/mcp/v1', name: 'gmail' }])
    ]);

    console.log('slack:', slackRes.status);
    console.log('monday:', mondayRes.status);
    console.log('email:', emailRes.status);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, slack: slackRes.status, monday: mondayRes.status, email: emailRes.status })
    };
  } catch(err) {
    console.error('Error:', err.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
