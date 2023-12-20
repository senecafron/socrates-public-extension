import {
  injectDraggingBehaviour,
  HTMLBoxGraph,
  TrackableState,
  removeAllHoverHighlight,
  unGlowSameColorVariableReference,
  DEBUG_MODE,
  canvasTranslate,
  canvasScale,
  rootURL,
  FunctionBox,
  getFunctionBox,
} from "./utils.js";

function handleColorPicker(event, trackableState) {
  // we won't remove the color picker if the cursor is inside highlightedVariableBox
  // BUT ONLY if it's NOT a click event
  if (
    event.type !== "click" &&
    trackableState.cursorInsideHighlightedVariableBox
  ) {
    return;
  }
  let colorPicker = document.querySelector(
    ".colorPickerAndHighlightedVariableBoxContainer"
  );
  if (colorPicker === null) {
    return;
  }
  colorPicker.remove();
  trackableState.cursorInsideHighlightedVariableBox = false;
}

function handleVariableHoverHighlight(event) {
  removeAllHoverHighlight();
  unGlowSameColorVariableReference();
}

function updateCanvasPositionDebugger(translateX, translateY) {
  let canvasPositionDebugger = document.querySelector(
    ".canvasPositionDebugger"
  );
  canvasPositionDebugger.style.left = `${translateX}px`;
  canvasPositionDebugger.style.top = `${translateY}px`;
  canvasPositionDebugger.innerHTML = `${translateX}px, ${translateY}px`;
}

function setUpInfiniteCanvas(trackableState) {
  const canvasContainer = document.querySelector(".canvas-container");
  const canvas = document.querySelector(".canvas");

  // This factor will control how much the canvas moves with each scroll event
  const ZOOM_SPEED = 0.02;

  function handleWheel(event) {
    // we need to negate it because the canvas is translated in the opposite direction
    let originX = -canvasTranslate().x;
    let originY = -canvasTranslate().y;
    let scale = canvasScale();

    const rect = canvasContainer.getBoundingClientRect();
    const x = rect.left - event.clientX; // x position within the element
    const y = rect.top - event.clientY; // y position within the element

    if (event.ctrlKey) {
      // handling pinch to zoom

      event.preventDefault(); // to prevent default zooming

      let deltaScale = Math.pow(0.998, event.deltaY);
      if (event.deltaY < 0) {
        // zoom in
        deltaScale += ZOOM_SPEED;
      } else {
        // zoom out
        deltaScale -= ZOOM_SPEED;
      }
      // Calculate the new scale, clamped to a reasonable range
      scale = scale * deltaScale;

      // Calculate how much we should translate to zoom in on the cursor position
      originX = (originX - x) * (deltaScale - 1) + originX;
      originY = (originY - y) * (deltaScale - 1) + originY;

      // Apply the transformation
      canvas.style.transform = `translate(${-originX}px, ${-originY}px) scale(${scale})`;
    } else {
      if (
        trackableState.cursorInsideHTMLBox ||
        trackableState.cursorInsideHighlightedVariableBox
      ) {
        console.log("cursor inside HTMLBox, not handling wheel event");
        return;
      }

      event.preventDefault(); // to prevent default scrolling

      let speed = 1;
      let deltaX = event.deltaX * speed;
      let deltaY = event.deltaY * speed;

      // Update the current position of the canvas
      originX += deltaX;
      originY += deltaY;
      canvas.style.transform = `translate(${-originX}px, ${-originY}px) scale(${scale})`;
    }
    if (DEBUG_MODE) {
      updateCanvasPositionDebugger(-originX, -originY);
    }
  }

  // initial set up of the "infinite" canvas
  canvasContainer.addEventListener("wheel", handleWheel);
  canvas.style.transform = `translate(${0}px, ${0}px) scale(${0.5})`;
}

function addPositionDebugger() {
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      let positionDebugger = document.createElement("div");
      positionDebugger.style.position = "absolute";
      positionDebugger.style.left = `${j * 100}px`;
      positionDebugger.style.top = `${i * 100}px`;
      positionDebugger.innerHTML = `helo`;
      positionDebugger.style.backgroundColor = "red";
      positionDebugger.innerHTML = `${j * 100}, ${i * 100}`;
      document.body.appendChild(positionDebugger);
    }
  }
  addCanvasPositionDebugger();
}

function addCanvasPositionDebugger() {
  let canvasElement = document.querySelector(".canvas");
  var transformStyle = canvasElement.style.transform;
  console.log(`transformStyle = ${transformStyle}`);
  var match = transformStyle.match(/translate\(([^,]+),([^)]+)\)/);

  if (match) {
    var translateX = parseFloat(match[1]);
    var translateY = parseFloat(match[2]);
    console.log(`translateX = ${translateX}, translateY = ${translateY}`);
    let canvasPositionDebugger = document.createElement("div");
    canvasPositionDebugger.classList.add("canvasPositionDebugger");
    canvasPositionDebugger.style.left = `${translateX}px`;
    canvasPositionDebugger.style.top = `${translateY}px`;
    canvasPositionDebugger.innerHTML = `${translateX}px, ${translateY}px`;
    document.body.appendChild(canvasPositionDebugger);
  } else {
    console.log("Translate not found in transform property.");
  }
}

// waiting for the socrates-extension to send the function definition hash
async function main() {
  let trackableState = new TrackableState();
  let htmlBoxGraph = new HTMLBoxGraph();

  setUpInfiniteCanvas(trackableState);
  if (DEBUG_MODE) {
    addPositionDebugger();
  }

  let nodeMap = {};

  const resp = await fetch(`${rootURL()}/get-hash-key`);
  const hashKey = await resp.text();
  console.log("hashKey =", hashKey);

  // TODO: this might be different address
  const response = await fetch(`${rootURL()}/get-node-map`);
  if (!response.ok) {
    throw new Error(`Failed to fetch NODE_MAP_ts.json`);
  }

  const responseJson = await response.json();
  const nodeMapArray = responseJson.nodeMap;
  nodeMap = Object.fromEntries(nodeMapArray);
  htmlBoxGraph.nodeMap = nodeMap;

  getFunctionBox(document, htmlBoxGraph, trackableState, hashKey).then(
    (functionBox) => {
      if (functionBox === null) {
        throw new Error("functionBox is null, it's impossible");
      }
      functionBox.draw(0, 0);

      htmlBoxGraph.addBox(functionBox);

      injectDraggingBehaviour(
        document,
        functionBox.htmlElement(),
        htmlBoxGraph
      );
    }
  );

  document.addEventListener("click", function (event) {
    handleVariableHoverHighlight(event);
    handleColorPicker(event, trackableState);
  });

  window.addEventListener("wheel", function (event) {
    handleColorPicker(event, trackableState);
  });
}

main();
