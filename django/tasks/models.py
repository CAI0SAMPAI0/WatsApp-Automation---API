from django.db import models


class Task(models.Model):
    MODE_CHOICES = [
        ("text",      "Só texto"),
        ("file",      "Só arquivo"),
        ("file_text", "Arquivo + texto"),
    ]
    STATUS_CHOICES = [
        ("pending",   "Pendente"),
        ("running",   "Enviando"),
        ("completed", "Concluído"),
        ("failed",    "Falhou"),
        ("cancelled", "Cancelado"),
    ]

    # destinatário
    target_jid  = models.CharField(max_length=100)
    target_name = models.CharField(max_length=255)  # só para exibição

    # conteúdo
    mode       = models.CharField(max_length=10, choices=MODE_CHOICES)
    message    = models.TextField(blank=True, default="")
    file       = models.FileField(upload_to="uploads/%Y/%m/", null=True, blank=True)
    file_name  = models.CharField(max_length=255, blank=True, default="")

    # agendamento
    scheduled_at = models.DateTimeField()
    is_recurring = models.BooleanField(default=False)
    recur_days   = models.CharField(
        max_length=20, blank=True, default="",
        help_text="'all' para todos os dias, 'weekdays' para Seg-Sex"
    )

    # lote
    batch_id = models.CharField(max_length=50, blank=True, default="")

    # status
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    error_message = models.TextField(blank=True, default="")
    created_at    = models.DateTimeField(auto_now_add=True)
    executed_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-scheduled_at"]

    def __str__(self):
        return f"{self.target_name} @ {self.scheduled_at} [{self.status}]"
