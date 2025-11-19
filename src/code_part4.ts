              // Используем асинхронный метод getSizeAsync
              const imageSize = await figmaImage.getSizeAsync();
              const imageWidth = imageSize.width;
              const imageHeight = imageSize.height;
              
              // Масштаб = (размер слоя) / (размер элемента спрайта)
              const scaleFactor = Math.min(layerWidth, layerHeight) / spriteItemSize;
              
              // Новая ширина и высота изображения с учетом масштаба
              const scaledImageWidth = imageWidth * scaleFactor;
              const scaledImageHeight = imageHeight * scaleFactor;
              
              Logger.debug(`   📐 Спрайт: ${imageWidth}x${imageHeight} -> Элемент: ${spriteItemSize}px -> Слой: ${layerWidth}x${layerHeight} (Масштаб: ${scaleFactor.toFixed(2)})`);
              
              // Используем FILL с transform для точного позиционирования
              // В Figma transform матрица для заливки:
              // [scale_x, 0, offset_x]
              // [0, scale_y, offset_y]
              // offset в диапазоне 0..1 относительно размера изображения? Нет, относительно заливки.
              
              // В Figma API для ImagePaint:
              // scaleMode: 'FILL' - заполняет, обрезая лишнее
              // scaleMode: 'FIT' - помещает целиком
              // scaleMode: 'CROP' - позволяет задать transform
              
              // Для спрайтов идеально подходит CROP
              
              // Вычисляем матрицу трансформации для CROP
              // Нам нужно показать область размером spriteItemSize x spriteItemSize
              // которая находится по смещению bgOffsetX, bgOffsetY
              
              // Нормализуем смещения (они могут быть отрицательными в CSS)
              const targetX = -bgOffsetX; // Смещение X в CSS отрицательное -> положительная координата на картинке
              const targetY = -bgOffsetY; // Смещение Y в CSS отрицательное -> положительная координата на картинке
              
              // Вычисляем ширину и высоту видимой области в долях от всего изображения (0..1)
              // Мы хотим показать область размером spriteItemSize
              const visibleW = spriteItemSize / imageWidth;
              const visibleH = spriteItemSize / imageHeight;
              
              // Вычисляем смещение видимой области в долях (0..1)
              const offsetX = targetX / imageWidth;
              const offsetY = targetY / imageHeight;
              
              Logger.debug(`   ✂️ CROP параметры: offset=(${offsetX.toFixed(4)}, ${offsetY.toFixed(4)}), size=(${visibleW.toFixed(4)}, ${visibleH.toFixed(4)})`);
              
              // Матрица трансформации для CROP:
              // [visibleW, 0, offsetX]
              // [0, visibleH, offsetY]
              // Это вырежет нужный кусок и растянет его на весь слой
              
              const newPaint: ImagePaint = {
                type: 'IMAGE',
                scaleMode: 'CROP',
                imageHash: figmaImage.hash,
                imageTransform: [
                  [visibleW, 0, offsetX],
                  [0, visibleH, offsetY]
                ]
              };
              
              layer.fills = [newPaint];
              Logger.debug(`   ✅ Спрайт применен успешно (CROP)`);
            } else {
              // Обычное изображение
              const newPaint: ImagePaint = {
                type: 'IMAGE',
                scaleMode: 'FILL',
                imageHash: figmaImage.hash
              };
              layer.fills = [newPaint];
              Logger.debug(`   ✅ Изображение применено (FILL)`);
            }
            
            imagesSuccessful++;
          } catch (applyError) {
            Logger.error(`   ❌ Ошибка применения изображения:`, applyError);
            imagesFailed++;
          }
          
        } catch (error) {
          Logger.error(`   ❌ Ошибка обработки изображения "${item.fieldName}":`, error);
          imagesFailed++;
        } finally {
          imagesProcessed++;
        }
      };
      
      // Запускаем пул обработчиков
      const processImagesPool = async () => {
        const queue = [...imageLayers];
        const workers: Promise<void>[] = [];
        
        for (let i = 0; i < MAX_CONCURRENT_IMAGES; i++) {
          workers.push((async () => {
            while (queue.length > 0) {
              const item = queue.shift();
              if (item) {
                const index = imageLayers.length - queue.length - 1;
                await processImage(item, index);
              }
            }
          })());
        }
        
        await Promise.all(workers);
      };
      
      await processImagesPool();
      
      const imagesTime = Date.now() - imagesStartTime;
      Logger.info(`✅ Обработка изображений завершена: ${imagesSuccessful} успешно, ${imagesFailed} ошибок (${imagesTime}ms)`);
      logTiming('Обработка изображений завершена');
      
      // Отправляем статистику и тайминг в UI
      figma.ui.postMessage({
        type: 'stats',
        stats: {
          processedInstances: nextRowIndex,
          totalInstances: finalContainerMap.size,
          successfulImages: imagesSuccessful,
          skippedImages: imageLayers.length - imagesSuccessful - imagesFailed,
          failedImages: imagesFailed
        }
      });
      
      figma.ui.postMessage({
        type: 'log',
        message: `⏱️ Обработка изображений: ${(imagesTime / 1000).toFixed(2)}s`
      });
      
      } catch (imagesError) {
        Logger.error(`❌ Общая ошибка обработки изображений:`, imagesError);
      }
    }
    
    const totalTime = Date.now() - startTime;
    Logger.info(`🎉 Готово! Обработано ${nextRowIndex} элементов за ${(totalTime / 1000).toFixed(2)}s`);
    
    figma.ui.postMessage({
      type: 'done',
      count: nextRowIndex
    });
  }
};

