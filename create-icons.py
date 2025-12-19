from PIL import Image
import os

# Create icon directory if it doesn't exist
os.makedirs('public/icons', exist_ok=True)

# Load the 192x192 icon as base
base_icon = Image.open('public/icon-192.png')

# Create different sizes by resizing
sizes = [16, 32, 48, 128]
for size in sizes:
    resized = base_icon.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(f'public/icons/icon-{size}.png')
    print(f'✓ Created public/icons/icon-{size}.png')

# Also create a 64x64 for good measure
resized_64 = base_icon.resize((64, 64), Image.Resampling.LANCZOS)
resized_64.save('public/icons/icon-64.png')
print('✓ Created public/icons/icon-64.png')
