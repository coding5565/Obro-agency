from django.conf import settings
from django.db import models

from apps.catalog.models import CONTENT_KIND_CHOICES, REELS

IDEA = "idea"
SCRIPT = "script"
SHOOTING = "shooting"
EDITING = "editing"
INTERNAL_REVIEW = "internal_review"
CLIENT_REVIEW = "client_review"
CHANGES = "changes"
APPROVED = "approved"
PUBLISHED = "published"
CANCELLED = "cancelled"

STATUS_CHOICES = [
    (IDEA, "Reja"),
    (SCRIPT, "Ssenariy"),
    (SHOOTING, "Suratga olish"),
    (EDITING, "Tayyorlash"),
    (INTERNAL_REVIEW, "Ichki tekshiruv"),
    (CLIENT_REVIEW, "Mijoz tasdig‘ida"),
    (CHANGES, "Tuzatishda"),
    (APPROVED, "Tasdiqlandi"),
    (PUBLISHED, "Joylandi"),
    (CANCELLED, "Bekor qilindi"),
]

# Jamoa qo'lda o'tkaza oladigan holatlar. Mijoz tasdig'i va joylash alohida amallar orqali.
STAFF_TRANSITIONS = {
    IDEA: {SCRIPT, SHOOTING, EDITING, CANCELLED},
    SCRIPT: {IDEA, SHOOTING, EDITING, CANCELLED},
    SHOOTING: {SCRIPT, EDITING, CANCELLED},
    EDITING: {SHOOTING, INTERNAL_REVIEW, CANCELLED},
    INTERNAL_REVIEW: {EDITING, CANCELLED},
    CHANGES: {EDITING, INTERNAL_REVIEW, CANCELLED},
    APPROVED: {CANCELLED},
    CLIENT_REVIEW: {INTERNAL_REVIEW},
    PUBLISHED: set(),
    CANCELLED: {IDEA},
}


class ContentItem(models.Model):
    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="content_items")
    kind = models.CharField(max_length=10, choices=CONTENT_KIND_CHOICES, default=REELS)
    title = models.CharField("Mavzu", max_length=200)
    caption = models.TextField("Matn", blank=True)
    internal_notes = models.TextField("Ichki izoh", blank=True)
    planned_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=IDEA)
    platform = models.CharField(max_length=12, default="instagram")
    published_at = models.DateTimeField(null=True, blank=True)
    published_url = models.URLField(blank=True)
    counts_toward_limit = models.BooleanField(default=True)
    revisions_used = models.PositiveSmallIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["planned_date", "id"]
        indexes = [models.Index(fields=["project", "planned_date"]), models.Index(fields=["status"])]

    def __str__(self):
        return self.title

    @property
    def latest_version(self):
        return self.versions.order_by("-number").first()


def version_upload_to(instance, filename):
    return f"content/{instance.item.project_id}/{instance.item_id}/v{instance.number}_{filename}"


class ContentVersion(models.Model):
    item = models.ForeignKey(ContentItem, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveSmallIntegerField()
    file = models.FileField(upload_to=version_upload_to, blank=True)
    link = models.URLField("Havola (Drive va h.k.)", blank=True)
    note = models.TextField(blank=True)
    client_visible = models.BooleanField(default=False, help_text="SMM menejer mijozga yuborganmi")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-number"]
        unique_together = [("item", "number")]


class Approval(models.Model):
    APPROVED = "approved"
    CHANGES = "changes"

    version = models.ForeignKey(ContentVersion, on_delete=models.CASCADE, related_name="approvals")
    decision = models.CharField(max_length=10, choices=[(APPROVED, "Tasdiqlandi"), (CHANGES, "Tuzatish so‘raldi")])
    comment = models.TextField(blank=True)
    timecode = models.CharField(max_length=20, blank=True, help_text="Masalan 0:12")
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Comment(models.Model):
    item = models.ForeignKey(ContentItem, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    body = models.TextField()
    is_internal = models.BooleanField(default=True, help_text="Ichki izoh mijozga hech qachon ko'rinmaydi")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class ShootDay(models.Model):
    STATUS_CHOICES = [("planned", "Rejalashtirilgan"), ("done", "O‘tkazildi"), ("cancelled", "Bekor qilindi")]

    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="shoot_days")
    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="shoot_days")
    brandface_name = models.CharField(max_length=120, blank=True)
    brandface_videos = models.PositiveSmallIntegerField(default=0)
    planned_items = models.ManyToManyField(ContentItem, blank=True, related_name="shoot_days")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="planned")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["date", "start_time"]
