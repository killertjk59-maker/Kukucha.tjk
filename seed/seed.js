const { db, q, hashPassword } = require('../db.js');
const { categories, products, sizeMap } = require('./seed-data.js');

function seed() {
  const count = q.statsProducts.get().c;
  if (count > 0) return;

  const tx = db.transaction(() => {
    // users
    q.createUser.run('Администратор', '+992 900 000 000', 'admin', hashPassword('admin123'), 'admin');
    q.createUser.run('Малика Қодирова', '+992 927 111 222', 'malika', hashPassword('malika123'), 'customer');

    // categories
    const catIds = {};
    for (const c of categories) {
      q.insertCategory.run(c.name, c.icon, c.sort_order, 1);
      catIds[c.name] = db.prepare('SELECT last_insert_rowid() id').get().id;
    }

    // products
    for (const [cat, title, desc, price, old_price, image, rating, has_sizes, stock, featured] of products) {
      q.insertProduct.run(catIds[cat], title, desc, price, old_price, image, rating, 1 + Math.floor(Math.random() * 40), has_sizes, stock, featured, 1);
      const pid = db.prepare('SELECT last_insert_rowid() id').get().id;
      if (has_sizes && sizeMap[title]) {
        for (const [size, sstock] of sizeMap[title]) {
          q.insertSize.run(pid, size, sstock);
        }
      }
    }
  });
  tx();
  console.log('✅ Kukucha seeded');
}

module.exports = { seed };
