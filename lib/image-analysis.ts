// Image analysis utilities to detect blank areas in forms

interface BlankArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Component {
  pixels: number; // Number of pixels in the component
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  stdDev: number; // Standard deviation of grayscale values within bounds
}

// Grayscale calculation using luminance
const getGrayscale = (r: number, g: number, b: number): number => {
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

// Standard deviation calculation
const calculateStdDev = (
  data: Uint8ClampedArray,
  width: number,
  startX: number,
  startY: number,
  w: number,
  h: number
): number => {
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  const endX = Math.min(startX + w, width);
  const endY = Math.min(startY + h, data.length / (4 * width));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const i = (y * width + x) * 4;
      const gray = getGrayscale(data[i], data[i + 1], data[i + 2]);
      sum += gray;
      sumSq += gray * gray;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.sqrt(Math.max(0, variance)); // Ensure non-negative variance
};

export const detectBlankAreas = async (
  imageData: string
): Promise<BlankArea[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const canvasWidth = img.width;
      const canvasHeight = img.height;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); // Optimization hint

      if (!ctx) {
        resolve([]);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const data = imgData.data;
      const visited = new Uint8Array(canvasWidth * canvasHeight); // Track visited pixels

      const components: Component[] = [];
      const queue: [number, number][] = []; // Queue for flood fill [x, y]

      // --- Parameters (tune these based on your images) ---
      const brightnessThreshold = 235; // Pixels brighter than this are considered potential blank space
      const minPixelCount = 100; // Minimum number of pixels for a valid component
      const maxStdDev = 15; // Maximum standard deviation within the bounding box for a blank area
      const minAspectRatio = 0.2; // Minimum aspect ratio (width/height or height/width)
      const maxAspectRatio = 5.0; // Maximum aspect ratio
      // --- End Parameters ---

      for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
          const index = y * canvasWidth + x;
          const dataIndex = index * 4;

          if (visited[index]) continue; // Skip visited pixels

          const gray = getGrayscale(
            data[dataIndex],
            data[dataIndex + 1],
            data[dataIndex + 2]
          );

          if (gray >= brightnessThreshold) {
            // Start Flood Fill for a new component
            queue.push([x, y]);
            visited[index] = 1;

            let currentPixels = 0;
            let minX = x,
              minY = y,
              maxX = x,
              maxY = y;

            while (queue.length > 0) {
              const [cx, cy] = queue.shift()!;
              currentPixels++;

              // Update bounds
              minX = Math.min(minX, cx);
              minY = Math.min(minY, cy);
              maxX = Math.max(maxX, cx);
              maxY = Math.max(maxY, cy);

              // Check neighbors (4-connectivity)
              const neighbors = [
                [cx + 1, cy],
                [cx - 1, cy],
                [cx, cy + 1],
                [cx, cy - 1],
              ];

              for (const [nx, ny] of neighbors) {
                if (
                  nx >= 0 &&
                  nx < canvasWidth &&
                  ny >= 0 &&
                  ny < canvasHeight
                ) {
                  const neighborIndex = ny * canvasWidth + nx;
                  const neighborDataIndex = neighborIndex * 4;

                  if (!visited[neighborIndex]) {
                    const neighborGray = getGrayscale(
                      data[neighborDataIndex],
                      data[neighborDataIndex + 1],
                      data[neighborDataIndex + 2]
                    );
                    if (neighborGray >= brightnessThreshold) {
                      visited[neighborIndex] = 1;
                      queue.push([nx, ny]);
                    }
                  }
                }
              }
            }

            // --- Component Analysis ---
            if (currentPixels >= minPixelCount) {
              const compWidth = maxX - minX + 1;
              const compHeight = maxY - minY + 1;

              // Calculate standard deviation within the bounding box
              const stdDev = calculateStdDev(
                data,
                canvasWidth,
                minX,
                minY,
                compWidth,
                compHeight
              );

              // Aspect Ratio Check
              const aspectRatio = compWidth / compHeight;
              const validAspectRatio =
                (aspectRatio >= minAspectRatio &&
                  aspectRatio <= maxAspectRatio) ||
                (1 / aspectRatio >= minAspectRatio &&
                  1 / aspectRatio <= maxAspectRatio);

              if (stdDev <= maxStdDev && validAspectRatio) {
                components.push({
                  pixels: currentPixels,
                  minX: minX,
                  minY: minY,
                  maxX: maxX,
                  maxY: maxY,
                  stdDev: stdDev,
                });
              }
            }
          } else {
            visited[index] = 1; // Mark non-blank pixels as visited too
          }
        }
      }

      // --- Convert valid components to BlankArea format ---
      // Basic filtering / potential merging could happen here if needed,
      // but let's start without complex merging.

      const blankAreas: BlankArea[] = components.map((comp) => ({
        x: comp.minX,
        y: comp.minY,
        width: comp.maxX - comp.minX + 1,
        height: comp.maxY - comp.minY + 1,
      }));

      // Optional: Simple Overlap Merging (if needed)
      // This is basic; more sophisticated merging might be required
      let merged = true;
      while (merged) {
        merged = false;
        for (let i = 0; i < blankAreas.length; i++) {
          for (let j = i + 1; j < blankAreas.length; j++) {
            const a = blankAreas[i];
            const b = blankAreas[j];

            // Check for overlap
            if (
              a.x < b.x + b.width &&
              a.x + a.width > b.x &&
              a.y < b.y + b.height &&
              a.y + a.height > b.y
            ) {
              // Merge b into a
              const newX = Math.min(a.x, b.x);
              const newY = Math.min(a.y, b.y);
              const newW = Math.max(a.x + a.width, b.x + b.width) - newX;
              const newH = Math.max(a.y + a.height, b.y + b.height) - newY;

              a.x = newX;
              a.y = newY;
              a.width = newW;
              a.height = newH;

              // Remove b and restart check
              blankAreas.splice(j, 1);
              merged = true;
              break; // Restart inner loop
            }
          }
          if (merged) break; // Restart outer loop
        }
      }

      resolve(blankAreas);
    };

    img.onerror = () => {
      console.error("Failed to load image for analysis.");
      resolve([]);
    };

    img.src = imageData;
  });
};

