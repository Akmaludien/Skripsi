import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the specific hardcoded dummy values in the INSERT statement
# It was: .run(1.909, 1.573, 0.921, 92.1, '2026-05-23', 'BiLSTM-v2.0', 'Bi-LSTM (128-64-32) log-transform. Verified on training data.');
pattern = r"\.run\(1\.909, 1\.573, 0\.921, 92\.1, '[^']+', 'BiLSTM-v2\.0', '[^']+'\);"
replacement = ".run(17.936, 13.883, 0.031, 3.1, new Date().toISOString().split('T')[0], 'BiLSTM-v3.0', 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.');"

if re.search(pattern, content):
    content = re.sub(pattern, replacement, content)
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("server.js updated successfully (init metrics with regex).")
else:
    print("Regex could not find target to replace in init metrics.")
