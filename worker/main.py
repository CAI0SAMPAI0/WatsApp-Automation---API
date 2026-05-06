from backend.app.celery_app import celery_app
import backend.app.tasks # Ensure tasks are registered

if __name__ == "__main__":
    celery_app.start()
