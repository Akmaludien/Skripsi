import os
import subprocess

def convert():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    aws_h5 = os.path.join(base_dir, 'models', 'aws', 'model_aws.h5')
    aws_out = os.path.join(base_dir, 'models', 'aws', 'tfjs')
    aaws_h5 = os.path.join(base_dir, 'models', 'aaws', 'model_aaws.h5')
    aaws_out = os.path.join(base_dir, 'models', 'aaws', 'tfjs')
    arg_h5 = os.path.join(base_dir, 'models', 'arg', 'model_arg.h5')
    arg_out = os.path.join(base_dir, 'models', 'arg', 'tfjs')

    for out_dir in [aws_out, aaws_out, arg_out]:
        if not os.path.exists(out_dir):
            os.makedirs(out_dir)

    tfjs_bin = os.path.join(base_dir, '.venv', 'Scripts', 'tensorflowjs_converter.exe')
    if not os.path.exists(tfjs_bin):
        tfjs_bin = "tensorflowjs_converter" # fallback to path

    try:
        print("Converting AWS model...")
        subprocess.run([tfjs_bin, "--input_format=keras", aws_h5, aws_out], check=True)
        print("AWS model converted successfully.")
        
        print("Converting AAWS model...")
        subprocess.run([tfjs_bin, "--input_format=keras", aaws_h5, aaws_out], check=True)
        print("AAWS model converted successfully.")
        
        print("Converting ARG model...")
        subprocess.run([tfjs_bin, "--input_format=keras", arg_h5, arg_out], check=True)
        print("ARG model converted successfully.")
    except Exception as e:
        print(f"Error during conversion: {e}")

if __name__ == '__main__':
    convert()
