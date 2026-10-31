"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSSEClient = addSSEClient;
exports.removeSSEClient = removeSSEClient;
exports.broadcastSSE = broadcastSSE;
let clients = [];
function addSSEClient(id, res) {
    clients.push({ id, res });
}
function removeSSEClient(id) {
    clients = clients.filter(c => c.id !== id);
}
function broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
        try {
            client.res.write(payload);
        }
        catch (err) {
            // client disconnected
        }
    }
}
