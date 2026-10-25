from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

WORK_KINDS = [
    ("shooting", "🎥 Suratga olish"),
    ("editing", "✂️ Montaj"),
    ("design", "🎨 Dizayn"),
    ("publishing", "📤 Joylash"),
    ("stories", "📱 Stories"),
    ("target", "🎯 Target"),
    ("script", "📝 Ssenariy / matn"),
    ("report", "📊 Hisobot"),
    ("meeting", "🤝 Uchrashuv"),
    ("other", "• Boshqa"),
]


def from_spec(rows, with_urls=True):
    """API'dan kelgan tugmalar ([[{"text", "callback"|"url"}]]) → Telegram klaviaturasi."""
    keyboard = []
    for row in rows or []:
        buttons = []
        for spec in row:
            if spec.get("callback"):
                buttons.append(InlineKeyboardButton(text=spec["text"], callback_data=spec["callback"]))
            elif spec.get("url") and with_urls:
                buttons.append(InlineKeyboardButton(text=spec["text"], url=spec["url"]))
        if buttons:
            keyboard.append(buttons)
    return InlineKeyboardMarkup(inline_keyboard=keyboard) if keyboard else None


def tasks_keyboard(tasks):
    rows = [[InlineKeyboardButton(text=f"✅ {t['title'][:40]}", callback_data=f"td:{t['id']}")] for t in tasks[:10]]
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


def projects_keyboard(projects):
    rows = [[InlineKeyboardButton(text=f"{p['client']} · {p['tariff']}", callback_data=f"pj:{p['id']}")]
            for p in projects[:20]]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def kinds_keyboard():
    rows, row = [], []
    for code, label in WORK_KINDS:
        row.append(InlineKeyboardButton(text=label, callback_data=f"kd:{code}"))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)
