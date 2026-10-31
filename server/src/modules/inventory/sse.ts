import { Response } from 'express';

// Store connected SSE clients
interface SSEClient {
  id: string;
  res: Response;
}

let clients: SSEClient[] = [];

export function addSSEClient(id: string, res: Response) {
  clients.push({ id, res });
}

export function removeSSEClient(id: string) {
  clients = clients.filter(c => c.id !== id);
}

export function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch (err) {
      // client disconnected
    }
  }
}
