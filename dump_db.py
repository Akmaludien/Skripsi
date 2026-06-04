import sqlite3

conn = sqlite3.connect('data/monitoring.db')
c = conn.cursor()
c.execute("SELECT * FROM model_performance")
rows = c.fetchall()

for row in rows:
    print(row)

conn.close()
