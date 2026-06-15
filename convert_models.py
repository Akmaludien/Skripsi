import os
import subprocess

def convert():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    aws_h5 = os.path.join(base_dir, 'models', 'aws_aaws', 'model_aws.h5')
    aws_out = os.path.join(base_dir, 'models', 'aws_aaws', 'tfjs')
    arg_h5 = os.path.join(base_dir, 'models', 'arg', 'model_arg.h5')
    arg_out = os.path.join(base_dir, 'models', 'arg', 'tfjs')

    if not os.path.exists(aws_out):
        os.makedirs(aws_out)
    if not os.path.exists(arg_out):
        os.makedirs(arg_out)

    try:
        print("Converting AWS model...")
        subprocess.run(["tensorflowjs_converter", "--input_format=keras", aws_h5, aws_out], check=True)
        print("AWS model converted successfully.")
        
        print("Converting ARG model...")
        subprocess.run(["tensorflowjs_converter", "--input_format=keras", arg_h5, arg_out], check=True)
        print("ARG model converted successfully.")
    except Exception as e:
        print(f"Error during conversion: {e}")

if __name__ == '__main__':
    convert()
