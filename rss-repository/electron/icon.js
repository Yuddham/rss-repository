// Builds a simple filled-circle icon as a raw BGRA pixel buffer, so no
// external .ico/.png asset or image library is needed at runtime.
function buildIconBuffer(size = 32, [r, g, b] = [37, 99, 235]) {
  const buffer = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const inside = dx * dx + dy * dy <= radius * radius;
      const offset = (y * size + x) * 4;
      if (inside) {
        buffer[offset] = b; // B
        buffer[offset + 1] = g; // G
        buffer[offset + 2] = r; // R
        buffer[offset + 3] = 255; // A
      } else {
        buffer[offset] = 0;
        buffer[offset + 1] = 0;
        buffer[offset + 2] = 0;
        buffer[offset + 3] = 0;
      }
    }
  }
  return buffer;
}

module.exports = { buildIconBuffer };
