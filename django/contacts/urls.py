from django.urls import path
from . import views

urlpatterns = [
    path("sync/",   views.sync_contacts,  name="contacts-sync"),
    path("search/", views.search_contacts, name="contacts-search"),
    path("status/", views.whatsapp_status, name="whatsapp-status"),
]
