// Временный дымовой тест endpoint claude-code: эмулирует виджет по WS-протоколу.
import { WebSocket } from 'ws';

const URL = process.env.GW || 'ws://127.0.0.1:8787';
const ws = new WebSocket(URL);

const context = {
  url: 'https://carono.site/',
  route: '/',
  hash: '',
  title: 'carono.ru — личный сайт и блог',
  referrer: '',
  lang: 'ru',
  viewport: { width: 1280, height: 800 },
  meta: {},
  hints: { frameworks: [], markers: { 'ai-route': '/' } },
};

const QUESTION =
  'На какой странице я нахожусь (маршрут "/")? Какой контроллер и action её обрабатывают и какой view-файл рендерится? Ответь кратко с путями к файлам.';

let sessionId;
const t0 = Date.now();

ws.on('open', () => {
  console.log('[client] открыто, шлю hello');
  ws.send(JSON.stringify({ type: 'hello', protocol: 1, project: 'carono', token: 'carono-test-secret' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'ready') {
    sessionId = msg.sessionId;
    console.log(`[client] ready, endpoint=${msg.endpoint}, шлю вопрос`);
    ws.send(JSON.stringify({ type: 'user_message', sessionId, text: QUESTION, context }));
    return;
  }
  if (msg.type === 'error') {
    console.error('[client] ПРОТОКОЛ-ОШИБКА:', msg.message);
    process.exit(1);
  }
  if (msg.type === 'event') {
    const e = msg.event;
    if (e.type === 'text') process.stdout.write(e.text);
    else if (e.type === 'tool_use') process.stdout.write(`\n  «${e.name}» `);
    else if (e.type === 'error') console.error('\n[client] ОШИБКА АГЕНТА:', e.message);
    else if (e.type === 'done') {
      console.log(`\n\n[client] готово за ${((Date.now() - t0) / 1000).toFixed(1)}с`);
      ws.close();
      process.exit(0);
    }
  }
});

ws.on('error', (e) => {
  console.error('[client] WS error:', e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('\n[client] таймаут 180с');
  process.exit(2);
}, 180000);
