const https = require('https');

function mondayRequest(query, variables) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const options = {
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.MONDAY_API_TOKEN,
        'API-Version': '2024-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error('Monday parse error: ' + d)); }
      });
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

    const apiToken = process.env.MONDAY_API_TOKEN;
    if (!apiToken) throw new Error('MONDAY_API_TOKEN not set');

    // Step 1: Find the board ID
    const boardsResult = await mondayRequest('{ boards(limit: 50) { id name } }');
    console.log('boards result:', JSON.stringify(boardsResult).substring(0, 500));

    const boards = boardsResult.data?.boards || [];
    const board = boards.find(b => b.name.toLowerCase().includes('personal pto'));
    if (!board) {
      throw new Error('Board not found. Available: ' + boards.map(b => b.name).join(', '));
    }
    console.log('Found board:', board.id, board.name);

    // Step 2: Create the item
    const itemName = name + ' - ' + type + ' (' + start + (start !== end ? ' to ' + end : '') + ')';
    const createResult = await mondayRequest(
      'mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) { id name } }',
      {
        boardId: board.id,
        itemName: itemName,
        columnValues: JSON.stringify({
          status: { label: 'Pending Approval' },
          text: 'PTO Request ID: ' + requestId + ' | Submitted: ' + new Date().toLocaleDateString() + ' | Approve: ' + approveUrl + ' | Reject: ' + rejectUrl
        })
      }
    );

    console.log('create result:', JSON.stringify(createResult).substring(0, 500));

    if (createResult.errors) {
      throw new Error('Monday error: ' + JSON.stringify(createResult.errors));
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, requestId, mondayItemId: createResult.data?.create_item?.id })
    };

  } catch(err) {
    console.error('submit-pto error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
