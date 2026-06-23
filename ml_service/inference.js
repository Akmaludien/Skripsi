const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');

let modelAWS = null;
let modelAAWS = null;
let modelARG = null;
let scalerAWS = null;
let scalerAAWS = null;
let scalerARG = null;

class LocalFileIO {
    constructor(filePath) { this.filePath = filePath.replace('file://', ''); }
    async load() {
        const modelJSON = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        const dir = path.dirname(this.filePath);
        const weightFile = modelJSON.weightsManifest[0].paths[0];
        const weightData = new Uint8Array(fs.readFileSync(path.join(dir, weightFile))).buffer;
        return {
            modelTopology: modelJSON.modelTopology,
            weightSpecs: modelJSON.weightsManifest[0].weights,
            weightData: weightData
        };
    }
}

async function initModels() {
    try {
        console.log("[ML Inference] Starting model initialization...");
        const awsModelPath = path.join(__dirname, '../models/aws/tfjs/model.json');
        const aawsModelPath = path.join(__dirname, '../models/aaws/tfjs/model.json');
        const argModelPath = path.join(__dirname, '../models/arg/tfjs/model.json');
        const awsScalerPath = path.join(__dirname, '../models/aws/scaler_aws.json');
        const aawsScalerPath = path.join(__dirname, '../models/aaws/scaler_aaws.json');
        const argScalerPath = path.join(__dirname, '../models/arg/scaler_arg.json');

        if (fs.existsSync(awsModelPath)) {
            modelAWS = await tf.loadLayersModel(new LocalFileIO(awsModelPath));
            console.log("[ML Inference] Model AWS loaded successfully.");
        } else {
            console.log(`[ML Info] TFJS model not used (AWS predictions handled by Python): ${awsModelPath}`);
        }

        if (fs.existsSync(aawsModelPath)) {
            modelAAWS = await tf.loadLayersModel(new LocalFileIO(aawsModelPath));
            console.log("[ML Inference] Model AAWS loaded successfully.");
        } else {
            console.log(`[ML Info] TFJS model not used (AAWS predictions handled by Python): ${aawsModelPath}`);
        }

        if (fs.existsSync(argModelPath)) {
            modelARG = await tf.loadLayersModel(new LocalFileIO(argModelPath));
            console.log("[ML Inference] Model ARG loaded successfully.");
        } else {
            console.log(`[ML Info] TFJS model not used (ARG predictions handled by Python): ${argModelPath}`);
        }

        if (fs.existsSync(awsScalerPath)) {
            scalerAWS = JSON.parse(fs.readFileSync(awsScalerPath, 'utf8'));
        }
        
        if (fs.existsSync(aawsScalerPath)) {
            scalerAAWS = JSON.parse(fs.readFileSync(aawsScalerPath, 'utf8'));
        }
        
        if (fs.existsSync(argScalerPath)) {
            scalerARG = JSON.parse(fs.readFileSync(argScalerPath, 'utf8'));
        }

        console.log("[ML Inference] Initialization complete.");
    } catch (err) {
        console.error("[ML Error] Failed to initialize models:", err.message);
    }
}

function fillNullValues(data, defaults) {
    for (let i = 0; i < data.length; i++) {
        Object.keys(defaults).forEach(key => {
            if (data[i][key] === null || data[i][key] === undefined || isNaN(data[i][key])) {
                data[i][key] = (i === 0) ? defaults[key] : data[i - 1][key];
            }
        });
    }
    return data;
}

function scaleValue(val, min, max) {
    if (max - min === 0) return 0;
    return (val - min) / (max - min);
}

function inverseScaleValue(val, min, max) {
    return (val * (max - min)) + min;
}

async function predictWeather(stationType, dataHistoris) {
    try {
        if (!dataHistoris || dataHistoris.length < 14) {
            console.warn(`[ML Warn] Data historis kurang dari 14 hari (${dataHistoris?.length || 0} rows) untuk ${stationType}. Prediksi dibatalkan.`);
            return null;
        }

        let inputData = dataHistoris.slice(-14);

        const defaults = (stationType === 'AWS' || stationType === 'AAWS')
            ? { RR_MA3: 0, RR_lag1: 0, TAVG: 25, RH_AVG: 80 }
            : { RR_MA3: 0, RR_lag1: 0 };
        
        inputData = fillNullValues(inputData, defaults);

        let currentModel = modelAWS;
        let currentScaler = scalerAWS;
        let isArg = (stationType === 'ARG');
        let isAaws = (stationType === 'AAWS');

        if (isArg) {
            currentModel = modelARG;
            currentScaler = scalerARG;
        } else if (isAaws) {
            currentModel = modelAAWS;
            currentScaler = scalerAAWS;
        }

        if (!currentModel || !currentScaler) {
            throw new Error(`Model atau scaler untuk ${stationType} belum ter-load.`);
        }

        const features = (stationType === 'AWS' || stationType === 'AAWS') 
            ? ['RR_MA3', 'RR_lag1', 'TAVG', 'RH_AVG']
            : ['RR_MA3', 'RR_lag1'];

        const predictionScaled = tf.tidy(() => {
            const scaledArray = inputData.map(row => {
                return features.map((feat, index) => {
                    const min = scaler.data_min_[index];
                    const max = scaler.data_max_[index];
                    return scaleValue(row[feat], min, max);
                });
            });

            const tensorInput = tf.tensor3d([scaledArray]);
            return model.predict(tensorInput).arraySync()[0][0]; 
        });

        const targetMin = scaler.data_min_[0];
        const targetMax = scaler.data_max_[0];
        
        let finalRainfall = inverseScaleValue(predictionScaled, targetMin, targetMax);
        
        return Math.max(0, finalRainfall); 

    } catch (error) {
        console.error(`[ML Error] Kegagalan pada predictWeather (${stationType}):`, error.message);
        return null;
    }
}

module.exports = { initModels, predictWeather };
