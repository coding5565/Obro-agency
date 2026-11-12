"""Vazifalar doskasi: SMM menejer vazifa beradi, ishchi suradi, izoh yozadi, xabarlar boradi."""
from datetime import timedelta

from django.utils import timezone

from apps.notifications.models import Notification
from apps.tasks import models as tm
from apps.worklog.models import WorkLogEntry
from tests.conftest import api_for


def kinds(user):
    return list(Notification.objects.filter(user=user).values_list("kind", flat=True))


class TestTaskBoard:
    def test_smm_gives_task_worker_sends_to_review_and_smm_accepts(self, project, team):
        smm, video = team["smm"], team["video"]
        res = api_for(smm).post("/api/v1/tasks/", {"project": project.pk, "title": "Reels ssenariy",
                                                   "assignee": video.pk, "due_date": str(timezone.localdate())})
        assert res.status_code == 201, res.data
        task_id = res.data["id"]
        assert res.data["created_by_name"] == "SMM"
        assert "task.assigned" in kinds(video)

        res = api_for(video).post(f"/api/v1/tasks/{task_id}/set-status/", {"status": "review"})
        assert res.status_code == 200 and res.data["status"] == "review"
        assert "task.review" in kinds(smm)
        alerts = [a["title"] for a in api_for(smm).get("/api/v1/dashboard/").data["alerts"]]
        assert any("Tekshirish kutayotgan vazifalar" in t for t in alerts)

        res = api_for(smm).post(f"/api/v1/tasks/{task_id}/set-status/", {"status": "done"})
        assert res.data["status"] == "done"
        assert "task.done" in kinds(video)
        # Jurnal yozuvi qabul qilgan menejerga emas, ishni qilgan ishchiga yoziladi.
        assert WorkLogEntry.objects.filter(task_id=task_id, user=video).exists()
        assert not WorkLogEntry.objects.filter(task_id=task_id, user=smm).exists()

    def test_return_from_review_and_comments_notify_other_side(self, project, team):
        smm, video = team["smm"], team["video"]
        task = tm.Task.objects.create(project=project, title="Montaj", assignee=video, created_by=smm, status=tm.REVIEW)
        api_for(smm).post(f"/api/v1/tasks/{task.pk}/set-status/", {"status": "in_progress"})
        assert "task.returned" in kinds(video)

        res = api_for(smm).post(f"/api/v1/tasks/{task.pk}/comments/", {"body": "Musiqani almashtiring"})
        assert res.status_code == 201 and res.data["author_name"] == "SMM"
        assert "task.comment" in kinds(video) and "task.comment" not in kinds(smm)
        res = api_for(video).post(f"/api/v1/tasks/{task.pk}/comments/", {"body": "Bo‘ldi"})
        assert "task.comment" in kinds(smm)
        assert [c["body"] for c in api_for(video).get(f"/api/v1/tasks/{task.pk}/comments/").data] == [
            "Musiqani almashtiring", "Bo‘ldi"]
        assert api_for(video).get(f"/api/v1/tasks/{task.pk}/").data["comment_count"] == 2
        assert api_for(video).post(f"/api/v1/tasks/{task.pk}/comments/", {"body": "  "}).status_code == 400

    def test_reassign_notifies_new_person_and_worker_limits(self, project, team):
        smm, video, design = team["smm"], team["video"], team["design"]
        task = tm.Task.objects.create(project=project, title="Cover", assignee=video, created_by=smm)
        res = api_for(smm).patch(f"/api/v1/tasks/{task.pk}/", {"assignee": design.pk}, format="json")
        assert res.status_code == 200
        assert "task.assigned" in kinds(design)
        # Ishchi boshqaning vazifasini sura olmaydi, vazifani bekor qila olmaydi, tahrir qila olmaydi.
        assert api_for(video).post(f"/api/v1/tasks/{task.pk}/set-status/", {"status": "done"}).status_code in (400, 404)
        assert api_for(design).post(f"/api/v1/tasks/{task.pk}/set-status/", {"status": "cancelled"}).status_code == 400
        assert api_for(design).patch(f"/api/v1/tasks/{task.pk}/", {"title": "X"}, format="json").status_code == 403

    def test_board_hides_cancelled_and_old_done(self, project, team):
        smm = team["smm"]
        tm.Task.objects.create(project=project, title="Ochiq")
        tm.Task.objects.create(project=project, title="Bekor", status=tm.CANCELLED)
        tm.Task.objects.create(project=project, title="Yangi bajarilgan", status=tm.DONE, completed_at=timezone.now())
        tm.Task.objects.create(project=project, title="Eski bajarilgan", status=tm.DONE,
                               completed_at=timezone.now() - timedelta(days=30))
        titles = {t["title"] for t in api_for(smm).get("/api/v1/tasks/", {"board": 1}).data["results"]}
        assert titles == {"Ochiq", "Yangi bajarilgan"}


class TestContentWithTz:
    def test_plan_suggests_project_team(self, project, team):
        plan = api_for(team["smm"]).get("/api/v1/content/items/plan/", {"project": project.pk}).data
        assert [s["label"] for s in plan["reels"]] == ["Ssenariy", "Suratga olish", "Montaj va cover"]
        assert plan["reels"][1]["assignee"] == team["video"].pk

    def test_smm_assigns_people_and_writes_tz_in_one_form(self, project, team):
        from apps.content.models import Brief

        smm, video, design = team["smm"], team["video"], team["design"]
        day = timezone.localdate() + timedelta(days=3)
        res = api_for(smm).post("/api/v1/content/items/", {
            "project": project.pk, "kind": "reels", "title": "Aksiya", "planned_date": str(day),
            "steps": [
                {"position": "smm_target", "assignee": smm.pk},
                {"position": "video_mobilo", "assignee": video.pk, "due_date": str(day - timedelta(days=1)),
                 "tz": "3 ta kadr: kirish, xizmat, aksiya. 9:16, 30 soniya"},
                {"position": "design_montage", "assignee": None},
            ]}, format="json")
        assert res.status_code == 201, res.data
        tasks = {t.title.split(":")[0]: t for t in tm.Task.objects.filter(content_item_id=res.data["id"])}
        assert tasks["Suratga olish"].assignee == video and tasks["Suratga olish"].due_date == day - timedelta(days=1)
        assert tasks["Montaj va cover"].assignee is None
        brief = Brief.objects.get(content_item_id=res.data["id"])
        assert brief.assignee == video and brief.status == Brief.SENT and "9:16" in brief.script
        assert "brief.sent" in kinds(video) and "task.assigned" not in kinds(video)
        assert not kinds(design)

    def test_tz_needs_assignee_from_project_team(self, project, team, rahbar):
        bad = {"project": project.pk, "kind": "post", "title": "X",
               "steps": [{"position": "smm_target", "assignee": None, "tz": "matn"}]}
        assert api_for(team["smm"]).post("/api/v1/content/items/", bad, format="json").status_code == 400
        bad["steps"][0].update(assignee=rahbar.pk, tz="")
        assert api_for(team["smm"]).post("/api/v1/content/items/", bad, format="json").status_code == 400

    def test_starting_task_moves_content_out_of_plan(self, project, team):
        from apps.content import services as content_services

        item = content_services.create_item(project=project, by=team["smm"], kind="reels", title="Yangi",
                                            planned_date=timezone.localdate())
        task = item.tasks.get(position__code="video_mobilo")
        api_for(team["video"]).post(f"/api/v1/tasks/{task.pk}/set-status/", {"status": "in_progress"})
        item.refresh_from_db()
        assert item.status == "shooting"
