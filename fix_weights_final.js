const fs = require('fs');

const fixWeights = (path) => {
    if (!fs.existsSync(path)) return;
    let data = fs.readFileSync(path, 'utf8');
    let json = JSON.parse(data);
    
    if (json.weightsManifest && json.weightsManifest[0] && json.weightsManifest[0].weights) {
        json.weightsManifest[0].weights.forEach(w => {
            // Fix AWS model names
            if (w.name.includes('bidirectional_5/forward_lstm_5/')) {
                w.name = w.name.replace('bidirectional_5/forward_lstm_5/', 'bidirectional_5/forward_forward_lstm_5/');
            }
            if (w.name.includes('bidirectional_5/backward_lstm_5/')) {
                w.name = w.name.replace('bidirectional_5/backward_lstm_5/', 'bidirectional_5/backward_forward_lstm_5/');
            }
            // Fix ARG model names
            if (w.name.includes('bidirectional_4/forward_lstm_4/')) {
                w.name = w.name.replace('bidirectional_4/forward_lstm_4/', 'bidirectional_4/forward_forward_lstm_4/');
            }
            if (w.name.includes('bidirectional_4/backward_lstm_4/')) {
                w.name = w.name.replace('bidirectional_4/backward_lstm_4/', 'bidirectional_4/backward_forward_lstm_4/');
            }
        });
        fs.writeFileSync(path, JSON.stringify(json));
        console.log('Fixed weights in ' + path);
    }
};

fixWeights('models/aws/tfjs/model.json');
fixWeights('models/aaws/tfjs/model.json');
fixWeights('models/arg/tfjs/model.json');
