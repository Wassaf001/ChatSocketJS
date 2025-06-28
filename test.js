const WebSocket = require('ws');

let fetch;
try {
    fetch = global.fetch;
} catch (e) {
    fetch = require('node-fetch');
}

class ChatTester {
    constructor() {
        this.clientA = null;
        this.clientB = null;
        this.testResults = [];
    }
    async runTests() {
        console.log('🧪 Starting Chat System Tests...\n');
        await this.testConnection();
        await this.testRealTimeMessaging();
        await this.testOfflineMessaging();
        await this.testChatHistory();
        await this.testHealthCheck();
        this.printResults();
    }
    
    async testConnection() {
        console.log('1️⃣ Testing WebSocket Connections...');
        try {
            this.clientA = new WebSocket('ws://localhost:3000?userId=TestA');
            this.clientB = new WebSocket('ws://localhost:3000?userId=TestB');
            await this.waitForConnection(this.clientA);
            await this.waitForConnection(this.clientB);
            this.testResults.push('✅ WebSocket connections successful');
        } catch (error) {
            this.testResults.push(`❌ WebSocket connection failed: ${error.message}`);
        }
    }
    
    async testRealTimeMessaging() {
        console.log('2️⃣ Testing Real-Time Messaging...');
        return new Promise((resolve) => {
            let messageReceived = false;
            this.clientB.on('message', (data) => {
                const message = JSON.parse(data);
                if (message.type === 'chat_message' && message.from === 'TestA') {
                    messageReceived = true;
                    this.testResults.push('✅ Real-time messaging working');
                    resolve();
                }
            });
            setTimeout(() => {
                if (!messageReceived) {
                    this.testResults.push('❌ Real-time messaging failed');
                }
                resolve();
            }, 2000);
            this.clientA.send(JSON.stringify({
                type: 'chat_message',
                from: 'TestA',
                to: 'TestB',
                content: 'Test real-time message'
            }));
        });
    }
    
    async testOfflineMessaging() {
        console.log('3️⃣ Testing Offline Messaging...');
        this.clientB.close();
        await new Promise(resolve => setTimeout(resolve, 500));
        this.clientA.send(JSON.stringify({
            type: 'chat_message',
            from: 'TestA',
            to: 'TestB',
            content: 'Test offline message'
        }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.clientB = new WebSocket('ws://localhost:3000?userId=TestB');
        return new Promise((resolve) => {
            let offlineMessageReceived = false;
            let allMessages = [];
            this.clientB.on('message', (data) => {
                const message = JSON.parse(data);
                allMessages.push(message);
                console.log(`   Received message: ${message.type} from ${message.from || 'server'}`);
                
                if (message.type === 'chat_message' && message.from === 'TestA' && message.delivered === false) {
                    offlineMessageReceived = true;
                    this.testResults.push('✅ Offline messaging working');
                    resolve();
                }
            });
            this.clientB.on('open', () => {
                console.log('   Client B reconnected, waiting for offline messages...');
            });
            setTimeout(() => {
                if (!offlineMessageReceived) {
                    console.log(`   ❌ No offline message received. All messages:`, allMessages);
                    this.testResults.push('❌ Offline messaging failed');
                }
                resolve();
            }, 3000);
        });
    }
    
    async testChatHistory() {
        console.log('4️⃣ Testing Chat History API...');
        try {
            const response = await fetch('http://localhost:3000/messages?user1=TestA&user2=TestB');
            const data = await response.json();
            if (response.ok && Array.isArray(data.messages)) {
                this.testResults.push('✅ Chat history API working');
            } else {
                this.testResults.push('❌ Chat history API failed');
            }
        } catch (error) {
            this.testResults.push(`❌ Chat history API error: ${error.message}`);
        }
    }
    
    async testHealthCheck() {
        console.log('5️⃣ Testing Health Check...');
        try {
            const response = await fetch('http://localhost:3000/health');
            const data = await response.json();
            
            if (response.ok && data.status === 'healthy') {
                this.testResults.push('✅ Health check working');
            } else {
                this.testResults.push('❌ Health check failed');
            }
        } catch (error) {
            this.testResults.push(`❌ Health check error: ${error.message}`);
        }
    }
    
    waitForConnection(ws) {
        return new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
            setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });
    }
    
    printResults() {
        console.log('\n📊 Test Results:');
        console.log('================');
        this.testResults.forEach(result => console.log(result));
        const passed = this.testResults.filter(r => r.startsWith('✅')).length;
        const total = this.testResults.length;
        console.log(`\n🎯 ${passed}/${total} tests passed`);
        if (passed === total) {
            console.log('🎉 All tests passed! Chat system is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please check the implementation.');
        }
    }
}

const tester = new ChatTester();
tester.runTests().catch(console.error);