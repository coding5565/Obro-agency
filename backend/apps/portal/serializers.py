"""Mijoz kabineti serializerlari — «oq ro'yxat».

Faqat shu yerda sanalgan maydonlar mijozga chiqadi. Ichki izoh, maosh, foiz, xodim samaradorligi
va tasdiqlanmagan yozuvlar bu yerga hech qachon qo'shilmaydi.
"""
from rest_framework import serializers

from apps.content import models as cm
from apps.content.services import revisions_left
from apps.leads.models import Lead, LeadEvent
from common.calc.invoices import STATUS_LABELS
from common.files import signed_version_url

CLIENT_STATUS = {
    cm.IDEA: ("in_work", "Tayyorlanmoqda"),
    cm.SCRIPT: ("in_work", "Tayyorlanmoqda"),
    cm.SHOOTING: ("in_work", "Tayyorlanmoqda"),
    cm.EDITING: ("in_work", "Tayyorlanmoqda"),
    cm.INTERNAL_REVIEW: ("in_work", "Tayyorlanmoqda"),
    cm.CHANGES: ("in_work", "Tuzatilmoqda"),
    cm.CLIENT_REVIEW: ("awaiting_you", "Sizning tasdig‘ingizda"),
    cm.APPROVED: ("approved", "Tasdiqlandi"),
    cm.PUBLISHED: ("published", "Joylandi"),
}


class PortalCalendarItemSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display")
    status = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()

    class Meta:
        model = cm.ContentItem
        fields = ["id", "kind", "kind_label", "title", "planned_date", "status", "status_label", "published_at",
                  "published_url"]

    def get_status(self, item):
        return CLIENT_STATUS.get(item.status, ("in_work", ""))[0]

    def get_status_label(self, item):
        return CLIENT_STATUS.get(item.status, ("in_work", ""))[1]


class PortalVersionSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = cm.ContentVersion
        fields = ["id", "number", "file_url", "link", "created_at"]

    def get_file_url(self, version):
        return signed_version_url(self.context["request"], version)


class PortalApprovalHistorySerializer(serializers.ModelSerializer):
    version_number = serializers.IntegerField(source="version.number")
    decided_by_name = serializers.CharField(source="decided_by.full_name")

    class Meta:
        model = cm.Approval
        fields = ["version_number", "decision", "comment", "timecode", "decided_by_name", "created_at"]


class PortalApprovalItemSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display")
    version = serializers.SerializerMethodField()
    revisions_left = serializers.SerializerMethodField()

    class Meta:
        model = cm.ContentItem
        fields = ["id", "kind", "kind_label", "title", "caption", "planned_date", "version", "revisions_left"]

    def get_version(self, item):
        version = item.versions.filter(client_visible=True).order_by("-number").first()
        return PortalVersionSerializer(version, context=self.context).data if version else None

    def get_revisions_left(self, item):
        return revisions_left(item)


class PortalApprovalDetailSerializer(PortalApprovalItemSerializer):
    history = serializers.SerializerMethodField()
    can_decide = serializers.SerializerMethodField()

    class Meta(PortalApprovalItemSerializer.Meta):
        fields = PortalApprovalItemSerializer.Meta.fields + ["history", "can_decide"]

    def get_history(self, item):
        qs = cm.Approval.objects.filter(version__item=item, version__client_visible=True).select_related(
            "version", "decided_by")
        return PortalApprovalHistorySerializer(qs, many=True).data

    def get_can_decide(self, item):
        return item.status == cm.CLIENT_REVIEW


class PortalWorklogSerializer(serializers.Serializer):
    date = serializers.DateField()
    time = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display")
    title = serializers.CharField()
    quantity = serializers.IntegerField()
    link = serializers.URLField()

    def get_time(self, entry):
        from django.utils import timezone

        return timezone.localtime(entry.created_at).strftime("%H:%M")


class PortalInvoiceSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    number = serializers.CharField()
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    currency = serializers.CharField()
    total = serializers.DecimalField(max_digits=18, decimal_places=2)
    paid_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    outstanding = serializers.DecimalField(max_digits=18, decimal_places=2)
    due_date = serializers.DateField()
    status = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    lines = serializers.SerializerMethodField()

    def get_status(self, invoice):
        return invoice.status_on()

    def get_status_label(self, invoice):
        return STATUS_LABELS[invoice.status_on()]

    def get_lines(self, invoice):
        return [{"description": line.description, "quantity": str(line.quantity), "amount": str(line.amount)}
                for line in invoice.lines.all()]


class PortalLeadEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeadEvent
        fields = ["id", "kind", "text", "created_at"]


class PortalLeadSerializer(serializers.ModelSerializer):
    """Xom ma'lumot (raw) va ichki mas'ul mijozga chiqmaydi."""

    status_label = serializers.CharField(source="get_status_display")
    is_duplicate = serializers.BooleanField()
    events = PortalLeadEventSerializer(many=True)

    class Meta:
        model = Lead
        fields = ["id", "full_name", "phone", "email", "city", "message", "form_name", "campaign_name",
                  "source_label", "status", "status_label", "is_duplicate", "next_contact_at", "sale_amount",
                  "sale_currency", "lost_reason", "created_at", "events"]


class PortalShootSerializer(serializers.ModelSerializer):
    """Ishtirokchilar va ichki izoh mijozga chiqmaydi."""

    status_label = serializers.CharField(source="get_status_display")

    class Meta:
        model = cm.ShootDay
        fields = ["id", "date", "start_time", "end_time", "location", "client_prep", "client_confirmed_at", "status",
                  "status_label", "brandface_name"]
