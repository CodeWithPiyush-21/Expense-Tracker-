import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import sqlite3
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "secret123"

# File Upload Configuration
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# DB setup
def init_db():
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            password TEXT,
            monthly_budget REAL DEFAULT 0
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT,
            color TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,
            category TEXT,
            item_name TEXT,
            date TEXT,
            month TEXT,
            year TEXT,
            type TEXT DEFAULT 'expense',
            is_subscription INTEGER DEFAULT 0,
            receipt_path TEXT
        )
    ''')
    
    # Migrations for existing DB
    try: c.execute("ALTER TABLE expenses ADD COLUMN user_id INTEGER")
    except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN date TEXT")
    except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN item_name TEXT")
    except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE users ADD COLUMN monthly_budget REAL DEFAULT 0")
    except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'")
    except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN is_subscription INTEGER DEFAULT 0")
    except sqlite3.OperationalError: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN receipt_path TEXT")
    except sqlite3.OperationalError: pass

    conn.commit()
    conn.close()

init_db()

# --- Page Routes ---

@app.route('/')
def root():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('root'))
    return render_template('index.html')


# --- Auth Routes ---

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()

    c.execute("SELECT * FROM users WHERE username=?", (data['username'],))
    if c.fetchone():
        conn.close()
        return jsonify({"msg": "Username already exists", "success": False})

    c.execute("INSERT INTO users (username, password) VALUES (?, ?)",
              (data['username'], data['password']))

    conn.commit()
    conn.close()
    return jsonify({"msg": "User created successfully", "success": True})


@app.route('/login', methods=['POST'])
def login():
    data = request.json
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()

    c.execute("SELECT * FROM users WHERE username=? AND password=?",
              (data['username'], data['password']))

    user = c.fetchone()
    conn.close()

    if user:
        session['user_id'] = user[0]
        session['username'] = user[1]
        return jsonify({"msg": "Login success", "success": True, "username": user[1]})
    return jsonify({"msg": "Invalid credentials", "success": False})


@app.route('/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    return jsonify({"msg": "Logged out", "success": True})


@app.route('/check_session', methods=['GET'])
def check_session():
    if 'user_id' in session:
        conn = sqlite3.connect('expenses.db')
        c = conn.cursor()
        c.execute("SELECT monthly_budget FROM users WHERE id=?", (session['user_id'],))
        res = c.fetchone()
        budget = res[0] if res else 0
        conn.close()
        return jsonify({"logged_in": True, "username": session.get('username'), "budget": budget})
    return jsonify({"logged_in": False})


@app.route('/update_budget', methods=['POST'])
def update_budget():
    if 'user_id' not in session:
        return jsonify({"msg": "Not logged in"}), 401

    data = request.json
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()
    c.execute("UPDATE users SET monthly_budget=? WHERE id=?", (data['budget'], session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"msg": "Budget updated", "success": True})


# --- Categories Routes ---

@app.route('/add_category', methods=['POST'])
def add_category():
    if 'user_id' not in session:
        return jsonify({"msg": "Not logged in"}), 401

    data = request.json
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()
    c.execute("INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)",
              (session['user_id'], data['name'], data['color']))
    conn.commit()
    conn.close()
    return jsonify({"msg": "Category added", "success": True})


@app.route('/get_categories', methods=['GET'])
def get_categories():
    if 'user_id' not in session:
        return jsonify([])

    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()
    c.execute("SELECT id, name, color FROM categories WHERE user_id=?", (session['user_id'],))
    rows = c.fetchall()
    conn.close()

    return jsonify([
        {"id": r[0], "name": r[1], "color": r[2]}
        for r in rows
    ])


@app.route('/delete_category/<int:id>', methods=['DELETE'])
def delete_category(id):
    if 'user_id' not in session:
        return jsonify({"msg": "Not logged in"}), 401

    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()
    c.execute("DELETE FROM categories WHERE id=? AND user_id=?", (id, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"msg": "Deleted successfully", "success": True})


# --- Expense/Income Routes ---

@app.route('/add', methods=['POST'])
def add():
    if 'user_id' not in session:
        return jsonify({"msg": "Not logged in"}), 401

    # Handle FormData
    amount = request.form.get('amount')
    category = request.form.get('category')
    item_name = request.form.get('item_name', '')
    date = request.form.get('date', '')
    month = request.form.get('month')
    year = request.form.get('year')
    type_val = request.form.get('type', 'expense')
    is_subscription = int(request.form.get('is_subscription', 0))

    receipt_path = None
    if 'receipt' in request.files:
        file = request.files['receipt']
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            # Add user_id to avoid collisions
            unique_filename = f"{session['user_id']}_{filename}"
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
            receipt_path = f"/static/uploads/{unique_filename}"

    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()

    c.execute('''INSERT INTO expenses 
                 (user_id, amount, category, item_name, date, month, year, type, is_subscription, receipt_path) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (session['user_id'], amount, category, item_name, date, month, year, type_val, is_subscription, receipt_path))

    conn.commit()
    conn.close()
    return jsonify({"msg": "Added successfully", "success": True})


@app.route('/get')
def get():
    if 'user_id' not in session:
        return jsonify([])

    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()

    c.execute("SELECT id, amount, category, date, month, year, item_name, type, is_subscription, receipt_path FROM expenses WHERE user_id=?", (session['user_id'],))
    rows = c.fetchall()
    conn.close()

    return jsonify([
        {
            "id": r[0], "amount": r[1], "category": r[2], "date": r[3], 
            "month": r[4], "year": r[5], "item_name": r[6], "type": r[7], 
            "is_subscription": bool(r[8]), "receipt_path": r[9]
        }
        for r in rows
    ])


@app.route('/update/<int:id>', methods=['PUT'])
def update(id):
    if 'user_id' not in session:
        return jsonify({"msg": "Not logged in"}), 401

    data = request.json
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()

    c.execute("UPDATE expenses SET amount=?, category=?, item_name=? WHERE id=? AND user_id=?",
              (data['amount'], data['category'], data.get('item_name', ''), id, session['user_id']))

    conn.commit()
    conn.close()
    return jsonify({"msg": "Updated successfully", "success": True})


@app.route('/delete/<int:id>', methods=['DELETE'])
def delete(id):
    if 'user_id' not in session:
        return jsonify({"msg": "Not logged in"}), 401

    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()
    c.execute("DELETE FROM expenses WHERE id=? AND user_id=?", (id, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"msg": "Deleted successfully", "success": True})


@app.route('/analytics')
def analytics():
    if 'user_id' not in session:
        return jsonify({})

    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()

    # Only chart 'expense' types for now
    c.execute("SELECT amount, category, month, year FROM expenses WHERE user_id=? AND type='expense'",
              (session['user_id'],))
    data = c.fetchall()
    conn.close()

    monthly = {}
    yearly = {}
    category = {}

    for amt, cat, month, year in data:
        # Monthly trend
        key = f"{month}"
        monthly[key] = monthly.get(key, 0) + amt

        # Yearly
        yearly[year] = yearly.get(year, 0) + amt

        # Category
        category[cat] = category.get(cat, 0) + amt

    # Sort
    sorted_monthly = {k: monthly[k] for k in sorted(monthly.keys())}
    sorted_yearly = {k: yearly[k] for k in sorted(yearly.keys())}

    return jsonify({
        "monthly": sorted_monthly,
        "yearly": sorted_yearly,
        "category": category
    })

if __name__ == '__main__':
    app.run(debug=True)
