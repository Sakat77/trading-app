import sys
import json
import ctypes
import os

dll_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'BAMSBUNG.dll')

def call_fast_singular(data, length, window, components):
    try:
        dll = ctypes.CDLL(dll_path)
    except Exception:
        dll = ctypes.WinDLL(dll_path)

    fast_singular = dll.fastSingular
    fast_singular.restype  = None
    fast_singular.argtypes = [
        ctypes.POINTER(ctypes.c_double),
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_double),
    ]

    arr_in  = (ctypes.c_double * length)(*data[:length])
    arr_out = (ctypes.c_double * length)()
    fast_singular(arr_in, length, window, components, arr_out)
    return list(arr_out)

payload = json.loads(sys.stdin.read())
result  = call_fast_singular(
    payload['data'],
    payload['length'],
    payload['window'],
    payload['components'],
)
print(json.dumps(result))
