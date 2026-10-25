from django.conf import settings
from django.db import models

TODO = "todo"
IN_PROGRESS = "in_progress"
DONE = "done"
CANCELLED = "cancelled"


class Task(models.Model):
    STATUS_CHOICES = [(TODO, "Bajarilishi kerak"), (IN_PROGRESS, "Jarayonda"), (DONE, "Bajarildi"),
                      (CANCELLED, "Bekor qilindi")]
    PRIORITY_CHOICES = [("low", "Past"), ("normal", "Oddiy"), ("high", "Yuqori")]

    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="tasks")
    content_item = models.ForeignKey("content.ContentItem", null=True, blank=True, on_delete=models.CASCADE,
                                     related_name="tasks")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="tasks")
    position = models.ForeignKey("accounts.Position", null=True, blank=True, on_delete=models.SET_NULL)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=TODO)
    priority = models.CharField(max_length=6, choices=PRIORITY_CHOICES, default="normal")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["status", "due_date", "id"]
        indexes = [models.Index(fields=["assignee", "status"])]

    def __str__(self):
        return self.title
