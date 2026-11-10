"""Bot buyruqlari. Matnlar sodda o'zbekcha; har bir amalning ruxsati API tomonida tekshiriladi."""
from html import escape

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from obro_bot import keyboards as kb
from obro_bot.api import Api, ApiError
from obro_bot.keyboards import WORK_KINDS, kinds_keyboard, login_keyboard, main_menu, projects_keyboard, tasks_keyboard

router = Router()

NOT_LINKED = ("Bu Telegram akkaunti hali ulanmagan.\n\n"
              "Agar OBRO AGENCY mijozi yoki xodimi bo‘lsangiz, pastdagi «📱 Raqam bilan kirish» tugmasini bosing: "
              "kabinetingizdagi telefon raqami bilan bot o‘zi taniydi.")
GUEST_WELCOME = ("Assalomu alaykum! <b>OBRO AGENCY</b> botiga xush kelibsiz.\n\n"
                 "📱 <b>Mijoz yoki xodim bo‘lsangiz</b>: «Raqam bilan kirish»ni bosing.\n"
                 "💼 <b>Yangi bo‘lsangiz</b>: tariflarni ko‘ring yoki ariza qoldiring, o‘zimiz bog‘lanamiz.")

STAFF_HELP = ("Pastdagi tugmalar:\n"
              "📊 Holat — vazifalar, TZ, syomka, ulushingiz (rahbarga agentlik holati ham)\n"
              "📋 Bugun — bugungi va muddati yaqin vazifalar\n"
              "📝 Jurnal — ish jurnaliga yozish (1 daqiqa)\n"
              "🎬 TZ — sizga berilgan TZ’lar\n"
              "📸 Syomka — yaqin syomkalar\n"
              "📞 Lidlar — so‘nggi lidlar\n"
              "🔑 Kabinetga kirish — panelni parolsiz ochish\n\n"
              "/id — shu chat raqami (lidlar guruhi uchun)\n"
              "/uzish — botni akkauntdan uzish")
CLIENT_HELP = ("Material tayyor bo‘lsa, shu yerga xabar keladi: «Tasdiqlayman» yoki «Izoh qoldirish».\n\n"
               "Pastdagi tugmalar:\n"
               "📊 Holat — shu oy nima qilindi, tasdiq kutayotganlar\n"
               "📸 Syomka — yaqin syomka kunlari\n"
               "💳 To‘lov — hisob-fakturalar va qoldiq\n"
               "📞 Lidlar — reklamadan kelgan murojaatlar\n"
               "🔑 Kabinetga kirish — kabinetni parolsiz ochish\n\n"
               "/uzish — botni akkauntdan uzish")


class Journal(StatesGroup):
    project = State()
    kind = State()
    text = State()


class ChangeRequest(StatesGroup):
    comment = State()


class Apply(StatesGroup):
    name = State()
    business = State()
    phone = State()


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
                         f"Akkaunt ulandi ({escape(profile['role_label'])}).\n\n{help_text}",
                         reply_markup=main_menu(profile))


@router.message(CommandStart())
async def start(message: Message, api: Api):
    try:
        profile = await api.me(message.chat.id)
    except ApiError:
        await message.answer(GUEST_WELCOME, reply_markup=kb.guest_menu())
        return
    help_text = CLIENT_HELP if profile["is_client"] else STAFF_HELP
    await message.answer(f"Siz <b>{escape(profile['full_name'])}</b> sifatida ulangansiz.\n\n{help_text}",
                         reply_markup=main_menu(profile))


@router.message(F.text == kb.HELP)
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

@router.message(F.text == kb.TODAY)
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

@router.message(F.text == kb.JOURNAL)
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


@router.message(F.text == kb.BRIEFS)
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


@router.message(F.text == kb.SHOOTS)
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


# ---------- Mehmonlar: raqam bilan kirish, tariflar, ariza ----------

@router.message(F.contact)
async def contact_login(message: Message, api: Api, state: FSMContext):
    contact = message.contact
    # Faqat o'z raqami: boshqa odamning kontaktini yuborib kirib bo'lmaydi.
    if contact.user_id != message.from_user.id:
        await message.answer("Iltimos, o‘zingizning raqamingizni tugma orqali yuboring.", reply_markup=kb.guest_menu())
        return
    if await state.get_state() == Apply.phone.state:
        await _finish_apply(message, api, state, contact.phone_number)
        return
    try:
        profile = await api.link_phone(message.chat.id, contact.phone_number, message.from_user.username or "")
    except ApiError as exc:
        if exc.status == 404:
            await message.answer("Bu raqam bilan akkaunt topilmadi. Mijozimiz bo‘lsangiz, SMM menejeringizdan "
                                 "kabinetdagi raqamni so‘rang. Yangi bo‘lsangiz, ariza qoldiring.",
                                 reply_markup=kb.guest_menu())
        else:
            await message.answer(escape(exc.message), reply_markup=kb.guest_menu())
        return
    help_text = CLIENT_HELP if profile["is_client"] else STAFF_HELP
    await message.answer(f"Assalomu alaykum, <b>{escape(profile['full_name'])}</b>! Bot ulandi.\n\n{help_text}",
                         reply_markup=main_menu(profile))


@router.message(F.text == kb.TARIFFS)
@router.message(Command("tariflar"))
async def tariffs(message: Message, api: Api):
    try:
        data = await api.tariffs()
    except ApiError as exc:
        await message.answer(escape(exc.message))
        return
    await message.answer(data["text"])


@router.message(F.text == kb.CONTACT)
@router.message(Command("aloqa"))
async def contact_info(message: Message, api: Api):
    try:
        data = await api.tariffs()
    except ApiError as exc:
        await message.answer(escape(exc.message))
        return
    await message.answer(data["contact"])


@router.message(F.text == kb.APPLY)
@router.message(Command("ariza"))
async def apply_start(message: Message, state: FSMContext):
    await state.set_state(Apply.name)
    await message.answer("Ismingiz?", reply_markup=kb.cancel_menu())


@router.message(F.text == kb.CANCEL)
async def apply_cancel(message: Message, state: FSMContext, api: Api):
    await state.clear()
    await start(message, api)


@router.message(Apply.name, F.text)
async def apply_name(message: Message, state: FSMContext):
    await state.update_data(name=message.text.strip()[:150])
    await state.set_state(Apply.business)
    await message.answer("Biznesingiz nomi va sohasi? (masalan: «Nur klinikasi, stomatologiya»)")


@router.message(Apply.business, F.text)
async def apply_business(message: Message, state: FSMContext):
    await state.update_data(business=message.text.strip()[:150])
    await state.set_state(Apply.phone)
    await message.answer("Telefon raqamingizni yuboring (tugmani bosing yoki yozing):", reply_markup=kb.phone_request())


@router.message(Apply.phone, F.text)
async def apply_phone_text(message: Message, api: Api, state: FSMContext):
    await _finish_apply(message, api, state, message.text)


async def _finish_apply(message: Message, api: Api, state: FSMContext, phone: str):
    data = await state.get_data()
    try:
        await api.guest_request(message.chat.id, data.get("name", ""), data.get("business", ""), phone,
                                message.from_user.username or "")
    except ApiError as exc:
        await message.answer(escape(exc.message), reply_markup=kb.phone_request())
        return
    await state.clear()
    await message.answer("Rahmat! Arizangiz qabul qilindi, tez orada bog‘lanamiz. ✅", reply_markup=kb.guest_menu())


async def _show(message: Message, call):
    try:
        data = await call(message.chat.id)
    except ApiError as exc:
        if exc.status == 404:
            await message.answer(NOT_LINKED, reply_markup=kb.guest_menu())
        else:
            await message.answer(escape(exc.message))
        return
    await message.answer(data["text"])


@router.message(F.text == kb.STATUS)
@router.message(Command("holat"))
async def status(message: Message, api: Api):
    await _show(message, api.status)


@router.message(F.text == kb.LEADS)
@router.message(Command("lidlar"))
async def leads(message: Message, api: Api):
    await _show(message, api.leads)


@router.message(F.text == kb.PAYMENTS)
@router.message(Command("tolov"))
async def payments(message: Message, api: Api):
    await _show(message, api.payments)


@router.message(F.text == kb.LOGIN)
@router.message(Command("kirish"))
async def login(message: Message, api: Api):
    try:
        data = await api.login_link(message.chat.id)
    except ApiError as exc:
        await message.answer(escape(exc.message) if exc.status != 404 else NOT_LINKED)
        return
    await message.answer("Kabinetingizga parolsiz kirish havolasi. 5 daqiqa ichida va faqat bir marta ishlaydi, "
                         "uni hech kimga yubormang.", reply_markup=login_keyboard(data["url"]))


@router.message(F.text)
async def fallback(message: Message):
    await message.answer("Buyruqni tushunmadim. /yordam — mavjud buyruqlar.")
