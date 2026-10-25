from django.db import models

from common.money import CURRENCY_CHOICES, MONEY_DIGITS, MONEY_PLACES, USD

SOURCE_CHOICES = [("manual", "Qo‘lda"), ("api", "API")]


class MetricSnapshot(models.Model):
    """Akkaunt ko'rsatkichlari. MVP'da SMM menejer haftasiga bir marta qo'lda kiritadi."""

    social_account = models.ForeignKey("clients.SocialAccount", on_delete=models.CASCADE, related_name="snapshots")
    date = models.DateField()
    followers = models.PositiveIntegerField()
    reach = models.PositiveIntegerField(default=0, help_text="7 kunlik qamrov")
    impressions = models.PositiveIntegerField(default=0)
    profile_visits = models.PositiveIntegerField(default=0)
    engagement_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0, help_text="ER, %")
    source = models.CharField(max_length=6, choices=SOURCE_CHOICES, default="manual")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]
        unique_together = [("social_account", "date")]


class ContentMetric(models.Model):
    item = models.ForeignKey("content.ContentItem", on_delete=models.CASCADE, related_name="metrics")
    date = models.DateField()
    views = models.PositiveIntegerField(default=0)
    likes = models.PositiveIntegerField(default=0)
    comments = models.PositiveIntegerField(default=0)
    saves = models.PositiveIntegerField(default=0)
    shares = models.PositiveIntegerField(default=0)
    source = models.CharField(max_length=6, choices=SOURCE_CHOICES, default="manual")

    class Meta:
        ordering = ["-date"]
        unique_together = [("item", "date")]


class AdCampaign(models.Model):
    project = models.ForeignKey("clients.Project", on_delete=models.CASCADE, related_name="ad_campaigns")
    platform = models.CharField(max_length=20, default="meta")
    name = models.CharField(max_length=150)
    objective = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=10, choices=[("active", "Faol"), ("paused", "To‘xtatilgan"),
                                                      ("ended", "Tugagan")], default="active")
    started_on = models.DateField(null=True, blank=True)
    ended_on = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-started_on", "name"]


class AdStat(models.Model):
    """Reklama natijasi bir kun yoki davr uchun. Lidlar MVP'da faqat soni."""

    campaign = models.ForeignKey(AdCampaign, on_delete=models.CASCADE, related_name="stats")
    date = models.DateField()
    spend = models.DecimalField(max_digits=MONEY_DIGITS, decimal_places=MONEY_PLACES, default=0)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default=USD)
    impressions = models.PositiveIntegerField(default=0)
    clicks = models.PositiveIntegerField(default=0)
    leads = models.PositiveIntegerField(default=0)
    source = models.CharField(max_length=6, choices=SOURCE_CHOICES, default="manual")

    class Meta:
        ordering = ["-date"]
        unique_together = [("campaign", "date")]
