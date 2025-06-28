const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const connectedUsers = new Map(); 
const offlineMessages = new Map(); 
const chatHistory = new Map();
const messageCounter = { count: 0 };

function generateMessageId() {
    return `msg_${Date.now()}_${++messageCounter.count}`;
}

function getChatKey(user1, user2) {
    return [user1, user2].sort().join(':');
}

function logEvent(event, details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${event} ${details}`);
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    if (req.method === 'GET' && parsedUrl.pathname === '/messages') {
        const { user1, user2 } = parsedUrl.query;
        if (!user1 || !user2) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Both user1 and user2 parameters are required' }));
            return;
        }
        const chatKey = getChatKey(user1, user2);
        const messages = chatHistory.get(chatKey) || [];
        logEvent('CHAT_HISTORY_REQUESTED', `${user1} <-> ${user2} (${messages.length} messages)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            user1,
            user2,
            messages: messages,
            count: messages.length
        }));
        return;
    }
    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            connectedUsers: connectedUsers.size,
            offlineMessages: Array.from(offlineMessages.keys()).length,
            totalChats: chatHistory.size
        }));
        return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const userId = parsedUrl.query.userId;
    if (!userId) {
        logEvent('CONNECTION_REJECTED', 'No userId provided');
        ws.close(1008, 'userId parameter is required');
        return;
    }
    logEvent('USER_CONNECTED', userId);
    connectedUsers.set(userId, ws);
    ws.send(JSON.stringify({
        type: 'connection_ack',
        userId: userId,
        timestamp: new Date().toISOString(),
        message: 'Successfully connected to chat server'
    }));
    
    const pendingMessages = offlineMessages.get(userId) || [];
    if (pendingMessages.length > 0) {
        logEvent('DELIVERING_OFFLINE_MESSAGES', `${userId} (${pendingMessages.length} messages)`); 
        pendingMessages.forEach(msg => {
            ws.send(JSON.stringify({
                type: 'offline_message',
                ...msg
            }));
        });
        offlineMessages.delete(userId);
    }
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (message.type === 'chat_message') {
                const { from, to, content } = message;
                if (!from || !to || !content) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message format. Required: from, to, content'
                    }));
                    return;
                }
                if (from === to) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Cannot send messages to yourself'
                    }));
                    return;
                }
                const messageObj = {
                    id: generateMessageId(),
                    from,
                    to,
                    content,
                    timestamp: new Date().toISOString(),
                    delivered: false
                };
                logEvent('MESSAGE_SENT', `${from} -> ${to}: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
                const chatKey = getChatKey(from, to);
                if (!chatHistory.has(chatKey)) {
                    chatHistory.set(chatKey, []);
                }
                chatHistory.get(chatKey).push(messageObj);
                ws.send(JSON.stringify({
                    type: 'message_ack',
                    messageId: messageObj.id,
                    timestamp: new Date().toISOString()
                }));
                const recipientWs = connectedUsers.get(to);
                if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                    recipientWs.send(JSON.stringify({
                        type: 'chat_message',
                        ...messageObj,
                        delivered: true
                    }));
                    logEvent('MESSAGE_DELIVERED', `${from} -> ${to}`);
                } else {
                    if (!offlineMessages.has(to)) {
                        offlineMessages.set(to, []);
                    }
                    offlineMessages.get(to).push({
                        type: 'chat_message',
                        ...messageObj
                    });
                    logEvent('MESSAGE_BUFFERED', `${from} -> ${to} (offline)`);
                }
            }
        } catch (error) {
            logEvent('MESSAGE_PARSE_ERROR', error.message);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid JSON format'
            }));
        }
    });
    
    ws.on('close', (code, reason) => {
        logEvent('USER_DISCONNECTED', `${userId} (code: ${code}, reason: ${reason || 'No reason'})`);
        connectedUsers.delete(userId);
    });
    
    ws.on('error', (error) => {
        logEvent('WEBSOCKET_ERROR', `${userId}: ${error.message}`);
        connectedUsers.delete(userId);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logEvent('SERVER_STARTED', `Listening on port ${PORT}`);
    console.log('\n=== Real-Time Chat Backend System ===');
    console.log(`Server running on port ${PORT}`);
    console.log(' WebSocket endpoint: ws://localhost:3000');
    console.log(' REST API endpoints:');
    console.log('   GET /messages?user1=A&user2=B - Get chat history');
    console.log('   GET /health - Server health check');
    console.log('\nLogging enabled - all events will be displayed below:\n');
});