from django.contrib import admin
from .models import Incident, IncidentNote, Notification


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ['title', 'incident_type', 'severity', 'status', 'reported_by', 'assigned_to', 'created_at']
    list_filter = ['status', 'severity', 'incident_type']
    search_fields = ['title', 'description']


@admin.register(IncidentNote)
class IncidentNoteAdmin(admin.ModelAdmin):
    list_display = ['incident', 'author', 'created_at']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'notif_type', 'message', 'is_read', 'created_at']
    list_filter = ['is_read', 'notif_type']
