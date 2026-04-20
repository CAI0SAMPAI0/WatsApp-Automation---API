from django.db import models


class Contact(models.Model):
    TYPE_CHOICES = [("contact", "Contato"), ("group", "Grupo")]

    jid      = models.CharField(max_length=100, unique=True)
    name     = models.CharField(max_length=255, db_index=True)
    type     = models.CharField(max_length=10, choices=TYPE_CHOICES)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.jid})"
