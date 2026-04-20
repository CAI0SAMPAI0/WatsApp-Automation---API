from django.urls import path, include
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("api/contacts/", include("contacts.urls")),
    path("api/tasks/", include("tasks.urls")),
    # frontend — qualquer rota não-API serve o index.html
    path("", TemplateView.as_view(template_name="index.html")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
