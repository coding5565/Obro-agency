"""Bot qismlari testlari (Telegram'ga ulanmasdan)."""
import asyncio
from datetime import date, datetime, time

import httpx
import pytest
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import SendMessage

from obro_bot.api import Api, ApiError
from obro_bot.jobs import due, send_one
from obro_bot.keyboards import from_spec, kinds_keyboard, tasks_keyboard

SPEC = [[{"text": "✅ Tasdiqlayman", "callback": "ap:5"}, {"text": "✍️ Izoh", "callback": "ch:5"}],
        [{"text": "Panelda ochish", "url": "https://panel.obro.agency/portal/approvals/5"}]]


def test_keyboard_from_api_spec():
    markup = from_spec(SPEC)
    assert [b.callback_data for b in markup.inline_keyboard[0]] == ["ap:5", "ch:5"]
    assert markup.inline_keyboard[1][0].url.endswith("/approvals/5")
    without_urls = from_spec(SPEC, with_urls=False)
    assert len(without_urls.inline_keyboard) == 1
    assert from_spec([]) is None


def test_other_keyboards():
    assert tasks_keyboard([]) is None
    assert tasks_keyboard([{"id": 3, "title": "Montaj"}]).inline_keyboard[0][0].callback_data == "td:3"
    codes = [b.callback_data for row in kinds_keyboard().inline_keyboard for b in row]
    assert "kd:shooting" in codes and all(len(c) <= 64 for c in codes)


def test_due():
    morning = time(9, 0)
    assert due(datetime(2026, 11, 2, 9, 1), morning, None)
    assert not due(datetime(2026, 11, 2, 8, 59), morning, None)
    assert not due(datetime(2026, 11, 2, 10, 0), morning, date(2026, 11, 2))
    assert due(datetime(2026, 11, 3, 9, 0), morning, date(2026, 11, 2))


class FakeBot:
    def __init__(self, fail_first=False):
        self.calls = []
        self.fail_first = fail_first

    async def send_message(self, chat_id, text, reply_markup=None):
        self.calls.append(reply_markup)
        if self.fail_first and len(self.calls) == 1:
            raise TelegramBadRequest(method=SendMessage(chat_id=chat_id, text=text), message="BUTTON_URL_INVALID")


def test_send_one_retries_without_url_buttons():
    bot = FakeBot(fail_first=True)
    row = {"id": 1, "chat_id": 10, "text": "Salom", "buttons": SPEC}
    assert asyncio.run(send_one(bot, row)) is True
    assert len(bot.calls) == 2
    assert len(bot.calls[1].inline_keyboard) == 1  # faqat callback tugmalari qoldi


def test_api_error_message():
    def handler(request):
        assert request.headers["X-Bot-Secret"] == "s"
        return httpx.Response(404, json={"detail": "Akkaunt ulanmagan."})

    api = Api("http://test/api/v1", "s")
    api.client = httpx.AsyncClient(base_url="http://test/api/v1", headers={"X-Bot-Secret": "s"},
                                   transport=httpx.MockTransport(handler))
    with pytest.raises(ApiError) as exc:
        asyncio.run(api.me(1))
    assert exc.value.status == 404 and "ulanmagan" in exc.value.message
