import os
import uuid
from decimal import Decimal, InvalidOperation
from functools import wraps

from flask import Blueprint, render_template, redirect, url_for, request, flash, current_app, abort
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from extensions import db
from models import Product, ProductImage, Category, Order, User, ORDER_STATUSES

bp = Blueprint("admin", __name__, url_prefix="/admin")


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def _slugify(text):
    import re
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or uuid.uuid4().hex[:8]


@bp.route("/")
@login_required
@admin_required
def dashboard():
    stats = {
        "products": Product.query.count(),
        "orders": Order.query.count(),
        "customers": User.query.filter_by(is_admin=False).count(),
        "pending_orders": Order.query.filter_by(status="awaiting_confirmation").count(),
    }
    recent_orders = Order.query.order_by(Order.created_at.desc()).limit(8).all()
    return render_template("admin/dashboard.html", stats=stats, recent_orders=recent_orders)


# ---------- Products ----------

@bp.route("/products")
@login_required
@admin_required
def products():
    all_products = Product.query.order_by(Product.created_at.desc()).all()
    return render_template("admin/products.html", products=all_products)


@bp.route("/products/new", methods=["GET", "POST"])
@login_required
@admin_required
def product_new():
    categories = Category.query.order_by(Category.sort_order).all()
    if request.method == "POST":
        return _save_product(None, categories)
    return render_template("admin/product_form.html", product=None, categories=categories)


@bp.route("/products/<int:product_id>/edit", methods=["GET", "POST"])
@login_required
@admin_required
def product_edit(product_id):
    product = Product.query.get_or_404(product_id)
    categories = Category.query.order_by(Category.sort_order).all()
    if request.method == "POST":
        return _save_product(product, categories)
    return render_template("admin/product_form.html", product=product, categories=categories)


def _save_product(product, categories):
    name = request.form.get("name", "").strip()
    try:
        price = Decimal(request.form.get("price", "0"))
    except InvalidOperation:
        price = Decimal("0")
    old_price_raw = request.form.get("old_price", "").strip()
    old_price = None
    if old_price_raw:
        try:
            old_price = Decimal(old_price_raw)
        except InvalidOperation:
            old_price = None

    if not name or not request.form.get("category_id"):
        flash("Ном ва категория ҳатмист.", "danger")
        return render_template("admin/product_form.html", product=product, categories=categories)

    is_new = product is None
    if is_new:
        product = Product(slug=_slugify(name))

    product.name = name
    product.description = request.form.get("description", "")
    product.price = price
    product.old_price = old_price
    product.category_id = int(request.form.get("category_id"))
    product.brand = request.form.get("brand", "")
    product.country = request.form.get("country", "")
    product.age_range = request.form.get("age_range", "")
    product.color = request.form.get("color", "")
    product.size = request.form.get("size", "")
    product.sku = request.form.get("sku") or None
    product.stock = int(request.form.get("stock", 0) or 0)
    product.is_featured = bool(request.form.get("is_featured"))
    product.is_active = bool(request.form.get("is_active", "on"))

    if is_new:
        db.session.add(product)
    db.session.flush()

    files = request.files.getlist("images")
    os.makedirs(current_app.config["UPLOAD_FOLDER_PRODUCTS"], exist_ok=True)
    for order_index, file in enumerate(files):
        if file and file.filename:
            ext = file.filename.rsplit(".", 1)[-1].lower()
            if ext in current_app.config["ALLOWED_IMAGE_EXT"]:
                filename = secure_filename(f"prod{product.id}_{uuid.uuid4().hex[:8]}.{ext}")
                file.save(os.path.join(current_app.config["UPLOAD_FOLDER_PRODUCTS"], filename))
                db.session.add(ProductImage(product_id=product.id, filename=filename, sort_order=order_index))

    db.session.commit()
    flash("Маҳсулот нигоҳ дошта шуд.", "success")
    return redirect(url_for("admin.products"))


@bp.route("/products/<int:product_id>/delete", methods=["POST"])
@login_required
@admin_required
def product_delete(product_id):
    product = Product.query.get_or_404(product_id)
    db.session.delete(product)
    db.session.commit()
    flash("Маҳсулот нест карда шуд.", "info")
    return redirect(url_for("admin.products"))


# ---------- Categories ----------

@bp.route("/categories", methods=["GET", "POST"])
@login_required
@admin_required
def categories():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        icon = request.form.get("icon", "📦").strip() or "📦"
        if name:
            db.session.add(Category(name=name, slug=_slugify(name), icon=icon))
            db.session.commit()
            flash("Категория илова шуд.", "success")
        return redirect(url_for("admin.categories"))
    all_categories = Category.query.order_by(Category.sort_order).all()
    return render_template("admin/categories.html", categories=all_categories)


@bp.route("/categories/<int:category_id>/delete", methods=["POST"])
@login_required
@admin_required
def category_delete(category_id):
    category = Category.query.get_or_404(category_id)
    if category.products:
        flash("Категорияро нест кардан мумкин нест — он маҳсулот дорад.", "danger")
    else:
        db.session.delete(category)
        db.session.commit()
        flash("Категория нест карда шуд.", "info")
    return redirect(url_for("admin.categories"))


# ---------- Orders ----------

@bp.route("/orders")
@login_required
@admin_required
def orders():
    status_filter = request.args.get("status")
    query = Order.query
    if status_filter:
        query = query.filter_by(status=status_filter)
    all_orders = query.order_by(Order.created_at.desc()).all()
    return render_template("admin/orders.html", orders=all_orders, statuses=ORDER_STATUSES, status_filter=status_filter)


@bp.route("/orders/<int:order_id>")
@login_required
@admin_required
def order_detail(order_id):
    order = Order.query.get_or_404(order_id)
    return render_template("admin/order_detail.html", order=order, statuses=ORDER_STATUSES)


@bp.route("/orders/<int:order_id>/confirm", methods=["POST"])
@login_required
@admin_required
def order_confirm(order_id):
    order = Order.query.get_or_404(order_id)
    order.status = "confirmed"
    db.session.commit()
    flash("Фармоиш тасдиқ карда шуд. Мизоҷ огоҳ карда мешавад.", "success")
    return redirect(url_for("admin.order_detail", order_id=order.id))


@bp.route("/orders/<int:order_id>/reject", methods=["POST"])
@login_required
@admin_required
def order_reject(order_id):
    order = Order.query.get_or_404(order_id)
    order.status = "rejected"
    db.session.commit()
    flash("Фармоиш рад карда шуд.", "info")
    return redirect(url_for("admin.order_detail", order_id=order.id))


@bp.route("/orders/<int:order_id>/status", methods=["POST"])
@login_required
@admin_required
def order_update_status(order_id):
    order = Order.query.get_or_404(order_id)
    new_status = request.form.get("status")
    valid_statuses = [s[0] for s in ORDER_STATUSES]
    if new_status in valid_statuses:
        order.status = new_status
        db.session.commit()
        flash("Статуси фармоиш нав карда шуд.", "success")
    return redirect(url_for("admin.order_detail", order_id=order.id))


# ---------- Customers ----------

@bp.route("/customers")
@login_required
@admin_required
def customers():
    all_customers = User.query.filter_by(is_admin=False).order_by(User.created_at.desc()).all()
    return render_template("admin/customers.html", customers=all_customers)
