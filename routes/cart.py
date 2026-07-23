from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_required, current_user

from extensions import db
from models import CartItem, Product, Favorite

bp = Blueprint("cart", __name__)


@bp.route("/cart")
@login_required
def view_cart():
    items = CartItem.query.filter_by(user_id=current_user.id).all()
    total = sum((item.subtotal for item in items), 0)
    return render_template("cart.html", items=items, total=total)


@bp.route("/cart/add/<int:product_id>", methods=["POST"])
@login_required
def add_to_cart(product_id):
    product = Product.query.get_or_404(product_id)
    qty = max(1, int(request.form.get("quantity", 1)))

    item = CartItem.query.filter_by(user_id=current_user.id, product_id=product.id).first()
    if item:
        item.quantity += qty
    else:
        item = CartItem(user_id=current_user.id, product_id=product.id, quantity=qty)
        db.session.add(item)
    db.session.commit()
    flash(f"«{product.name}» ба сабад илова шуд.", "success")
    return redirect(request.referrer or url_for("main.index"))


@bp.route("/cart/update/<int:item_id>", methods=["POST"])
@login_required
def update_cart(item_id):
    item = CartItem.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()
    action = request.form.get("action")
    if action == "increase":
        item.quantity += 1
    elif action == "decrease":
        item.quantity -= 1
        if item.quantity <= 0:
            db.session.delete(item)
    db.session.commit()
    return redirect(url_for("cart.view_cart"))


@bp.route("/cart/remove/<int:item_id>", methods=["POST"])
@login_required
def remove_from_cart(item_id):
    item = CartItem.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()
    db.session.delete(item)
    db.session.commit()
    flash("Маҳсулот аз сабад нест карда шуд.", "info")
    return redirect(url_for("cart.view_cart"))


@bp.route("/favorites")
@login_required
def view_favorites():
    favorites = Favorite.query.filter_by(user_id=current_user.id).all()
    return render_template("favorites.html", favorites=favorites)


@bp.route("/favorites/toggle/<int:product_id>", methods=["POST"])
@login_required
def toggle_favorite(product_id):
    fav = Favorite.query.filter_by(user_id=current_user.id, product_id=product_id).first()
    if fav:
        db.session.delete(fav)
        flash("Аз дӯстдоштаҳо нест шуд.", "info")
    else:
        db.session.add(Favorite(user_id=current_user.id, product_id=product_id))
        flash("Ба дӯстдоштаҳо илова шуд.", "success")
    db.session.commit()
    return redirect(request.referrer or url_for("main.index"))
