from django.apps import AppConfig


class IncidentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'incidents'
    verbose_name = 'Quản lý Sự cố'

    def ready(self):
        import incidents.signals  # noqa
