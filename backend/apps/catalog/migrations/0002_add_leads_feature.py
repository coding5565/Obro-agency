from django.db import migrations


def add_leads(apps, schema_editor):
    """Reklama natijalarini ko'radigan tariflarda lidlar ro'yxati ham ochiladi."""
    TariffVersion = apps.get_model("catalog", "TariffVersion")
    for version in TariffVersion.objects.all():
        features = list(version.panel_features or [])
        if "ads" in features and "leads" not in features:
            features.append("leads")
            version.panel_features = features
            version.save(update_fields=["panel_features"])


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial")]
    operations = [migrations.RunPython(add_leads, migrations.RunPython.noop)]
