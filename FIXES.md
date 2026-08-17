# Ислоҳоти иҷрошуда — Kukucha.tjk

Сана: 2026-08-16

## 1. Хатои критикӣ дар бот (chat message)
**Файл:** `bot/index.js`  
**Мушкил:** Дар handler-и паёмҳои харидор тағйирёбандаи `text` муайян нашуда буд → `ReferenceError`.  
**Ислоҳ:** `const text = msg.text.trim();` илова шуд.

## 2. Ду handler-и callback_query
**Файл:** `bot/index.js`  
**Мушкил:** Ду `bot.on('callback_query')` вуҷуд дошт, ки метавонист рафтори номуайян диҳад.  
**Ислоҳ:** Handler-и `cancelreply` ба handler-и асосӣ якҷоя карда шуд. Санҷиши админ низ соддатар шуд (`config.isAdmin`).

## 3. Логини админ бо код шикаста буд
**Файлҳо:** `middleware/auth.js`, `routes/admin.js`  
**Мушкил:** `/api/admin/login` танҳо `session.isAdmin` ва `telegramId` мегузошт, аммо `requireAdmin` танҳо `session.user` + `isAdmin(id)`-ро месанҷид.  
**Ислоҳ:**
- `requireAdmin` ҳоло ҳам `session.user` ва ҳам `session.isAdmin + telegramId`-ро қабул мекунад.
- `/api/admin/login` ҳоло `session.user`-ро низ мегузорад (аз DB ё fallback).

## 4. Stock ҳеҷ гоҳ кам намешуд
**Файлҳо:** `routes/orders.js`, `routes/admin.js`, `bot/index.js`  
**Мушкил:** Ҳангоми фармоиш stock update намешуд.  
**Ислоҳ:**
- Эҷоди фармоиш дар transaction: `FOR UPDATE` + санҷиши stock + кам кардан.
- Агар stock кофӣ набошад — хато бо номи маҳсулот.
- Ҳангоми **рад** кардани фармоиш (аз админ-панел ё бот) stock барқарор мешавад.

## 5. SESSION_SECRET дар production
**Файл:** `config.js`  
**Мушкил:** Агар `SESSION_SECRET` гузошта нашавад, рамзи оддӣ истифода мешуд.  
**Ислоҳ:** Дар production агар холӣ бошад — огоҳӣ + рамзи тасодуфӣ (crypto). Дар development ҳоло ҳам default-и dev.

---

## Чӣ тавр истифода бурдан

```bash
npm install
cp .env.example .env
# .env-ро пур кунед
npm start
```

Дар Railway ҳамон Variables-ҳои қаблӣ кофӣ аст (бо `SESSION_SECRET` ҳатман).
