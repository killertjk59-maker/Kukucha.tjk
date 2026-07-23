"""
Run once after deploy to create the admin account and starter categories:

    python seed.py

Reads ADMIN_PHONE / ADMIN_PASSWORD from the environment if set, otherwise
uses the defaults below (change the password immediately after first login).
"""
import os
from app import create_app
from extensions import db
from models import User, Category

app = create_app()

DEFAULT_CATEGORIES = [
    ("Либос", "libos", "👕"),
    ("Пойафзол", "poyafzol", "👟"),
    ("Бозича", "bozicha", "🧸"),
    ("Навзод", "navzod", "🍼"),
    ("Аксессуар", "aksessuar", "🎀"),
]

with app.app_context():
    db.create_all()

    if not Category.query.first():
        for order, (name, slug, icon) in enumerate(DEFAULT_CATEGORIES):
            db.session.add(Category(name=name, slug=slug, icon=icon, sort_order=order))
        print("Категорияҳои аслӣ илова шуданд.")

    admin_phone = os.environ.get("ADMIN_PHONE", "992000000000")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin12345")

    if not User.query.filter_by(phone=admin_phone).first():
        admin = User(full_name="Admin", phone=admin_phone, is_admin=True)
        admin.set_password(admin_password)
        db.session.add(admin)
        print(f"Ҳисоби админ сохта шуд -> телефон: {admin_phone}, рамз: {admin_password}")
        print("МУҲИМ: пас аз воридшавии аввал ин рамзро тағйир диҳед!")
    else:
        print("Ҳисоби админ аллакай мавҷуд аст.")

    db.session.commit()
    print("Seed анҷом ёфт.")
