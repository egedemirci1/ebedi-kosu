function createGradientMock() {
  return { addColorStop() {} };
}

class CanvasContext2DMock {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;

  fillRect() {}
  clearRect() {}
  strokeRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  fill() {}
  stroke() {}
  arc() {}
  quadraticCurveTo() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  setLineDash() {}

  createLinearGradient() {
    return createGradientMock();
  }

  createRadialGradient() {
    return createGradientMock();
  }
}

HTMLCanvasElement.prototype.getContext = function mockGetContext(type) {
  if (type === '2d') return new CanvasContext2DMock();
  return null;
};
