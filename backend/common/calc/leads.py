"""Tashqi tizimdan kelgan lidni tushunish (sof funksiyalar).

Har bir tizim (Yuboraman, Tilda, Meta, sayt formasi) maydonlarni boshqacha nomlaydi va ba'zan ichma-ich
joylaydi. Shuning uchun aniq format kutilmaydi: payload yassilanadi va maydonlar nomlari bo'yicha topiladi.
Hech narsa topilmasa ham lid yo'qolmaydi — xom ma'lumot alohida saqlanadi.
"""
import re

MAX_DEPTH = 5

ALIASES = {
    "full_name": {"name", "fullname", "fio", "ism", "ismi", "ismfamiliya", "fish", "clientname", "contactname",
                  "customername", "leadname", "имя", "фио", "client", "customer"},
    "first_name": {"firstname", "first", "givenname"},
    "last_name": {"lastname", "last", "surname", "familiya", "фамилия"},
    "phone": {"phone", "phonenumber", "phone1", "tel", "telephone", "telefon", "telefonraqam", "telefonraqami",
              "raqam", "raqamingiz", "mobile", "mobilephone", "телефон", "номер", "номертелефона", "contactphone",
              "customerphone", "clientphone", "whatsapp"},
    "email": {"email", "mail", "emailaddress", "почта"},
    "message": {"message", "comment", "izoh", "text", "savol", "izohingiz", "комментарий", "сообщение", "note"},
    "external_id": {"leadgenid", "leadid", "tranid", "externalid", "uuid", "orderid", "id"},
    "form_name": {"formname", "form", "formtitle", "formid"},
    "campaign_name": {"campaignname", "campaign", "kampaniya", "utmcampaign"},
    "ad_name": {"adname", "ad", "reklama", "adtitle", "utmcontent"},
    "platform": {"platform", "source", "utmsource", "manba"},
    "city": {"city", "shahar", "viloyat", "region", "город"},
}
_LOOKUP = {alias: field for field, names in ALIASES.items() for alias in names}
# id kabi umumiy nomlar ichki obyektda (masalan, forma id si) adashtirmasligi uchun faqat yuqori darajada olinadi.
_TOP_LEVEL_ONLY = {"id"}
_CONTEXTS = {"form", "campaign", "ad", "adset", "page"}
PHONE_RE = re.compile(r"^\+?[\d\s()\-]{9,18}$")


def _key(name) -> str:
    return re.sub(r"[^\w]", "", str(name).lower()).replace("_", "")


def _as_text(value) -> str:
    if isinstance(value, (list, tuple)):
        value = next((v for v in value if v not in (None, "")), "")
    if value is None or isinstance(value, (dict, bool)):
        return ""
    return str(value).strip()


def flatten(data, depth=0, path=()):
    """(kalit, qiymat, chuqurlik) juftliklari. {name, values} ko'rinishidagi ro'yxatlar ham ochiladi (Meta)."""
    if depth > MAX_DEPTH:
        return
    if isinstance(data, dict):
        label = next((data[k] for k in ("name", "key", "question", "label", "title") if k in data), None)
        answer = next((k for k in ("values", "value", "answer") if k in data), None)
        if label is not None and answer is not None:
            yield _key(label), data[answer], depth
            return
        context = _key(path[-1]) if path else ""
        for key, value in data.items():
            if isinstance(value, (dict, list)) and not (isinstance(value, list) and all(
                    not isinstance(v, (dict, list)) for v in value)):
                yield from flatten(value, depth + 1, (*path, key))
            elif context in _CONTEXTS:
                # {"form": {"id": 1, "name": "Aksiya"}} — bu odamning ismi emas, forma nomi.
                if _key(key) in ("name", "title"):
                    yield context + "name", value, depth
            else:
                yield _key(key), value, depth
    elif isinstance(data, list):
        for item in data:
            yield from flatten(item, depth + 1, path)


def normalize_phone(value) -> str:
    """O'zbekiston raqamini +998XXXXXXXXX ko'rinishiga keltiradi. Tanilmasa, raqamlarning o'zi qoladi."""
    text = _as_text(value)
    digits = re.sub(r"\D", "", text)
    if not digits:
        return ""
    if len(digits) == 9:
        digits = "998" + digits
    return "+" + digits if len(digits) >= 9 else digits


def parse_lead(payload) -> dict:
    """Istalgan JSON/forma ma'lumotidan lid maydonlarini ajratadi."""
    found = {}
    fallback_phone = ""
    for key, value, depth in flatten(payload):
        text = _as_text(value)
        if not text:
            continue
        field = _LOOKUP.get(key)
        if field and not (key in _TOP_LEVEL_ONLY and depth > 0) and field not in found:
            found[field] = text
        elif not fallback_phone and PHONE_RE.match(text) and sum(c.isdigit() for c in text) >= 9:
            fallback_phone = text
    name = found.get("full_name") or " ".join(p for p in (found.get("first_name"), found.get("last_name")) if p)
    return {
        "full_name": name[:150],
        "phone": normalize_phone(found.get("phone") or fallback_phone)[:20],
        "email": found.get("email", "")[:254] if "@" in found.get("email", "") else "",
        "message": found.get("message", "")[:2000],
        "external_id": found.get("external_id", "")[:100],
        "form_name": found.get("form_name", "")[:150],
        "campaign_name": found.get("campaign_name", "")[:150],
        "ad_name": found.get("ad_name", "")[:150],
        "platform": found.get("platform", "")[:40],
        "city": found.get("city", "")[:80],
    }


def is_ping(payload) -> bool:
    """Tizimlar ulanishni tekshirish uchun yuboradigan bo'sh yoki test so'rov (masalan Tilda: test=test)."""
    if not payload:
        return True
    return isinstance(payload, dict) and set(payload) <= {"test", "ping"}


def funnel(counts: dict) -> dict:
    """Voronka: nechta lid, nechtasi bilan bog'lanildi, nechtasi sotildi va konversiya foizi."""
    real = sum(n for status, n in counts.items() if status != "spam")
    won = counts.get("won", 0)
    untouched = counts.get("new", 0)
    return {
        "total": real,
        "contacted": real - untouched,
        "won": won,
        "conversion_percent": round(won * 100 / real, 1) if real else 0,
    }
