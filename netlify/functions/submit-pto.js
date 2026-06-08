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

    // Step 1: Find the board, groups and columns
    const boardsResult = await mondayRequest('{ boards(limit: 50) { id name groups { id title } columns { id title type } } }');

    const boards = boardsResult.data?.boards || [];
    const board = boards.find(b => b.name === 'Calendar of Team Events');
    if (!board) throw new Error('Board not found. Available: ' + boards.map(b => b.name).join(', '));
    console.log('Found board:', board.id);

    // Step 2: Find the group
    const group = board.groups.find(g => g.title.toLowerCase().includes('personal pto') || g.title.toLowerCase().includes('office closed'));
    if (!group) throw new Error('Group not found. Available: ' + board.groups.map(g => g.title).join(', '));
    console.log('Found group:', group.id, group.title);

    // Step 3: Log all columns so we can see their IDs
    console.log('Columns:', JSON.stringify(board.columns));

    // Step 4: Find the status column (named "Approved?")
    const statusCol = board.columns.find(c => c.title === 'Approved?' || c.type === 'status');
    console.log('Status column:', JSON.stringify(statusCol));

    // Step 5: Create the item
    const itemName = name + ' - ' + type + ' (' + start + (start !== end ? ' to ' + end : '') + ')';
    
    const columnValues = {};
    if (statusCol) {
      columnValues[statusCol.id] = { label: 'Pending Approval' };
    }

    const createResult = await mondayRequest(
      'mutation($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id name } }',
      {
        boardId: board.id,
        groupId: group.id,
        itemName: itemName,
        columnValues: JSON.stringify(columnValues)
      }
    );

    if (createResult.errors) throw new Error('Monday error: ' + JSON.stringify(createResult.errors));

    console.log('Created item:', createResult.data?.create_item?.id);

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
