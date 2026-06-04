import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Look for db initialization
# const db = new Database(path.join(__dirname, 'data/monitoring.db'));
# ...
# db.prepare(CREATE TABLE IF NOT EXISTS model_performance (...)).run();

# We can append an update query right after the table creations.
seed_sql = """
// Force update model performance to match actual training metrics
try {
    const perfExists = db.prepare('SELECT COUNT(*) as count FROM model_performance').get();
    if (perfExists.count === 0) {
        db.prepare(INSERT INTO model_performance (id, rmse, mae, r_squared, accuracy, training_date, model_version, notes) 
                    VALUES (1, 17.936, 13.883, 0.031, 3.1, date('now'), 'BiLSTM-v3.0', 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.')).run();
    } else {
        db.prepare(UPDATE model_performance 
                    SET rmse = 17.936, mae = 13.883, r_squared = 0.031, accuracy = 3.1, 
                        model_version = 'BiLSTM-v3.0', notes = 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.' 
                    WHERE id = (SELECT id FROM model_performance ORDER BY training_date DESC LIMIT 1)).run();
    }
    console.log('[Database] Seeded actual model performance metrics.');
} catch (e) {
    console.error('[Database] Failed to seed performance metrics:', e.message);
}
"""

# Let's insert this after the create table statements.
# I will find the end of the DB init block.
if 'CREATE TABLE IF NOT EXISTS model_performance' in content:
    # Just append it before the app.use middlewares
    content = content.replace("app.use(cors());", seed_sql + "\napp.use(cors());")
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("server.js patched to update DB on startup.")
else:
    print("Could not find insertion point.")
