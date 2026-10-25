from django.db import transaction
from rest_framework import serializers

from apps.catalog.models import PANEL_FEATURES, Service, Tariff, TariffLimit, TariffVersion


class TariffLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = TariffLimit
        fields = ["content_kind", "quantity"]


class TariffVersionSerializer(serializers.ModelSerializer):
    limits = TariffLimitSerializer(many=True)

    class Meta:
        model = TariffVersion
        fields = ["id", "tariff", "price", "currency", "valid_from", "revisions_per_item", "panel_features",
                  "limits", "notes", "created_at"]
        read_only_fields = ["created_at"]

    def validate_panel_features(self, value):
        unknown = [f for f in value if f not in PANEL_FEATURES]
        if unknown:
            raise serializers.ValidationError(f"Noma’lum bo‘limlar: {', '.join(unknown)}")
        return value

    @transaction.atomic
    def create(self, validated_data):
        limits = validated_data.pop("limits", [])
        version = TariffVersion.objects.create(**validated_data)
        TariffLimit.objects.bulk_create([TariffLimit(version=version, **limit) for limit in limits])
        return version

    @transaction.atomic
    def update(self, instance, validated_data):
        # Loyihalarga bog'langan versiya narxi o'zgarmaydi — yangi versiya qo'shish kerak.
        if instance.projects.exists() and ("price" in validated_data or "currency" in validated_data):
            raise serializers.ValidationError(
                {"price": "Bu versiya loyihalarda ishlatilgan. Narx o‘zgarsa, yangi versiya qo‘shing."})
        limits = validated_data.pop("limits", None)
        instance = super().update(instance, validated_data)
        if limits is not None:
            instance.limits.all().delete()
            TariffLimit.objects.bulk_create([TariffLimit(version=instance, **limit) for limit in limits])
        return instance


class TariffSerializer(serializers.ModelSerializer):
    versions = TariffVersionSerializer(many=True, read_only=True)
    current_version = serializers.SerializerMethodField()

    class Meta:
        model = Tariff
        fields = ["id", "code", "name", "description", "sort", "is_active", "current_version", "versions"]

    def get_current_version(self, tariff):
        version = tariff.current_version()
        return TariffVersionSerializer(version).data if version else None


class ServiceSerializer(serializers.ModelSerializer):
    unit_label = serializers.CharField(source="get_unit_display", read_only=True)

    class Meta:
        model = Service
        fields = ["id", "name", "unit", "unit_label", "price", "currency", "price_negotiable", "is_active"]
