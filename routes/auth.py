from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, logout_user, login_required, current_user

from extensions import db
from models import User

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))

    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        phone = request.form.get("phone", "").strip()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")

        error = None
        if not full_name or not phone or not password:
            error = "Лутфан ҳамаи майдонҳоро пур кунед."
        elif password != confirm:
            error = "Рамзҳо мувофиқат намекунанд."
        elif len(password) < 6:
            error = "Рамз бояд ҳадди ақал 6 аломат бошад."
        elif User.query.filter_by(phone=phone).first():
            error = "Ин рақами телефон аллакай сабт шудааст."

        if error:
            flash(error, "danger")
            return render_template("auth/register.html")

        user = User(full_name=full_name, phone=phone)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        login_user(user)
        flash("Хуш омадед ба Kukucha.tjk!", "success")
        return redirect(url_for("main.index"))

    return render_template("auth/register.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))

    if request.method == "POST":
        phone = request.form.get("phone", "").strip()
        password = request.form.get("password", "")
        user = User.query.filter_by(phone=phone).first()

        if user and user.check_password(password):
            login_user(user, remember=True)
            next_page = request.args.get("next")
            flash("Шумо бомуваффақият ворид шудед.", "success")
            return redirect(next_page or url_for("main.index"))

        flash("Рақами телефон ё рамз нодуруст аст.", "danger")

    return render_template("auth/login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Шумо баромадед.", "info")
    return redirect(url_for("main.index"))
