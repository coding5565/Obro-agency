"""OBRO’ Panel API mijozi. Bot bazaga to'g'ridan-to'g'ri kirmaydi — hamma narsa shu yerdan o'tadi."""
import httpx


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return f"Server xatosi ({response.status_code})"
    if isinstance(data, dict):
        if "detail" in data:
            return str(data["detail"])
        return " ".join(str(v[0] if isinstance(v, list) else v) for v in data.values())
    return str(data)


class Api:
    def __init__(self, base_url: str, secret: str):
        self.client = httpx.AsyncClient(base_url=base_url, headers={"X-Bot-Secret": secret}, timeout=15)

    async def close(self):
        await self.client.aclose()

    async def _call(self, method: str, path: str, **kwargs):
        response = await self.client.request(method, path, **kwargs)
        if response.status_code >= 400:
            raise ApiError(response.status_code, _message(response))
        return response.json() if response.content else None

    # Akkaunt
    async def link(self, token: str, chat_id: int, username: str = ""):
        return await self._call("POST", "/bot/link/", json={"token": token, "chat_id": chat_id, "username": username})

    async def unlink(self, chat_id: int):
        return await self._call("POST", "/bot/unlink/", json={"chat_id": chat_id})

    async def me(self, chat_id: int):
        return await self._call("GET", "/bot/me/", params={"chat_id": chat_id})

    # Xabarlar navbati
    async def outbox(self, limit: int = 50):
        return await self._call("GET", "/bot/outbox/", params={"limit": limit})

    async def ack(self, ids: list[int]):
        return await self._call("POST", "/bot/outbox/ack/", json={"ids": ids})

    # Jamoa
    async def tasks(self, chat_id: int):
        return await self._call("GET", "/bot/tasks/", params={"chat_id": chat_id})

    async def task_done(self, chat_id: int, task_id: int):
        return await self._call("POST", f"/bot/tasks/{task_id}/done/", json={"chat_id": chat_id})

    async def projects(self, chat_id: int):
        return await self._call("GET", "/bot/projects/", params={"chat_id": chat_id})

    async def add_worklog(self, chat_id: int, project: int, kind: str, title: str):
        return await self._call("POST", "/bot/worklog/",
                                json={"chat_id": chat_id, "project": project, "kind": kind, "title": title})

    # Mijoz
    async def decide(self, chat_id: int, item_id: int, decision: str, comment: str = ""):
        return await self._call("POST", f"/bot/approvals/{item_id}/",
                                json={"chat_id": chat_id, "decision": decision, "comment": comment})

    # Rejali ishlar
    async def daily_job(self):
        return await self._call("POST", "/bot/jobs/daily/", json={})

    async def evening_job(self):
        return await self._call("POST", "/bot/jobs/evening/", json={})
