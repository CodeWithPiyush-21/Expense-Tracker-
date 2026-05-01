import sqlite3
try:
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, color TEXT)")
    
    # Try all migrations again
    try: c.execute("ALTER TABLE expenses ADD COLUMN date TEXT")
    except: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN item_name TEXT")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN monthly_budget REAL DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'")
    except: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN is_subscription INTEGER DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE expenses ADD COLUMN receipt_path TEXT")
    except: pass

    conn.commit()
    print("Database migrations applied.")
except Exception as e:
    print(e)
