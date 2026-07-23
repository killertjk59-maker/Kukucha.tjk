from flask import Blueprint, render_template, request, jsonify
from sqlalchemy import or_

from models import Product, Category, Review

bp = Blueprint("main", __name__)


@bp.route("/")
def index():
    categories = Category.query.order_by(Category.sort_order).all()
    featured = Product.query.filter_by(is_active=True, is_featured=True).limit(8).all()
    new_arrivals = Product.query.filter_by(is_active=True).order_by(Product.created_at.desc()).limit(8).all()
    on_sale = [p for p in Product.query.filter_by(is_active=True).all() if p.old_price and p.old_price > p.price][:8]
    return render_template(
        "index.html",
        categories=categories,
        featured=featured,
        new_arrivals=new_arrivals,
        on_sale=on_sale,
    )


@bp.route("/category/<slug>")
def category(slug):
    cat = Category.query.filter_by(slug=slug).first_or_404()
    sort = request.args.get("sort", "new")
    query = Product.query.filter_by(category_id=cat.id, is_active=True)

    if sort == "price_asc":
        query = query.order_by(Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc())
    else:
        query = query.order_by(Product.created_at.desc())

    products = query.all()
    categories = Category.query.order_by(Category.sort_order).all()
    return render_template("category.html", category=cat, products=products, categories=categories, sort=sort)


@bp.route("/categories")
def categories():
    categories = Category.query.order_by(Category.sort_order).all()
    return render_template("categories.html", categories=categories)


@bp.route("/product/<slug>")
def product_detail(slug):
    product = Product.query.filter_by(slug=slug, is_active=True).first_or_404()
    similar = Product.query.filter(
        Product.category_id == product.category_id,
        Product.id != product.id,
        Product.is_active == True,
    ).limit(4).all()
    reviews = Review.query.filter_by(product_id=product.id).order_by(Review.created_at.desc()).all()
    return render_template("product.html", product=product, similar=similar, reviews=reviews)


@bp.route("/search")
def search():
    q = request.args.get("q", "").strip()
    products = []
    if q:
        products = Product.query.filter(
            Product.is_active == True,
            or_(Product.name.ilike(f"%{q}%"), Product.description.ilike(f"%{q}%")),
        ).all()
    return render_template("search.html", query=q, products=products)


@bp.route("/api/search-suggest")
def search_suggest():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])
    products = Product.query.filter(
        Product.is_active == True, Product.name.ilike(f"%{q}%")
    ).limit(6).all()
    return jsonify([
        {"name": p.name, "slug": p.slug, "price": float(p.price), "image": p.main_image}
        for p in products
    ])
