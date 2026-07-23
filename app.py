import os
from flask import Flask, render_template
from flask_login import current_user

from config import Config
from extensions import db, login_manager, csrf
from models import User, CartItem, Favorite


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)

    from routes.main import bp as main_bp
    from routes.auth import bp as auth_bp
    from routes.cart import bp as cart_bp
    from routes.orders import bp as orders_bp
    from routes.admin import bp as admin_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(cart_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(admin_bp)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    @app.context_processor
    def inject_globals():
        cart_count = 0
        favorites_count = 0
        if current_user.is_authenticated:
            cart_count = sum(i.quantity for i in CartItem.query.filter_by(user_id=current_user.id).all())
            favorites_count = Favorite.query.filter_by(user_id=current_user.id).count()
        return dict(
            store_name=app.config["STORE_NAME"],
            cart_count=cart_count,
            favorites_count=favorites_count,
        )

    @app.errorhandler(404)
    def not_found(e):
        return render_template("errors/404.html"), 404

    @app.errorhandler(403)
    def forbidden(e):
        return render_template("errors/403.html"), 403

    with app.app_context():
        db.create_all()

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
