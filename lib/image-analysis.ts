// Image analysis utilities to detect blank areas in forms

interface BlankArea {
  x: number
  y: number
  width: number
  height: number
}

export const detectBlankAreas = async (imageData: string, highTolerance = false): Promise<BlankArea[]> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      // Create a canvas to analyze the image
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        resolve([])
        return
      }

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0)

      // Get image data for analysis
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imgData.data

      // Simple blank area detection algorithm
      // This is a basic implementation - in a real app, you'd want a more sophisticated algorithm

      // For this example, we'll consider areas with high brightness as blank areas
      const blankAreas: BlankArea[] = []
      const cellSize = highTolerance ? 15 : 20 // Smaller cell size for higher tolerance
      const threshold = highTolerance ? 220 : 240 // Lower threshold for higher tolerance

      for (let y = 0; y < canvas.height; y += cellSize) {
        for (let x = 0; x < canvas.width; x += cellSize) {
          const cellWidth = Math.min(cellSize, canvas.width - x)
          const cellHeight = Math.min(cellSize, canvas.height - y)

          // Check if this cell is blank (high brightness)
          let totalBrightness = 0
          let pixelCount = 0

          for (let cy = 0; cy < cellHeight; cy++) {
            for (let cx = 0; cx < cellWidth; cx++) {
              const pixelIndex = ((y + cy) * canvas.width + (x + cx)) * 4

              // Calculate brightness (simple average of RGB)
              const r = data[pixelIndex]
              const g = data[pixelIndex + 1]
              const b = data[pixelIndex + 2]
              const brightness = (r + g + b) / 3

              totalBrightness += brightness
              pixelCount++
            }
          }

          const avgBrightness = totalBrightness / pixelCount

          if (avgBrightness > threshold) {
            // This is a blank area

            // Try to merge with adjacent blank areas
            let merged = false
            for (let i = 0; i < blankAreas.length; i++) {
              const area = blankAreas[i]

              // Check if this cell is adjacent to an existing area
              // With higher tolerance, we allow for more merging
              const adjacencyThreshold = highTolerance ? cellSize * 2 : cellSize

              if (
                Math.abs(x - (area.x + area.width)) < adjacencyThreshold &&
                y >= area.y - adjacencyThreshold &&
                y <= area.y + area.height + adjacencyThreshold
              ) {
                // Merge with this area
                const newWidth = Math.max(area.x + area.width, x + cellWidth) - Math.min(area.x, x)
                const newHeight = Math.max(area.y + area.height, y + cellHeight) - Math.min(area.y, y)

                area.x = Math.min(area.x, x)
                area.y = Math.min(area.y, y)
                area.width = newWidth
                area.height = newHeight

                merged = true
                break
              }

              if (
                Math.abs(y - (area.y + area.height)) < adjacencyThreshold &&
                x >= area.x - adjacencyThreshold &&
                x <= area.x + area.width + adjacencyThreshold
              ) {
                // Merge with this area
                const newWidth = Math.max(area.x + area.width, x + cellWidth) - Math.min(area.x, x)
                const newHeight = Math.max(area.y + area.height, y + cellHeight) - Math.min(area.y, y)

                area.x = Math.min(area.x, x)
                area.y = Math.min(area.y, y)
                area.width = newWidth
                area.height = newHeight

                merged = true
                break
              }
            }

            if (!merged) {
              // Add as a new blank area
              blankAreas.push({
                x,
                y,
                width: cellWidth,
                height: cellHeight,
              })
            }
          }
        }
      }

      // Merge overlapping areas
      const mergedAreas: BlankArea[] = []

      for (const area of blankAreas) {
        let merged = false

        for (let i = 0; i < mergedAreas.length; i++) {
          const existingArea = mergedAreas[i]

          // Check if areas overlap or are very close (for higher tolerance)
          const overlapThreshold = highTolerance ? cellSize * 2 : 0

          if (
            area.x - overlapThreshold < existingArea.x + existingArea.width &&
            area.x + area.width + overlapThreshold > existingArea.x &&
            area.y - overlapThreshold < existingArea.y + existingArea.height &&
            area.y + area.height + overlapThreshold > existingArea.y
          ) {
            // Merge areas
            const newX = Math.min(area.x, existingArea.x)
            const newY = Math.min(area.y, existingArea.y)
            const newWidth = Math.max(area.x + area.width, existingArea.x + existingArea.width) - newX
            const newHeight = Math.max(area.y + area.height, existingArea.y + existingArea.height) - newY

            existingArea.x = newX
            existingArea.y = newY
            existingArea.width = newWidth
            existingArea.height = newHeight

            merged = true
            break
          }
        }

        if (!merged) {
          mergedAreas.push({ ...area })
        }
      }

      // Filter out very small areas
      const minSize = highTolerance ? cellSize : cellSize * 2
      const filteredAreas = mergedAreas.filter((area) => area.width >= minSize && area.height >= minSize)

      // Expand areas slightly for better detection
      if (highTolerance) {
        filteredAreas.forEach((area) => {
          area.x = Math.max(0, area.x - cellSize / 2)
          area.y = Math.max(0, area.y - cellSize / 2)
          area.width = Math.min(canvas.width - area.x, area.width + cellSize)
          area.height = Math.min(canvas.height - area.y, area.height + cellSize)
        })
      }

      resolve(filteredAreas)
    }

    img.src = imageData
  })
}

