"""OBRO’ Panel Telegram boti. Ishga tushirish:  python -m obro_bot  (bot papkasida)."""
import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import BotCommand

from obro_bot import config
from obro_bot.api import Api
from obro_bot.handlers import router
from obro_bot.jobs import outbox_loop, schedule_loop

COMMANDS = [
    BotCommand(command="bugun", description="Bugungi vazifalar"),
    BotCommand(command="jurnal", description="Ish jurnaliga yozish"),
    BotCommand(command="yordam", description="Yordam"),
    BotCommand(command="uzish", description="Botni akkauntdan uzish"),
]


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = config.load()
    api = Api(cfg.api_url, cfg.api_secret)
    bot = Bot(cfg.token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(api=api)
    dp.include_router(router)
    await bot.set_my_commands(COMMANDS)
    background = [
        asyncio.create_task(outbox_loop(bot, api, cfg.outbox_interval)),
        asyncio.create_task(schedule_loop(api, cfg.morning_at, cfg.evening_at, cfg.timezone)),
    ]
    try:
        await dp.start_polling(bot)
    finally:
        for task in background:
            task.cancel()
        await api.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
