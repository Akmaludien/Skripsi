import os
import subprocess
import sys

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

    # Resolve tensorflowjs_converter: prefer same Python env, then system PATH
    python_dir = os.path.dirname(sys.executable)
    candidates = [
        os.path.join(python_dir, 'tensorflowjs_converter'),
        os.path.join(python_dir, 'tensorflowjs_converter.exe'),
        os.path.join(python_dir, 'Scripts', 'tensorflowjs_converter.exe'),
        'tensorflowjs_converter',
    ]
    tfjs_bin = next((c for c in candidates if os.path.exists(c)), 'tensorflowjs_converter')

    models = [
        ('AWS',  aws_h5,  aws_out),
        ('AAWS', aaws_h5, aaws_out),
        ('ARG',  arg_h5,  arg_out),
    ]

    for name, h5_path, out_dir in models:
        if not os.path.exists(h5_path):
            print(f"[SKIP] {name} model not found at {h5_path}")
            continue
        try:
            print(f"Converting {name} model...")
            subprocess.run(
                [tfjs_bin, '--input_format=keras', h5_path, out_dir],
                check=True
            )
            print(f"{name} model converted successfully.")
        except Exception as e:
            print(f"[WARN] Failed to convert {name}: {e}")

if __name__ == '__main__':
    convert()
