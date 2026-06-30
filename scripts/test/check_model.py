import os
import pickle

os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
import tensorflow as tf

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def check_model_scaler(name, model_path, scaler_path, is_split=False):
    print(f"--- Checking {name} ---")
    try:
        model = tf.keras.models.load_model(os.path.join(ROOT_DIR, model_path), compile=False)
        print(f"Model Input: {model.input_shape}, Output: {model.output_shape}")
    except Exception as e:
        print(f"Model Error: {e}")
        
    try:
        if is_split:
            with open(os.path.join(ROOT_DIR, scaler_path[0]), 'rb') as f:
                scaler_X = pickle.load(f)
                print(f"Scaler X: {type(scaler_X)}")
                if hasattr(scaler_X, 'data_min_'): print(f"data_min_: {scaler_X.data_min_}")
            with open(os.path.join(ROOT_DIR, scaler_path[1]), 'rb') as f:
                scaler_y = pickle.load(f)
                print(f"Scaler y: {type(scaler_y)}")
        else:
            with open(os.path.join(ROOT_DIR, scaler_path), 'rb') as f:
                scaler = pickle.load(f)
                print(f"Scaler: {type(scaler)}")
                if hasattr(scaler, 'data_min_'): print(f"data_min_: {scaler.data_min_}")
                if hasattr(scaler, 'center_'): print(f"center_: {scaler.center_}")
    except Exception as e:
        print(f"Scaler Error: {e}")

check_model_scaler("AWS", "models/aws/model_aws.h5", ["models/aws/scaler_X.pkl", "models/aws/scaler_y.pkl"], is_split=True)
check_model_scaler("AAWS", "models/aaws/aaws_model.keras", ["models/aaws/scaler_X.pkl", "models/aaws/scaler_y.pkl"], is_split=True)
check_model_scaler("ARG", "models/arg/model_arg_final.h5", "models/arg/scaler.pkl", is_split=False)
