const fs = require('fs');

const fixWeights = (path) => {
    if (!fs.existsSync(path)) return;
    let data = fs.readFileSync(path, 'utf8');
    let json = JSON.parse(data);
    
    if (json.weightsManifest && json.weightsManifest[0] && json.weightsManifest[0].weights) {
        json.weightsManifest[0].weights.forEach(w => {
            // Remove 'lstm_cell/' prefix from LSTM weight names because TFJS expects them directly under the LSTM name
            w.name = w.name.replace(/\/lstm_cell\//g, '/');
        });
        fs.writeFileSync(path, JSON.stringify(json));
        console.log('Fixed weights in ' + path);
    }
};

fixWeights('models/aws/tfjs/model.json');
fixWeights('models/aaws/tfjs/model.json');
fixWeights('models/arg/tfjs/model.json');
