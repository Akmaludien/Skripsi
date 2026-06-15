const tf = require('@tensorflow/tfjs');
const fs = require('fs');

async function checkWeights() {
    try {
        const modelJson = JSON.parse(fs.readFileSync('models/arg/tfjs/model.json', 'utf8'));
        const model = await tf.models.modelFromJSON(modelJson.modelTopology);
        console.log("EXPECTED WEIGHT NAMES BY TFJS:");
        model.weights.forEach(w => console.log(w.name));
    } catch (e) {
        console.error(e);
    }
}
checkWeights();
