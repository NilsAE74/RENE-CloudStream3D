"""
Lager LAS/LAZ-testfiler for test/parser.test.js (issue #15).
Krever laspy med lazrs: pip install "laspy[lazrs]" numpy
Kjør fra repo-roten: python test/data/make_las_fixtures.py

Samme punkter skrives som LAS og LAZ, så testene kan sjekke at LAZ gir identisk
resultat. Koordinatene er deterministiske (rutenett + sinus), så testene kan regne
dem ut på nytt. lazrs er en uavhengig LAZ-koder (Rust), ikke laz-perf.
"""
import os
import numpy as np
import laspy

HERE = os.path.dirname(os.path.abspath(__file__))


def grid_points(n, step=0.5, cols=100):
    i = np.arange(n)
    x = 500000.0 + (i % cols) * step + 0.123
    y = 6650000.0 + (i // cols) * step + 0.456
    z = 50.0 + 10.0 * np.sin(x / 7.0) * np.cos(y / 11.0)
    return x, y, z


def write(name, point_format, version, n, extra_bytes=False, laz_only=False):
    header = laspy.LasHeader(point_format=point_format, version=version)
    header.scales = np.array([0.001, 0.001, 0.001])
    header.offsets = np.array([500000.0, 6650000.0, 0.0])
    if extra_bytes:
        header.add_extra_dim(laspy.ExtraBytesParams(name="quality", type=np.uint16))
        header.add_extra_dim(laspy.ExtraBytesParams(name="range", type=np.float32))
    las = laspy.LasData(header)
    x, y, z = grid_points(n)
    las.x, las.y, las.z = x, y, z
    las.classification = np.where(np.arange(n) % 3 == 0, 2, 1).astype(np.uint8)
    if extra_bytes:
        las.quality = (np.arange(n) % 65535).astype(np.uint16)
        las.range = np.linspace(0, 100, n).astype(np.float32)
    exts = ['.laz'] if laz_only else ['.las', '.laz']
    for ext in exts:
        las.write(os.path.join(HERE, name + ext), laz_backend=laspy.LazBackend.Lazrs if ext == '.laz' else None)


write('pf1_v12', point_format=1, version='1.2', n=1000)
write('pf7_v14_extra', point_format=7, version='1.4', n=1000, extra_bytes=True)
# Flere chunks (lazrs: 50.000 punkter per chunk)
write('pf0_v12_chunks', point_format=0, version='1.2', n=60000, laz_only=True)
