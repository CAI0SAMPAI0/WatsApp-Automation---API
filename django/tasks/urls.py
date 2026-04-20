from django.urls import path
from . import views

urlpatterns = [
    path("",          views.list_tasks,           name="tasks-list"),
    path("create/",   views.create_task,           name="tasks-create"),
    path("upload/",   views.create_task_with_file, name="tasks-upload"),
    path("send-now/", views.send_now,              name="tasks-send-now"),
    path("batch/",    views.create_batch,          name="tasks-batch"),
    path("<int:task_id>/delete/", views.delete_task, name="tasks-delete"),
]
