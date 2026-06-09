/** Стили виджета. Инлайнятся в Shadow DOM — не протекают на сайт-хост и наоборот. */
export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

.launcher {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  background: #1f6feb; color: #fff; font-size: 24px; line-height: 1;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
}
.launcher:hover { background: #1a5fd0; }

.panel {
  position: fixed; right: 20px; bottom: 88px; z-index: 2147483000;
  width: 380px; max-width: calc(100vw - 40px); height: 560px; max-height: calc(100vh - 120px);
  display: flex; flex-direction: column;
  background: #fff; border-radius: 12px; overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,.28); border: 1px solid #e4e7ec;
}

.header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; background: #0d1117; color: #fff;
}
.header .title { font-weight: 600; font-size: 14px; flex: 1; }
.header .dot { width: 8px; height: 8px; border-radius: 50%; background: #f85149; }
.header .dot.ready { background: #3fb950; }
.header .endpoint { font-size: 11px; opacity: .6; }
.header .pin { background: none; border: none; cursor: pointer; font-size: 14px; line-height: 1; padding: 2px 4px; opacity: .4; filter: grayscale(1); }
.header .pin.on { opacity: 1; filter: none; }
.header .clear { background: rgba(255,255,255,.12); border: none; color: #fff; cursor: pointer; font-size: 11px; padding: 3px 8px; border-radius: 6px; }
.header .clear:hover { background: rgba(255,255,255,.22); }
.header .close { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; }

.diag { background: #fff8e1; border-bottom: 1px solid #ffe0a3; color: #664d03; padding: 11px 13px; font-size: 12px; line-height: 1.5; max-height: 60%; overflow-y: auto; }
.diag code { background: rgba(0,0,0,.07); padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, monospace; word-break: break-all; }
.diag-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
.diag p { margin: 0 0 8px; }
.diag ol { margin: 6px 0 8px; padding-left: 18px; }
.diag li { margin-bottom: 7px; }
.diag-note { color: #7a6a3a; font-style: italic; }
.diag-code { position: relative; margin: 5px 0 2px; }
.diag-code pre {
  margin: 0; padding: 7px 30px 7px 9px; background: #2b2417; color: #f0e6d2;
  border-radius: 6px; font-family: ui-monospace, monospace; font-size: 11px;
  line-height: 1.45; white-space: pre; overflow-x: auto;
}
.diag-copy {
  position: absolute; top: 5px; right: 5px; border: none; cursor: pointer;
  background: rgba(255,255,255,.14); color: #f0e6d2; border-radius: 5px;
  font-size: 12px; line-height: 1; padding: 4px 6px;
}
.diag-copy:hover { background: rgba(255,255,255,.28); }
.diag-vals { margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffe0a3; display: flex; flex-wrap: wrap; gap: 4px 12px; }
.diag-vals code { word-break: break-all; }
.diag-actions { margin-top: 9px; display: flex; align-items: center; gap: 12px; }
.diag-retry {
  border: 1px solid #e0b85c; background: #ffefc2; color: #664d03; cursor: pointer;
  border-radius: 7px; font-size: 12px; padding: 5px 11px; font-weight: 500;
}
.diag-retry:hover { background: #ffe6a0; }
.diag-docs { color: #9a5b00; font-weight: 500; text-decoration: none; }
.diag-docs:hover { text-decoration: underline; }

.body { flex: 1; overflow-y: auto; padding: 14px; background: #f6f8fa; }

.msg { margin-bottom: 12px; display: flex; }
.msg.user { justify-content: flex-end; }
.bubble {
  max-width: 85%; padding: 9px 12px; border-radius: 12px; font-size: 14px;
  line-height: 1.45; white-space: pre-wrap; word-break: break-word;
}
.msg.user .bubble { background: #1f6feb; color: #fff; border-bottom-right-radius: 3px; }
.msg.assistant .bubble { background: #fff; color: #1f2328; border: 1px solid #e4e7ec; border-bottom-left-radius: 3px; }
.msg.assistant .bubble.error { background: #fff1f0; border-color: #ffccc7; color: #a8071a; }

.tools { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.tool {
  font-size: 11px; padding: 2px 7px; border-radius: 10px;
  background: #eaeef2; color: #57606a; font-family: ui-monospace, monospace;
}

.empty { color: #8b949e; font-size: 13px; text-align: center; margin-top: 40px; padding: 0 20px; }

.picked { display: flex; align-items: center; gap: 8px; padding: 7px 12px; background: #eef4ff; border-top: 1px solid #d6e4ff; }
.picked-sel { flex: 1; font-size: 11px; font-family: ui-monospace, monospace; color: #1f4fa3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picked-x { background: none; border: none; cursor: pointer; color: #57606a; font-size: 13px; padding: 0 2px; }

.footer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e4e7ec; background: #fff; }
.footer .pick { border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 8px; padding: 0 10px; cursor: pointer; font-size: 16px; color: #1f6feb; }
.footer .pick:hover:not(:disabled) { background: #eef4ff; }
.footer .pick:disabled { color: #c4cdd5; cursor: default; }

.pick-hint {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  z-index: 2147483000; pointer-events: none;
  background: #0d1117; color: #fff; font-size: 13px; padding: 8px 16px;
  border-radius: 999px; box-shadow: 0 4px 16px rgba(0,0,0,.3);
}
.footer textarea {
  flex: 1; resize: none; border: 1px solid #d0d7de; border-radius: 8px;
  padding: 8px 10px; font-size: 14px; max-height: 120px; outline: none;
}
.footer textarea:focus { border-color: #1f6feb; }
.footer button {
  border: none; border-radius: 8px; padding: 0 14px; cursor: pointer;
  background: #1f6feb; color: #fff; font-size: 14px; font-weight: 500;
}
.footer button:disabled { background: #c4cdd5; cursor: default; }
.footer button.stop { background: #d1242f; }
`;
