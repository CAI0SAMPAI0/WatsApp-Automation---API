from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "tasks"

    def ready(self):
        # inicia o scheduler quando o Django sobe
        import os
        if os.environ.get("RUN_MAIN") != "true":  # evita duplo start no runserver
            from .scheduler import start
            start()
