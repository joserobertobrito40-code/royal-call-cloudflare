export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });

    const role = url.searchParams.get('role') === 'teacher' ? 'teacher' : 'student';
    const host = url.searchParams.get('host') || '';
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    let authorizedRole = role;
    if (role === 'teacher') {
      const existingHost = await this.state.storage.get('hostKey');
      if (!existingHost) {
        if (!host) {
          server.send(JSON.stringify({ type: 'error', message: 'Host key required' }));
          server.close(1008, 'Host key required');
          return new Response(null, { status: 101, webSocket: client });
        }
        await this.state.storage.put('hostKey', host);
      } else if (existingHost !== host) {
        authorizedRole = 'student';
      }
    }

    const id = crypto.randomUUID();
    this.clients.set(id, { ws: server, role: authorizedRole, approved: authorizedRole === 'teacher' });

    server.addEventListener('message', e => this.onMessage(id, e.data));
    server.addEventListener('close', () => this.onClose(id));
    server.addEventListener('error', () => this.onClose(id));

    server.send(JSON.stringify({ type: 'connected', id, role: authorizedRole }));

    const lesson = (await this.state.storage.get('lesson')) || '';
    server.send(JSON.stringify({ type: 'lesson-state', text: lesson }));

    if (authorizedRole === 'student') {
      const teacher = this.getTeacher();
      if (teacher) teacher.ws.send(JSON.stringify({ type: 'student-waiting', studentId: id }));
      else server.send(JSON.stringify({ type: 'waiting-teacher' }));
    } else {
      for (const [studentId, c] of this.clients.entries()) {
        if (c.role === 'student' && !c.approved) server.send(JSON.stringify({ type: 'student-waiting', studentId }));
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  getTeacher() {
    for (const c of this.clients.values()) if (c.role === 'teacher') return c;
    return null;
  }

  sendToRole(role, payload) {
    for (const c of this.clients.values()) {
      if (c.role === role && c.ws.readyState === 1) c.ws.send(JSON.stringify(payload));
    }
  }

  broadcast(payload, exceptId = null) {
    const raw = JSON.stringify(payload);
    for (const [id, c] of this.clients.entries()) {
      if (id !== exceptId && c.ws.readyState === 1) c.ws.send(raw);
    }
  }

  async onMessage(senderId, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const sender = this.clients.get(senderId);
    if (!sender) return;

    if (msg.type === 'approve' && sender.role === 'teacher' && msg.studentId) {
      const student = this.clients.get(msg.studentId);
      if (student?.role === 'student') {
        student.approved = true;
        student.ws.send(JSON.stringify({ type: 'approved' }));
        sender.ws.send(JSON.stringify({ type: 'approved-confirmed', studentId: msg.studentId }));
      }
      return;
    }

    if (msg.type === 'reject' && sender.role === 'teacher' && msg.studentId) {
      const student = this.clients.get(msg.studentId);
      if (student?.role === 'student') {
        student.ws.send(JSON.stringify({ type: 'rejected' }));
        student.ws.close(1008, 'Rejected');
      }
      return;
    }

    if (msg.type === 'signal') {
      if (sender.role === 'student' && !sender.approved) return;
      const targetRole = sender.role === 'teacher' ? 'student' : 'teacher';
      this.sendToRole(targetRole, { type: 'signal', from: senderId, data: msg.data });
      return;
    }

    if (msg.type === 'lesson-update') {
      const text = String(msg.text || '').slice(0, 20000);
      await this.state.storage.put('lesson', text);
      this.broadcast({ type: 'lesson-update', text }, senderId);
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 1500);
      if (!text) return;
      this.broadcast({ type: 'chat', text, role: sender.role, ts: Date.now() });
      return;
    }

    if (msg.type === 'ping') sender.ws.send(JSON.stringify({ type: 'pong' }));
  }

  onClose(id) {
    const departing = this.clients.get(id);
    this.clients.delete(id);
    if (departing?.role === 'student') this.sendToRole('teacher', { type: 'student-left', studentId: id });
    else if (departing?.role === 'teacher') this.sendToRole('student', { type: 'teacher-left' });
  }
}

function cors(origin='*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
}

async function turnCredentials(env, request) {
  const origin = request.headers.get('Origin') || '*';
  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
    return Response.json({ error: 'TURN secrets are not configured' }, { status: 500, headers: cors(origin) });
  }
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 14400 })
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { headers: cors(request.headers.get('Origin') || '*') });
    }
    if (url.pathname === '/api/turn') return turnCredentials(env, request);
    if (url.pathname === '/api/ws') {
      const room = url.searchParams.get('room');
      if (!room) return new Response('Missing room', { status: 400 });
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
