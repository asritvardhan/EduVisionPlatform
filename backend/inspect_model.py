"""
Run this once from your backend folder:
  python inspect_model.py

It will print the raw model config so we can see exactly what needs fixing.
"""
import h5py, json, os

video_path = os.path.join("models", "resnet_bilstm_attention_48_2.h5")

with h5py.File(video_path, 'r') as f:
    cfg = f.attrs.get('model_config', None)
    if isinstance(cfg, bytes):
        cfg = cfg.decode('utf-8')

data = json.loads(cfg)

# Pretty print just the layers config (first 3 layers + node connections)
layers = data.get('config', {}).get('layers', [])
print(f"\nTotal layers: {len(layers)}\n")

for i, l in enumerate(layers[:5]):
    print(f"--- Layer {i}: {l.get('class_name')} ---")
    print(json.dumps(l.get('config', {}), indent=2)[:400])
    print()

# Show the inbound_nodes structure
print("\n=== INBOUND NODES (first 5 layers) ===")
for i, l in enumerate(layers[:5]):
    nodes = l.get('inbound_nodes', [])
    if nodes:
        print(f"Layer {i} ({l['class_name']}): {json.dumps(nodes)[:300]}")

# Show full raw config snippet around 'input_data'
print("\n=== RAW CONFIG (first 2000 chars) ===")
print(cfg[:2000])
