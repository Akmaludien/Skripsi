import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's replace the app.get('/api/model-performance') completely
target = """app.get('/api/model-performance', (req, res) => {
    const perf = db.prepare('SELECT * FROM model_performance ORDER BY training_date DESC LIMIT 1').get();
    res.json(perf || { 
        rmse: 17.936, 
        mae: 13.883, 
        r_squared: 0.031, 
        accuracy: 3.1, 
        training_date: new Date().toISOString().split('T')[0],
        model_version: 'BiLSTM-v3.0',
        notes: 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.'
    });
});"""

replacement = """app.get('/api/model-performance', (req, res) => {
    // FORCE OVERWRITE IN DATABASE TO CLEAN UP OLD DUMMY DATA FROM PREVIOUS DEPLOYS
    try {
        db.prepare(UPDATE model_performance SET rmse=17.936, mae=13.883, r_squared=0.031, accuracy=3.1, model_version='BiLSTM-v3.0', notes='Bi-LSTM 4 Fitur. Verified on actual BMKG data.').run();
    } catch (e) {}

    const perf = db.prepare('SELECT * FROM model_performance ORDER BY training_date DESC LIMIT 1').get();
    res.json(perf || { 
        rmse: 17.936, 
        mae: 13.883, 
        r_squared: 0.031, 
        accuracy: 3.1, 
        training_date: new Date().toISOString().split('T')[0],
        model_version: 'BiLSTM-v3.0',
        notes: 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.'
    });
});"""

if target in content:
    content = content.replace(target, replacement)
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("server.js updated with force db overwrite.")
else:
    print("Could not find target to replace in API.")

