from datetime import datetime
from decimal import Decimal

from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(30), unique=True, nullable=False, index=True)
    email = db.Column(db.String(150), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    addresses = db.relationship("Address", backref="user", lazy=True, cascade="all, delete-orphan")
    orders = db.relationship("Order", backref="user", lazy=True)
    favorites = db.relationship("Favorite", backref="user", lazy=True, cascade="all, delete-orphan")
    cart_items = db.relationship("CartItem", backref="user", lazy=True, cascade="all, delete-orphan")
    reviews = db.relationship("Review", backref="user", lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Address(db.Model):
    __tablename__ = "addresses"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    city = db.Column(db.String(100), nullable=False)
    street_address = db.Column(db.String(255), nullable=False)
    note = db.Column(db.String(255))
    is_default = db.Column(db.Boolean, default=False)


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(120), unique=True, nullable=False, index=True)
    icon = db.Column(db.String(10), default="📦")
    sort_order = db.Column(db.Integer, default=0)

    products = db.relationship("Product", backref="category", lazy=True)


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(220), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, default="")
    price = db.Column(db.Numeric(10, 2), nullable=False)
    old_price = db.Column(db.Numeric(10, 2), nullable=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    brand = db.Column(db.String(100))
    country = db.Column(db.String(100))
    age_range = db.Column(db.String(50))
    color = db.Column(db.String(50))
    size = db.Column(db.String(50))
    sku = db.Column(db.String(50), unique=True)
    stock = db.Column(db.Integer, default=0)
    is_featured = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    images = db.relationship("ProductImage", backref="product", lazy=True, cascade="all, delete-orphan",
                              order_by="ProductImage.sort_order")
    reviews = db.relationship("Review", backref="product", lazy=True, cascade="all, delete-orphan")

    @property
    def discount_percent(self):
        if self.old_price and self.old_price > self.price:
            return round((1 - (self.price / self.old_price)) * 100)
        return 0

    @property
    def average_rating(self):
        if not self.reviews:
            return 0
        return round(sum(r.rating for r in self.reviews) / len(self.reviews), 1)

    @property
    def main_image(self):
        return self.images[0].filename if self.images else None


class ProductImage(db.Model):
    __tablename__ = "product_images"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    sort_order = db.Column(db.Integer, default=0)


class Review(db.Model):
    __tablename__ = "reviews"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Favorite(db.Model):
    __tablename__ = "favorites"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)

    product = db.relationship("Product")

    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_user_product_fav"),)


class CartItem(db.Model):
    __tablename__ = "cart_items"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    quantity = db.Column(db.Integer, default=1, nullable=False)

    product = db.relationship("Product")

    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_user_product_cart"),)

    @property
    def subtotal(self):
        return Decimal(self.product.price) * self.quantity


ORDER_STATUSES = [
    ("awaiting_payment", "Интизори пардохт"),
    ("awaiting_confirmation", "Интизори тасдиқи админ"),
    ("confirmed", "Қабул шуд"),
    ("preparing", "Омода мешавад"),
    ("shipped", "Фиристода шуд"),
    ("delivered", "Дастрас гардид"),
    ("rejected", "Бекор шуд"),
]

ORDER_STATUS_COLORS = {
    "awaiting_payment": "#a8a29e",
    "awaiting_confirmation": "#d97706",
    "confirmed": "#16a34a",
    "preparing": "#2563eb",
    "shipped": "#7c3aed",
    "delivered": "#059669",
    "rejected": "#dc2626",
}


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    customer_name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(30), nullable=False)
    city = db.Column(db.String(100), nullable=False)
    street_address = db.Column(db.String(255), nullable=False)
    comment = db.Column(db.String(255))

    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(30), default="awaiting_payment", nullable=False)
    receipt_filename = db.Column(db.String(255))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship("OrderItem", backref="order", lazy=True, cascade="all, delete-orphan")

    @property
    def status_label(self):
        return dict(ORDER_STATUSES).get(self.status, self.status)

    @property
    def status_color(self):
        return ORDER_STATUS_COLORS.get(self.status, "#a8a29e")


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    product_name = db.Column(db.String(200), nullable=False)  # snapshot
    price = db.Column(db.Numeric(10, 2), nullable=False)  # snapshot
    quantity = db.Column(db.Integer, nullable=False)

    product = db.relationship("Product")

    @property
    def subtotal(self):
        return Decimal(self.price) * self.quantity
