const WebSocket = require('ws');
const readline = require('readline');

class ChatClient {
    constructor(userId, serverUrl = 'ws://localhost:3000') {
        this.userId = userId;
        this.serverUrl = `${serverUrl}?userId=${userId}`;
        this.ws = null;
        this.isConnected = false;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
    
    connect() {
        console.log(`Connecting to server as ${this.userId}...`);
        this.ws = new WebSocket(this.serverUrl);
        this.ws.on('open', () => {
            this.isConnected = true;
            console.log(`Connected to server as ${this.userId}`);
            console.log(' Type your messages in format: "to:message" (e.g., "A:Hello there!")');
            console.log(' Commands: "history A" to get chat history, "quit" to disconnect\n');
            this.promptForInput();
        });
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(message);
            } catch (error) {
                console.log('📨 Raw message:', data.toString());
            }
        });
        this.ws.on('close', (code, reason) => {
            this.isConnected = false;
            console.log(` Disconnected from server (code: ${code}, reason: ${reason || 'No reason'})`);
            this.rl.close();
        });
        this.ws.on('error', (error) => {
            console.log(` WebSocket error: ${error.message}`);
        });
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'connection_ack':
                console.log(`${message.message}`);
                break;
            case 'chat_message':
                console.log(`\n${message.from}: ${message.content}`);
                console.log(`${new Date(message.timestamp).toLocaleTimeString()}`);
                this.promptForInput();
                break;
            case 'offline_message':
                console.log(`\n[OFFLINE] ${message.from}: ${message.content}`);
                console.log(` ${new Date(message.timestamp).toLocaleTimeString()}`);
                this.promptForInput();
                break;
            case 'message_ack':
                console.log(`Message sent successfully (ID: ${message.messageId})`);
                this.promptForInput();
                break;
            case 'error':
                console.log(`Error: ${message.message}`);
                this.promptForInput();
                break;
            default:
                console.log('Unknown message type:', message);
                this.promptForInput();
        }
    }
    
    sendMessage(to, content) {
        if (!this.isConnected) {
            console.log('Not connected to server');
            return;
        }
        const message = {
            type: 'chat_message',
            from: this.userId,
            to: to,
            content: content
        };
        this.ws.send(JSON.stringify(message));
    }
    
    async getChatHistory(otherUser) {
        try {
            const response = await fetch(`http://localhost:3000/messages?user1=${this.userId}&user2=${otherUser}`);
            const data = await response.json();
            
            if (response.ok) {
                console.log(`\nChat History with ${otherUser}:`);
                if (data.messages.length === 0) {
                    console.log('   No messages yet');
                } else {
                    data.messages.forEach(msg => {
                        const time = new Date(msg.timestamp).toLocaleTimeString();
                        console.log(`   ${time} ${msg.from}: ${msg.content}`);
                    });
                }
            } else {
                console.log(`Error getting chat history: ${data.error}`);
            }
        } catch (error) {
            console.log(`Failed to get chat history: ${error.message}`);
        }
        this.promptForInput();
    }
    
    promptForInput() {
        this.rl.question(`[${this.userId}]> `, (input) => {
            const trimmedInput = input.trim();
            if (trimmedInput === 'quit') {
                console.log('Goodbye!');
                this.ws.close();
                return;
            }
            if (trimmedInput.startsWith('history ')) {
                const otherUser = trimmedInput.substring(8);
                this.getChatHistory(otherUser);
                return;
            }
            const colonIndex = trimmedInput.indexOf(':');
            if (colonIndex === -1) {
                console.log('Invalid format. Use "user:message" or "history user"');
                this.promptForInput();
                return;
            }
            const to = trimmedInput.substring(0, colonIndex).trim();
            const content = trimmedInput.substring(colonIndex + 1).trim();
            if (!to || !content) {
                console.log('Invalid format. Use "user:message"');
                this.promptForInput();
                return;
            }
            this.sendMessage(to, content);
        });
    }
}

const clientB = new ChatClient('B');
clientB.connect();