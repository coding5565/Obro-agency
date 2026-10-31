from django.contrib import admin

from apps.leads.models import Lead, LeadSource

admin.site.register(LeadSource)
admin.site.register(Lead)
