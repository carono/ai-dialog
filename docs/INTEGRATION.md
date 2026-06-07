# Подключение AI-виджета (ai-dialog) к новому проекту

Пошаговая инструкция для исполнителя (человека или ИИ-агента), который **ничего не знает**
о системе. Следуй по порядку. После каждого шага есть проверка — не переходи дальше,
пока проверка не прошла.

---

## 0. Что это и как устроено (прочитай, не пропускай)

Есть **встраиваемый виджет** диалога с AI. Он добавляется на сайт одним `<script>` и
показывает кнопку 💬 в углу. Когда пользователь задаёт вопрос, виджет собирает контекст
страницы (URL, маршрут, видимый текст, выбранный элемент) и отправляет его на **шлюз**.

**Шлюз** — это уже работающий общий сервис (Node-процесс). Он один на все проекты.
Он принимает соединения от виджетов, по идентификатору проекта понимает, какой репозиторий
и какой AI-движок использовать, запускает движок и стримит ответ обратно в виджет.

```
Виджет на сайте ──wss──► Шлюз (общий) ──► AI-движок (Claude Code с доступом к репозиторию)
```

**Из этого следует главное:** чтобы подключить новый проект, НЕ нужно поднимать сервер,
настраивать nginx, домены или сертификаты — всё это уже есть и общее. Нужно только:

1. **Добавить запись о проекте в шлюз** (одна запись в JSON + перезапуск шлюза).
2. **Подключить виджет на сайте** (поставить пакет + 2 файла).

Эти две стороны связаны тремя значениями — `project`, `token`, `gateway`. Их совпадение
обязательно (см. таблицу в конце).

---

## 1. Фиксированные значения этого окружения

Не выдумывай — используй ровно эти пути и адреса.

| Что | Значение |
|---|---|
| Каталог шлюза | `/mnt/p/projects abandoned/packagist/ai-dialog/packages/gateway` |
| Реестр проектов | `<каталог шлюза>/projects.json` |
| Шлюз слушает | `127.0.0.1:8787` (на хосте, на всех интерфейсах) |
| Health-check | `curl -s http://127.0.0.1:8787/health` |
| Адрес для виджета (`data-gateway`) | `wss://wss.carono.site` (общий, не меняется) |
| Имя npm-пакета виджета | `carono-ai-dialog-widget` |
| PHP/Composer | в Docker-контейнере, под пользователем `www-data` |

Проверка окружения — шлюз должен отвечать:
```bash
curl -s http://127.0.0.1:8787/health
# Ожидаем JSON вида: {"ok":true,"projects":[...]}
```
Если команда ничего не вернула — шлюз не запущен, см. раздел 5 «Шлюз не запущен».

---

## 2. Собери исходные данные о проекте

Тебе нужны три вещи. Определи их до начала.

**2.1. Идентификатор проекта** `<PROJECT_ID>` — короткое латинское имя, например `myapp`.
Придумай сам, оно будет ключом везде.

**2.2. Абсолютный путь к репозиторию** `<REPO_PATH>` — корень кода сайта (где лежит
`composer.json` для Yii2). Если знаешь домен сайта, путь можно достать из nginx:
```bash
docker exec nginx sh -c "grep -hE 'root|fastcgi_pass' /etc/nginx/conf.d/<домен>.conf"
# строка root "..."  → это <REPO_PATH> без /web
# строка fastcgi_pass phpNN:9000 → это PHP-контейнер (см. 2.3)
```

**2.3. PHP-контейнер** `<PHP>` — из `fastcgi_pass` выше (например `php84`). Если не нашёл —
посмотри версию в `composer.json` проекта (`"php": ">=8.x"`) и возьми контейнер `php8x`.

**2.4. Секрет** `<TOKEN>` — придумай случайную строку (например `openssl rand -hex 16`).

---

## 3. ЧАСТЬ A — зарегистрировать проект в шлюзе

Открой `<каталог шлюза>/projects.json`. Это объект `{ "<id>": {...}, ... }`.
Добавь свой блок (не сломай существующие, JSON без висячих запятых):

```json
"<PROJECT_ID>": {
  "endpoint": "claude-code",
  "repoPath": "<REPO_PATH>",
  "token": "<TOKEN>",
  "allowWrite": false
}
```

Пояснения к полям:
- `endpoint` — движок. Бери `claude-code` (агент с доступом к коду репозитория).
  Альтернативы: `dashboard` (отвечает только по содержимому страницы, без доступа к коду),
  `opencode` (пока не реализован).
- `repoPath` — `<REPO_PATH>` из шага 2.2. **Обязателен для claude-code.**
- `token` — `<TOKEN>` из 2.4.
- `allowWrite` — оставь `false`: агент сможет только читать код (искать, объяснять),
  но не править файлы. Меняй на `true` осознанно.

**Применить:** шлюз читает конфиг при старте, поэтому его надо перезапустить:
```bash
cd "/mnt/p/projects abandoned/packagist/ai-dialog/packages/gateway"
fuser -k 8787/tcp 2>/dev/null; sleep 1
setsid env GATEWAY_HOST=0.0.0.0 node --import tsx src/index.ts >/tmp/aigw.log 2>&1 </dev/null &
disown
sleep 5
```

**Проверка A** — твой проект должен появиться в списке:
```bash
curl -s http://127.0.0.1:8787/health
# В "projects":[...] должен быть "<PROJECT_ID>"
```
Если его нет — проверь, что JSON валиден (`cat .../projects.json | python3 -m json.tool`).

---

## 4. ЧАСТЬ B — подключить виджет на сайте (Yii2)

Все команды composer выполняй в контейнере под `www-data` (иначе сломаешь права файлов):
`docker exec -u www-data -e COMPOSER_HOME=/tmp/cw <PHP> sh -lc 'cd "<REPO_PATH>" && <команда>'`
(один раз создай кэш: `docker exec <PHP> sh -lc 'mkdir -p /tmp/cw && chmod 777 /tmp/cw'`).

### 4.1. Включить поддержку npm-asset в `composer.json` проекта

Проверь `<REPO_PATH>/composer.json`. Должны быть (добавь, если нет):

- В `repositories` — asset-packagist:
  ```json
  { "type": "composer", "url": "https://asset-packagist.org" }
  ```
- В `config.allow-plugins`:
  ```json
  "composer/installers": true,
  "oomphinc/composer-installers-extender": true
  ```
- В `extra`:
  ```json
  "installer-types": ["npm-asset"],
  "installer-paths": { "vendor/npm-asset/{$name}": ["type:npm-asset"] }
  ```

### 4.2. Установить пакеты

```bash
docker exec -u www-data -e COMPOSER_HOME=/tmp/cw <PHP> sh -lc \
  'cd "<REPO_PATH>" && composer require oomphinc/composer-installers-extender:^2.0 npm-asset/carono-ai-dialog-widget --no-interaction'
```

**Проверка 4.2** — появился файл:
```bash
ls "<REPO_PATH>/vendor/npm-asset/carono-ai-dialog-widget/widget.js"
```

> Если composer пишет `npm-asset/carono-ai-dialog-widget could not be found` — asset-packagist
> ещё не проиндексировал пакет (бывает у свежих версий). Временное решение: добавь в
> `repositories` проекта inline-пакет и повтори require с точной версией:
> ```json
> {
>   "type": "package",
>   "package": {
>     "name": "npm-asset/carono-ai-dialog-widget",
>     "version": "0.1.0",
>     "type": "npm-asset",
>     "dist": { "type": "tar", "url": "https://registry.npmjs.org/carono-ai-dialog-widget/-/carono-ai-dialog-widget-0.1.0.tgz" }
>   }
> }
> ```

### 4.3. Создать AssetBundle

Создай файл `<REPO_PATH>/assets/AiDialogAsset.php` (namespace обычно `app\assets`,
сверься с соседним `AppAsset.php`):

```php
<?php

declare(strict_types=1);

namespace app\assets;

use yii\web\AssetBundle;

class AiDialogAsset extends AssetBundle
{
    public $sourcePath = '@vendor/npm-asset/carono-ai-dialog-widget';

    public $js = [
        [
            'widget.js',
            'data-project' => '<PROJECT_ID>',
            'data-gateway' => 'wss://wss.carono.site',
            'data-token'   => '<TOKEN>',
        ],
    ];
}
```

### 4.4. Зарегистрировать в layout

В главном layout `<REPO_PATH>/views/layouts/main.php` добавь импорт вверху и регистрацию
рядом с `AppAsset::register($this);`:

```php
use app\assets\AiDialogAsset;
// ...
AiDialogAsset::register($this);
```

### 4.5. Сбросить кэш опубликованных ассетов

Yii кэширует ассеты в `web/assets`. После изменений сбрось (под www-data):
```bash
docker exec -u www-data <PHP> sh -lc 'rm -rf "<REPO_PATH>/web/assets/"*'
```

---

## 5. Проверка результата

**5.1. Виджет в HTML.** Запроси страницу через nginx (подставь домен):
```bash
curl -sk -H "Host: <домен>" https://127.0.0.1/ | grep -o 'data-project="[^"]*"'
# Ожидаем: data-project="<PROJECT_ID>"
```

**5.2. В браузере.** Открой сайт (Ctrl+F5). В углу — кнопка 💬. Открой её:
- **зелёная точка** в шапке и статус «на связи» → всё работает, задай вопрос;
- **жёлтый баннер «Нет связи со шлюзом»** → виджет сам подскажет, что проверять
  (адрес шлюза, проект, детали ошибки). Действуй по разделу 6.

**5.3. Функции виджета:**
- кнопка **⌖** в поле ввода → режим выбора элемента (наведи, кликни блок на странице →
  он прикрепится к вопросу);
- кнопка **«Очистить»** в шапке → новый диалог;
- история и сессия сохраняются между страницами автоматически.

---

## 6. Если что-то не работает

Виджет показывает диагностику прямо в окне — сначала прочитай её. Дальше по симптому:

| Симптом | Причина | Что делать |
|---|---|---|
| Health не отвечает | Шлюз не запущен | Запусти шлюз (команда из раздела 3, блок «Применить») |
| В `/health` нет проекта | JSON битый или не перезапущен | Проверь `projects.json`, перезапусти шлюз |
| Баннер: «Неизвестный проект» | `data-project` ≠ ключ в projects.json | Приведи к одному значению |
| Баннер: «Неверный токен» | `data-token` ≠ `token` | Приведи к одному значению |
| Баннер: «закрыто (код …)» / домен не резолвится | `wss.carono.site` не доступен в браузере | Домен общий и уже настроен; проверь, что он есть в hosts ОС, где открыт браузер |
| Виджета нет в HTML | Не зарегистрирован/не сброшен кэш | Проверь 4.3–4.5 |
| Ответ не приходит | Движок/репозиторий | Смотри лог шлюза: `cat /tmp/aigw.log` |

«Шлюз не запущен» — полный запуск:
```bash
cd "/mnt/p/projects abandoned/packagist/ai-dialog/packages/gateway"
fuser -k 8787/tcp 2>/dev/null; sleep 1
setsid env GATEWAY_HOST=0.0.0.0 node --import tsx src/index.ts >/tmp/aigw.log 2>&1 </dev/null &
disown
sleep 5 && curl -s http://127.0.0.1:8787/health
```
Важно: шлюз для `claude-code` запускать **без** переменной `ANTHROPIC_API_KEY` —
он использует OAuth-подписку из `~/.claude`. Фейковый ключ сломает авторизацию.

---

## 7. Приложение

### 7.1. Не-Yii2 сайт

Шаги 4.1–4.5 — это «как доставить `widget.js` и проставить атрибуты» в Yii2. На любом
другом сайте достаточно положить `widget.js` (взять из npm-пакета или собрать) и вставить
перед `</body>`:
```html
<script src="https://<ваш-хост>/widget.js"
        data-project="<PROJECT_ID>"
        data-gateway="wss://wss.carono.site"
        data-token="<TOKEN>"></script>
```

### 7.2. Справочник значений

Поля `projects.json`:

| Поле | Обяз. | Значение |
|---|---|---|
| `endpoint` | да | `claude-code` \| `dashboard` \| `opencode` |
| `repoPath` | для claude-code | абсолютный путь к корню репозитория |
| `token` | рекомендуется | секрет; должен совпасть с `data-token` |
| `allowWrite` | нет | `false` (только чтение) по умолчанию |

Атрибуты `<script>` виджета:

| Атрибут | Обяз. | Значение |
|---|---|---|
| `data-project` | да | = ключ в `projects.json` |
| `data-gateway` | да | `wss://wss.carono.site` |
| `data-token` | если задан в конфиге | = `token` проекта |

### 7.3. Что должно совпадать

```
data-project (сайт)  ==  ключ объекта в projects.json (шлюз)
data-token   (сайт)  ==  token этого проекта        (шлюз)
data-gateway (сайт)  ==  wss://wss.carono.site       (общий адрес шлюза)
```

Если все три согласованы и шлюз запущен — виджет работает.

---

## 8. Установка шлюза с нуля (новое окружение)

Этот раздел нужен **только** если шлюза ещё нет (перенос на другую машину, чистая
установка). Если шлюз уже работает (раздел 1 «Health отвечает») — пропусти его целиком,
тебе хватит разделов 3–4.

Итог раздела: запущенный шлюз, доступный из браузера по `wss://<домен>`, переживающий
перезагрузку.

### 8.1. Предпосылки

- **Node.js 20+** (лучше 22+). Проверь: `node -v`.
- **pnpm** через corepack: `corepack pnpm -v` (если нет — `corepack enable pnpm`).
- **Исходники монорепо** ai-dialog (этот репозиторий).
- **Доступ к AI** одним из способов:
  - OAuth-подписка Claude — файл `~/.claude/.credentials.json` (появляется после входа в
    Claude Code). Это предпочтительный способ для `endpoint: claude-code`.
  - либо переменная `ANTHROPIC_API_KEY` — для `endpoint: dashboard`. **Внимание:** для
    `claude-code` ключ, наоборот, мешает (перебивает OAuth) — не задавай его, если
    используешь подписку.

### 8.2. Зависимости и сборка общих типов

```bash
cd <КОРЕНЬ_МОНОРЕПО>            # каталог с pnpm-workspace.yaml
corepack pnpm install
corepack pnpm --filter @ai-dialog/shared build
```

### 8.3. Конфигурация

```bash
cp .env.example .env
cp packages/gateway/projects.example.json packages/gateway/projects.json
```
В `.env` задай `GATEWAY_HOST=0.0.0.0` и `GATEWAY_PORT=8787`. `ANTHROPIC_API_KEY` оставь
пустым/закомментированным, если используешь OAuth-подписку (см. 8.1).
В `projects.json` заведи хотя бы один проект по образцу из раздела 3.

Переменные окружения шлюза (все опциональны, есть значения по умолчанию):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `GATEWAY_HOST` | `127.0.0.1` | интерфейс прослушивания; для доступа из reverse-proxy нужен `0.0.0.0` |
| `GATEWAY_PORT` | `8787` | порт |
| `PROJECTS_CONFIG` | `packages/gateway/projects.json` | путь к реестру проектов |
| `ANTHROPIC_API_KEY` | — | ключ для `dashboard`; для `claude-code` НЕ задавать |
| `OPENCODE_BASE_URL` | `http://127.0.0.1:4096` | для будущего opencode-адаптера |

### 8.4. Первый запуск и проверка

Быстрый запуск (dev, через tsx):
```bash
cd packages/gateway
GATEWAY_HOST=0.0.0.0 node --import tsx src/index.ts
# в логе: [gateway] слушает ws://0.0.0.0:8787 и список проектов
```
В другом терминале:
```bash
curl -s http://127.0.0.1:8787/health   # {"ok":true,"projects":[...]}
```
Работает — останови (Ctrl+C), переходи к постоянному запуску и проксированию.

### 8.5. Доступ из браузера по `wss://` (reverse-proxy + TLS)

Сайт открывается по `https`, поэтому виджет обязан соединяться по `wss`. Браузер не может
ходить на `ws://<хост>:8787` напрямую — нужен reverse-proxy с TLS, который терминирует
HTTPS и проксирует WebSocket на шлюз.

**Требования к проксированию (любой nginx/Caddy/Traefik):**
- отдельный домен/поддомен, например `wss.<домен>`, с валидным TLS-сертификатом;
- проксирование на `http://<хост-где-шлюз>:8787` с обязательным WebSocket-upgrade;
- домен должен резолвиться в браузере.

**Пример nginx** (этот образец лежит в `deploy/nginx/`):
```nginx
server { listen 80; server_name wss.example.com; return 301 https://$host$request_uri; }
server {
    listen 443 ssl;
    http2 on;
    server_name wss.example.com;
    ssl_certificate     /путь/к/fullchain.crt;
    ssl_certificate_key /путь/к/privkey.key;

    location / {
        proxy_pass http://127.0.0.1:8787;     # адрес, по которому nginx видит шлюз
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;     # ← WebSocket
        proxy_set_header Connection "upgrade";      # ← WebSocket
        proxy_set_header Host $host;
        proxy_read_timeout 600;
        proxy_buffering off;
    }
}
```

> **Особенности этого окружения (carono / nginx в Docker):**
> - nginx — в контейнере; до шлюза на хосте он достукивается не по `127.0.0.1`, а по IP
>   шлюза docker-сети: узнать `docker exec nginx sh -c "ip route | grep default"` (обычно
>   `172.21.0.1`). В `proxy_pass` подставь его.
> - есть wildcard-сертификат `*.carono.site` (`/etc/nginx/certs/wildcard.carono.site.*`),
>   поэтому отдельный cert для поддомена не нужен.
> - каталог `conf.d` примонтирован **read-only**, а файлы в `/root/docker` принадлежат root.
>   Записать конфиг и тронуть Windows hosts можно только под root — делегируй это
>   сессии с правами через skill **`ask-session`** (или попроси пользователя). Готовый
>   автоматизирующий скрипт: `deploy/register-wss.sh` (создаёт конфиг, добавляет hosts,
>   делает `nginx -t` + reload).
> - DNS поддоменов `*.carono.site` ведётся через Windows hosts
>   (`C:\Windows\System32\drivers\etc\hosts`); запись туда требует прав Windows-админа —
>   это делает пользователь.

**Проверка 8.5:**
```bash
# health через домен (подставь домен; -k — самоподписанный cert ок)
curl -sk -H "Host: wss.example.com" https://127.0.0.1/health
# WebSocket-upgrade должен вернуть 101:
curl -sk --http1.1 --max-time 3 -H "Host: wss.example.com" \
  -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" -H "Sec-WebSocket-Version: 13" \
  https://127.0.0.1/ -o /dev/null -w "HTTP=%{http_code}\n"   # ожидаем HTTP=101
```

После этого в `data-gateway` виджета указывай `wss://wss.example.com`.

### 8.6. Автозапуск (чтобы шлюз переживал перезагрузку)

Запуск через `setsid` (как в разделах 3/6) — временный, умирает с сессией/перезагрузкой.
Для постоянной работы оформи сервис.

Сначала собери продакшен-сборку (необязательно, но быстрее старт):
```bash
corepack pnpm --filter @ai-dialog/gateway build   # → packages/gateway/dist/index.js
```

**Вариант A — supervisor** (в этом окружении есть NOPASSWD на `supervisorctl`).
Файл `/etc/supervisor/conf.d/ai-dialog-gateway.conf` (пишется под root — через `ask-session`):
```ini
[program:ai-dialog-gateway]
directory=/mnt/p/projects abandoned/packagist/ai-dialog/packages/gateway
command=node --env-file=../../.env dist/index.js
environment=GATEWAY_HOST="0.0.0.0"
user=carono
autostart=true
autorestart=true
stdout_logfile=/var/log/ai-dialog-gateway.log
stderr_logfile=/var/log/ai-dialog-gateway.log
```
Применить:
```bash
sudo supervisorctl reread && sudo supervisorctl update && sudo supervisorctl status ai-dialog-gateway
```
> Если используешь dev-запуск без сборки — замени `command` на
> `node --env-file=../../.env --import tsx src/index.ts`.
> Для `claude-code` сервис должен видеть `~/.claude` пользователя (отсюда `user=carono`)
> и НЕ иметь `ANTHROPIC_API_KEY` в окружении.

**Вариант B — systemd** (`/etc/systemd/system/ai-dialog-gateway.service`):
```ini
[Unit]
Description=ai-dialog gateway
After=network.target

[Service]
WorkingDirectory=/mnt/p/projects abandoned/packagist/ai-dialog/packages/gateway
Environment=GATEWAY_HOST=0.0.0.0
ExecStart=/usr/bin/node --env-file=../../.env dist/index.js
User=carono
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now ai-dialog-gateway
```

**Проверка 8.6:** `curl -s http://127.0.0.1:8787/health` после `reboot` — отвечает без
ручного запуска.

### 8.7. Чек-лист готовности шлюза

- [ ] `node -v` ≥ 20, `corepack pnpm -v` работает
- [ ] `pnpm install` прошёл, `@ai-dialog/shared` собран
- [ ] `.env` и `projects.json` созданы; `GATEWAY_HOST=0.0.0.0`
- [ ] доступ к AI настроен (OAuth `~/.claude` или `ANTHROPIC_API_KEY`)
- [ ] `curl http://127.0.0.1:8787/health` отвечает
- [ ] reverse-proxy отдаёт `HTTP=101` на WS-upgrade по `wss://<домен>`
- [ ] домен резолвится в браузере
- [ ] сервис автозапуска поднят и переживает reboot

Когда всё отмечено — переходи к подключению проектов (разделы 3–4).
</content>
