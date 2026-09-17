// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { FPS, IS_HIDPI } from './constants.js';

export class HorizonLine {
  /**
   * Horizon Line.
   * Consists of enough connecting lines to cover the viewport. Randomly assigns
   * a flat / bumpy horizon.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} lineConfig Configuration object.
   * @param {number=} viewportWidth Logical width of the game viewport.
   */
  constructor(canvas, lineConfig, viewportWidth = lineConfig.WIDTH) {
    let sourceX = lineConfig.SOURCE_X;
    let sourceY = lineConfig.SOURCE_Y;

    if (IS_HIDPI) {
      sourceX *= 2;
      sourceY *= 2;
    }

    this.spritePos = { x: sourceX, y: sourceY };
    this.canvas = canvas;
    this.canvasCtx = /** @type {CanvasRenderingContext2D} */ (
      canvas.getContext('2d')
    );
    this.sourceDimensions = {};
    this.dimensions = lineConfig;

    this.sourceXPos = [];
    this.xPos = [];
    this.yPos = 0;
    this.bumpThreshold = 0.5;
    this.viewportWidth = viewportWidth;

    this.setSourceDimensions(lineConfig);
    this.reset(viewportWidth);
    this.draw();
  }

  /**
   * Set the source dimensions of the horizon line.
   */
  setSourceDimensions(newDimensions) {
    for (const dimension in newDimensions) {
      if (dimension !== 'SOURCE_X' && dimension !== 'SOURCE_Y') {
        if (IS_HIDPI) {
          if (dimension !== 'YPOS') {
            this.sourceDimensions[dimension] = newDimensions[dimension] * 2;
          }
        } else {
          this.sourceDimensions[dimension] = newDimensions[dimension];
        }
        this.dimensions[dimension] = newDimensions[dimension];
      }
    }

    this.yPos = newDimensions.YPOS;
  }

  /**
   * Add enough sprite tiles to keep the ground under the full game viewport.
   * The original game only needed two tiles because its canvas was 600px wide.
   * @param {number} viewportWidth
   */
  ensureTileCoverage(viewportWidth) {
    this.viewportWidth = viewportWidth;
    const tileWidth = this.dimensions.WIDTH;
    const requiredTiles = Math.max(2, Math.ceil(viewportWidth / tileWidth) + 1);

    while (this.xPos.length < requiredTiles) {
      const index = this.xPos.length;
      const rightmostX = this.xPos.length ? Math.max(...this.xPos) : -tileWidth;
      this.xPos.push(rightmostX + tileWidth);
      this.sourceXPos.push(
        this.spritePos.x + (index === 1 ? tileWidth : this.getRandomType())
      );
    }
  }

  /**
   * Return the crop x position of a type.
   */
  getRandomType() {
    return Math.random() > this.bumpThreshold ? this.dimensions.WIDTH : 0;
  }

  /**
   * Draw the horizon line.
   */
  draw() {
    for (let i = 0; i < this.xPos.length; i++) {
      this.canvasCtx.drawImage(
        window.Runner.imageSprite,
        this.sourceXPos[i],
        this.spritePos.y,
        this.sourceDimensions.WIDTH,
        this.sourceDimensions.HEIGHT,
        this.xPos[i],
        this.yPos,
        this.dimensions.WIDTH,
        this.dimensions.HEIGHT
      );
    }
  }

  /**
   * Update the horizon line.
   * @param {number} deltaTime
   * @param {number} speed
   * @param {number=} viewportWidth Logical width of the game viewport.
   */
  update(deltaTime, speed, viewportWidth = this.viewportWidth) {
    this.ensureTileCoverage(viewportWidth);
    const increment = Math.floor(speed * (FPS / 1000) * deltaTime);

    for (let i = 0; i < this.xPos.length; i++) {
      this.xPos[i] -= increment;
    }

    for (let i = 0; i < this.xPos.length; i++) {
      while (this.xPos[i] <= -this.dimensions.WIDTH) {
        this.xPos[i] = Math.max(...this.xPos) + this.dimensions.WIDTH;
        this.sourceXPos[i] = this.getRandomType() + this.spritePos.x;
      }
    }

    this.draw();
  }

  /**
   * Reset horizon to the starting position.
   */
  reset(viewportWidth = this.viewportWidth) {
    this.xPos = [];
    this.sourceXPos = [];
    this.ensureTileCoverage(viewportWidth);
  }
}
