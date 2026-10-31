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
    end_time = models.TimeField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    client_prep = models.TextField("Mijoz nima tayyorlasin", blank=True)
    client_confirmed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="shoot_days")
    brandface_name = models.CharField(max_length=120, blank=True)
    brandface_videos = models.PositiveSmallIntegerField(default=0)
    planned_items = models.ManyToManyField(ContentItem, blank=True, related_name="shoot_days")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="planned")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["date", "start_time"]


class Brief(models.Model):
    """TZ — SMM menejer ijodkorga beradigan texnik topshiriq. Mijozga ko'rinmaydi."""

    DRAFT = "draft"
    SENT = "sent"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    CHANGES = "changes"
    DONE = "done"
    CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (DRAFT, "Qoralama"),
        (SENT, "Yuborildi"),
        (IN_PROGRESS, "Ishlanmoqda"),
        (REVIEW, "Tekshiruvda"),
        (CHANGES, "Qaytarildi"),
        (DONE, "Bajarildi"),
        (CANCELLED, "Bekor qilindi"),
    ]
    OPEN = {SENT, IN_PROGRESS, CHANGES}

    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="briefs")
    content_item = models.ForeignKey(ContentItem, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="briefs")
    shoot_day = models.ForeignKey(ShootDay, null=True, blank=True, on_delete=models.SET_NULL, related_name="briefs")
    title = models.CharField("Nima qilinadi", max_length=200)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="briefs")
    goal = models.TextField("Maqsad", blank=True)
    script = models.TextField("Ssenariy / matn", blank=True)
    shot_list = models.JSONField("Kadrlar ro'yxati", default=list, blank=True, help_text="[{text, done}]")
    format = models.CharField("Format", max_length=120, blank=True, help_text="Masalan: 9:16, 30 soniya")
    references = models.TextField("Namunalar (havolalar)", blank=True)
    location = models.CharField(max_length=200, blank=True)
    talent = models.CharField("Kadrda kim", max_length=200, blank=True)
    notes = models.TextField("Qo'shimcha", blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=DRAFT)
    review_comment = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    seen_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["deadline", "-created_at"]
        indexes = [models.Index(fields=["assignee", "status"])]

    def __str__(self):
        return self.title
