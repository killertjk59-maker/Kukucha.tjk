import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "kukucha-dev-secret-change-me")

    # Railway automatically provides DATABASE_URL for its Postgres plugin.
    # Railway's Postgres URL sometimes starts with "postgres://" which
    # SQLAlchemy 1.4+/2.x no longer accepts — normalize it to "postgresql://".
    _db_url = os.environ.get("DATABASE_URL", "sqlite:///" + os.path.join(basedir, "kukucha.db"))
    if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql://", 1)
    if _db_url.startswith("postgresql://"):
        _db_url = _db_url.replace("postgresql://", "postgresql+pg8000://", 1)
        
    SQLALCHEMY_DATABASE_URI = _db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER_PRODUCTS = os.path.join(basedir, "static", "uploads", "products")
    UPLOAD_FOLDER_RECEIPTS = os.path.join(basedir, "static", "uploads", "receipts")
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024  # 8 MB per upload

    ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "webp"}

    PERMANENT_SESSION_LIFETIME = timedelta(days=30)

    ADMIN_CARD_HOLDER = os.environ.get("ADMIN_CARD_HOLDER", "Kukucha.tjk")
    ADMIN_CARD_NUMBER = os.environ.get("ADMIN_CARD_NUMBER", "034392828")
    ADMIN_CARD_BANK = os.environ.get("ADMIN_CARD_BANK", "Душанбе Сити")

    STORE_NAME = "Kukucha.tjk"

