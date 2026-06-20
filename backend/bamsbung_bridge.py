import subprocess
import json
import numpy as np
import os

_HERE         = os.path.dirname(os.path.abspath(__file__))
BRIDGE_SCRIPT = os.path.join(_HERE, 'bamsbung_32bridge.py')
PY32_EXE      = os.path.join(_HERE, 'py32', 'python.exe')

def call_ssa_dll(data_array, length, window, components):
    payload = json.dumps({
        'data':       data_array.tolist(),
        'length':     length,
        'window':     window,
        'components': components,
    })
    result = subprocess.run(
        [PY32_EXE, BRIDGE_SCRIPT],
        input=payload,
        capture_output=True,
        text=True,
        timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"Bridge error: {result.stderr}")
    return np.array(json.loads(result.stdout))
