"""Bot buyruqlari. Matnlar sodda o'zbekcha; har bir amalning ruxsati API tomonida tekshiriladi."""
from html import escape

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from obro_bot.api import Api, ApiError
from obro_bot.keyboards import WORK_KINDS, kinds_keyboard, projects_keyboard, tasks_keyboard

router = Router()

NOT_LINKED = ("Bu Telegram akkaunti OBRO’ Panel’ga ulanmagan.\n\n"
              "Panelga kiring → chap pastdagi ismingiz → «Telegram’ni ulash» tugmasini bosing.")

STAFF_HELP = ("Buyruqlar:\n"
              "/bugun — bugungi va muddati yaqin vazifalar\n"
              "/jurnal — ish jurnaliga yozish (1 daqiqa)\n"
              "/tz — menga berilgan TZ’lar\n"
              "/syomka — yaqin syomkalar\n"
              "/id — shu chat raqami (lidlar guruhi uchun)\n"
              "/uzish — botni akkauntdan uzish")
CLIENT_HELP = ("Material tayyor bo‘lsa, shu yerga xabar keladi — «Tasdiqlayman» yoki «Izoh qoldirish» "
               "tugmasini bosasiz.\n/syomka — yaqin syomkalar\n/uzish — botni akkauntdan uzish")


class Journal(StatesGroup):
    project = State()
    kind = State()
    text = State()


class ChangeRequest(StatesGroup):
    comment = State()


def _kind_label(code):
    return dict(WORK_KINDS).get(code, code)


@router.message(CommandStart(deep_link=True))
async def start_with_token(message: Message, command: CommandObject, api: Api):
    try:
        profile = await api.link(command.args, message.chat.id, message.from_user.username or "")
    except ApiError as exc:
        await message.answer(escape(exc.message))
        return
    help_text = CLIENT_HELP if profile["is_client"] else STAFF_HELP
    await message.answer(f"Assalomu alaykum, <b>{escape(profile['full_name'])}</b>! "
                         f"Akkaunt ulandi ({escape(profile['role_label'])}).\n\n{help_text}")


@router.message(CommandStart())
async def start(message: Message, api: Api):
    try:
        profile = await api.me(message.chat.id)
    except ApiError:
        await message.answer(f"<b>OBRO’ Panel</b> boti.\n\n{NOT_LINKED}")
        return
    help_text = CLIENT_HELP if profile["is_client"] else STAFF_HELP
    await message.answer(f"Siz <b>{escape(profile['full_name'])}</b> sifatida ulangansiz.\n\n{help_text}")


@router.message(Command("yordam", "help"))
async def help_cmd(message: Message, api: Api):
    await start(message, api)


@router.message(Command("uzish"))
async def unlink(message: Message, api: Api, state: FSMContext):
    await state.clear()
    try:
        await api.unlink(message.chat.id)
    except ApiError as exc:
        await message.answer(escape(exc.message))
        return
    await message.answer("Bot akkauntdan uzildi. Qayta ulash uchun paneldan «Telegram’ni ulash» tugmasini bosing.")


# ---------- Jamoa: vazifalar ----------

@router.message(Command("bugun"))
async def today(message: Message, api: Api):
    try:
        tasks = await api.tasks(message.chat.id)
    except ApiError as exc:
        await message.answer(escape(exc.message) if exc.status != 404 else NOT_LINKED)
        return
    if not tasks:
        await message.answer("Ochiq vazifa yo‘q. 👍")
        return
    lines = []
    for t in tasks:
        mark = "🔴" if t["overdue"] else "•"
        due = f" — {t['due_date'][8:10]}.{t['due_date'][5:7]}" if t["due_date"] else ""
        lines.append(f"{mark} {escape(t['title'])} <i>({escape(t['client'])}{due})</i>")
    await message.answer("<b>Vazifalaringiz</b>\n" + "\n".join(lines) + "\n\nBajarilganini belgilang:",
                         reply_markup=tasks_keyboard(tasks))


@router.callback_query(F.data.startswith("td:"))
async def task_done(callback: CallbackQuery, api: Api):
    task_id = int(callback.data.split(":")[1])
    try:
        result = await api.task_done(callback.message.chat.id, task_id)
    except ApiError as exc:
        await callback.answer(exc.message, show_alert=True)
        return
    await callback.answer("Bajarildi ✅")
    await callback.message.answer(f"✅ <b>{escape(result['title'])}</b> — bajarildi. Jurnalga o‘zi yozildi.")


# ---------- Jamoa: ish jurnali ----------

@router.message(Command("jurnal"))
async def journal_start(message: Message, api: Api, state: FSMContext):
    try:
        projects = await api.projects(message.chat.id)
    except ApiError as exc:
        await message.answer(escape(exc.message) if exc.status != 404 else NOT_LINKED)
        return
    if not projects:
        await message.answer("Sizga biriktirilgan faol loyiha yo‘q.")
        return
    await state.set_state(Journal.project)
    await message.answer("Qaysi mijoz uchun?", reply_markup=projects_keyboard(projects))


@router.callback_query(Journal.project, F.data.startswith("pj:"))
async def journal_project(callback: CallbackQuery, state: FSMContext):
    await state.update_data(project=int(callback.data.split(":")[1]))
    await state.set_state(Journal.kind)
    await callback.answer()
    await callback.message.edit_text("Ish turi?", reply_markup=kinds_keyboard())


@router.callback_query(Journal.kind, F.data.startswith("kd:"))
async def journal_kind(callback: CallbackQuery, state: FSMContext):
    kind = callback.data.split(":")[1]
    await state.update_data(kind=kind)
    await state.set_state(Journal.text)
    await callback.answer()
    await callback.message.edit_text(f"{_kind_label(kind)}\n\nNima qilindi? Bir gap bilan yozing "
                                     "(mijoz shu matnni ko‘rishi mumkin).")


@router.message(Journal.text, F.text)
async def journal_text(message: Message, api: Api, state: FSMContext):
    data = await state.get_data()
    try:
        result = await api.add_worklog(message.chat.id, data["project"], data["kind"], message.text)
    except ApiError as exc:
        await message.answer(escape(exc.message))
        return
    await state.clear()
    await message.answer(f"Yozildi ✅ Holati: <b>{escape(result['status'])}</b>.")


# ---------- Mijoz: tasdiqlash ----------

@router.callback_query(F.data.startswith("ap:"))
async def approve(callback: CallbackQuery, api: Api):
    item_id = int(callback.data.split(":")[1])
    try:
        result = await api.decide(callback.message.chat.id, item_id, "approve")
    except ApiError as exc:
        await callback.answer(exc.message, show_alert=True)
        return
    await callback.answer("Tasdiqlandi ✅")
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer(f"✅ <b>{escape(result['title'])}</b> tasdiqlandi. Jamoaga xabar yuborildi.")


@router.callback_query(F.data.startswith("ch:"))
async def ask_changes(callback: CallbackQuery, state: FSMContext):
    await state.set_state(ChangeRequest.comment)
    await state.update_data(item_id=int(callback.data.split(":")[1]))
    await callback.answer()
    await callback.message.answer("Nimani o‘zgartirish kerak? Yozib yuboring "
                                  "(masalan: «0:12 dagi yozuvni kattaroq qiling»).")


@router.message(ChangeRequest.comment, F.text)
async def send_changes(message: Message, api: Api, state: FSMContext):
    data = await state.get_data()
    try:
        result = await api.decide(message.chat.id, data["item_id"], "changes", message.text)
    except ApiError as exc:
        await message.answer(escape(exc.message))
        return
    await state.clear()
    await message.answer(f"✍️ Izohingiz jamoaga yuborildi: <b>{escape(result['title'])}</b>.")


# ---------- Lidlar, TZ, syomka ----------

@router.message(Command("id"))
async def chat_id(message: Message):
    """Guruh raqami: lidlar shu guruhga tushishi uchun panelga yoziladi."""
    await message.answer(f"Bu chat raqami: <code>{message.chat.id}</code>")


async def _lead_action(callback: CallbackQuery, api: Api, status: str, done: str):
    lead_id = int(callback.data.split(":")[1])
    try:
        result = await api.lead_status(callback.message.chat.id, lead_id, status)
    except ApiError as exc:
        await callback.answer(exc.message, show_alert=True)
        return
    await callback.answer(done)
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer(f"{done}: {escape(result['name'])}")


@router.callback_query(F.data.startswith("lc:"))
async def lead_contacted(callback: CallbackQuery, api: Api):
    await _lead_action(callback, api, "contacted", "📞 Bog‘lanildi")


@router.callback_query(F.data.startswith("ls:"))
async def lead_spam(callback: CallbackQuery, api: Api):
    await _lead_action(callback, api, "spam", "🚫 Spam")


@router.callback_query(F.data.startswith("ba:"))
async def brief_accept(callback: CallbackQuery, api: Api):
    try:
        result = await api.brief_accept(callback.message.chat.id, int(callback.data.split(":")[1]))
    except ApiError as exc:
        await callback.answer(exc.message, show_alert=True)
        return
    await callback.answer("Qabul qilindi 👍")
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer(f"👍 TZ qabul qilindi: <b>{escape(result['title'])}</b>")


@router.callback_query(F.data.startswith("sc:"))
async def shoot_confirm(callback: CallbackQuery, api: Api):
    try:
        result = await api.shoot_confirm(callback.message.chat.id, int(callback.data.split(":")[1]))
    except ApiError as exc:
        await callback.answer(exc.message, show_alert=True)
        return
    await callback.answer("Tasdiqlandi ✅")
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer(f"✅ Syomka tasdiqlandi: {escape(result['when'])}")


@router.message(Command("tz"))
async def my_briefs(message: Message, api: Api):
    try:
        briefs = await api.briefs(message.chat.id)
    except ApiError as exc:
        await message.answer(escape(exc.message) if exc.status != 404 else NOT_LINKED)
        return
    if not briefs:
        await message.answer("Ochiq TZ yo‘q. 👍")
        return
    lines = []
    for b in briefs:
        due = f" — {b['deadline'][8:10]}.{b['deadline'][5:7]}" if b["deadline"] else ""
        lines.append(f"• {escape(b['title'])} <i>({escape(b['client'])}{due}, {escape(b['status'])})</i>")
    await message.answer("<b>Sizning TZ’laringiz</b>\n" + "\n".join(lines))


@router.message(Command("syomka"))
async def my_shoots(message: Message, api: Api):
    try:
        shoots = await api.shoots(message.chat.id)
    except ApiError as exc:
        await message.answer(escape(exc.message) if exc.status != 404 else NOT_LINKED)
        return
    if not shoots:
        await message.answer("Rejada syomka yo‘q.")
        return
    lines = [f"• {escape(s['when'])} <i>({escape(s['client'])})</i>" for s in shoots]
    await message.answer("<b>Yaqin syomkalar</b>\n" + "\n".join(lines))


@router.message(F.text)
async def fallback(message: Message):
    await message.answer("Buyruqni tushunmadim. /yordam — mavjud buyruqlar.")
