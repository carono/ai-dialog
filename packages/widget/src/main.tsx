import { render } from 'preact';
import { App } from './ui/App';
import { STYLES } from './ui/styles';
import { initErrorCapture } from './context';

// Параметры берём из data-* атрибутов тега <script>, которым подключён виджет.
const script = document.currentScript as HTMLScriptElement | null;
const project = script?.dataset.project ?? 'demo';
const gateway = script?.dataset.gateway ?? `ws://${location.hostname}:8787`;
const token = script?.dataset.token;

initErrorCapture();

const host = document.createElement('div');
host.id = 'ai-dialog-host';
document.body.appendChild(host);

const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = STYLES;
shadow.appendChild(style);

const mount = document.createElement('div');
shadow.appendChild(mount);

render(<App project={project} gateway={gateway} token={token} />, mount);
