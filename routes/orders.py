import os
import uuid

from flask import Blueprint, render_template, redirect, url_for, request, flash, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from extensions import db
from models import CartItem, Order, OrderItem

bp = Blueprint("orders", __name__)


def _allowed_file(filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in current_app.config["ALLOWED_IMAGE_EXT"]


@bp.route("/checkout", methods=["GET", "POST"])
@login_required
def checkout():
    items = CartItem.query.filter_by(user_id=current_user.id).all()
    if not items:
        flash("Сабади шумо холист.", "warning")
        return redirect(url_for("main.index"))

    total = sum((item.subtotal for item in items), 0)

    if request.method == "POST":
        name = request.form.get("customer_name", "").strip()
        phone = request.form.get("phone", "").strip()
        city = request.form.get("city", "").strip()
        address = request.form.get("street_address", "").strip()
        comment = request.form.get("comment", "").strip()

        if not all([name, phone, city, address]):
            flash("Лутфан ҳамаи майдонҳои ҳатмиро пур кунед.", "danger")
            return render_template("checkout.html", items=items, total=total)

        order = Order(
            user_id=current_user.id,
            customer_name=name,
            phone=phone,
            city=city,
            street_address=address,
            comment=comment,
            total_amount=total,
            status="awaiting_payment",
        )
        for item in items:
            order.items.append(OrderItem(
                product_id=item.product_id,
                product_name=item.product.name,
                price=item.product.price,
                quantity=item.quantity,
            ))
            item.product.stock = max(0, item.product.stock - item.quantity)

        db.session.add(order)
        for item in items:
            db.session.delete(item)
        db.session.commit()

        return redirect(url_for("orders.payment", order_id=order.id))

    return render_template("checkout.html", items=items, total=total)


@bp.route("/order/<int:order_id>/payment", methods=["GET", "POST"])
@login_required
def payment(order_id):
    order = Order.query.filter_by(id=order_id, user_id=current_user.id).first_or_404()

    if request.method == "POST":
        file = request.files.get("receipt")
        if not file or file.filename == "":
            flash("Лутфан скриншоти чекро боргузорӣ кунед.", "danger")
            return render_template("payment.html", order=order)

        if not _allowed_file(file.filename):
            flash("Танҳо файлҳои тасвирӣ (png, jpg, jpeg, webp) қабул мешаванд.", "danger")
            return render_template("payment.html", order=order)

        os.makedirs(current_app.config["UPLOAD_FOLDER_RECEIPTS"], exist_ok=True)
        ext = file.filename.rsplit(".", 1)[-1].lower()
        filename = secure_filename(f"order{order.id}_{uuid.uuid4().hex[:8]}.{ext}")
        file.save(os.path.join(current_app.config["UPLOAD_FOLDER_RECEIPTS"], filename))

        order.receipt_filename = filename
        order.status = "awaiting_confirmation"
        db.session.commit()
        flash("Чек фиристода шуд. Фармоиши шумо интизори тасдиқи админ аст.", "success")
        return redirect(url_for("orders.order_detail", order_id=order.id))

    return render_template("payment.html", order=order)


@bp.route("/profile")
@login_required
def profile():
    orders = Order.query.filter_by(user_id=current_user.id).order_by(Order.created_at.desc()).all()
    return render_template("profile.html", orders=orders)


@bp.route("/order/<int:order_id>")
@login_required
def order_detail(order_id):
    order = Order.query.filter_by(id=order_id, user_id=current_user.id).first_or_404()
    return render_template("order_detail.html", order=order)
