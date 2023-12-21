import hljs from "highlight.js";

export const DEBUG_MODE = false;
export const FUNCTION_REFERENCE_DIRECT_CONNECT = true;

export let canvasOriginX = 0;
export let canvasOriginY = 0;

export async function getFunctionBox(
  document,
  htmlBoxGraph,
  trackableState,
  key,
  highlightedFunctionReferenceHash = null
) {
  try {
    let nodeMap = {};
    if (htmlBoxGraph.nodeMap.length > 0) {
      nodeMap = htmlBoxGraph.nodeMap;
    } else {
      const response = await fetch(`${rootURL()}/get-node-map`);
      if (!response.ok) {
        throw new Error(`Failed to fetch NODE_MAP_ts.json`);
      }
      const response_json = await response.json();
      const nodeMapArray = response_json.nodeMap;
      nodeMap = Object.fromEntries(nodeMapArray);
      htmlBoxGraph.nodeMap = nodeMap;
    }

    if (!nodeMap) {
      throw new Error("nodeMap is null, it's impossible");
    }

    const functionDefinitionNode = nodeMap[key];

    const functionBodyAndSignature = await getFunctionBodyAndSignature(
      functionDefinitionNode.uri,
      functionDefinitionNode.symbol.range.start,
      functionDefinitionNode.symbol.range.end
    );

    const functionReferencesInsideKeyFunction = [];
    const variableDefinitionsInsideKeyFunction = [];
    const variableReferencesInsideKeyFunction = [];
    for (const nodeKey in nodeMap) {
      const currentNode = nodeMap[nodeKey];
      if (currentNode.type_name_ === "function-reference") {
        if (currentNode.hostFunctionHash === key) {
          functionReferencesInsideKeyFunction.push(currentNode);
        }
      } else if (currentNode.type_name_ === "variable-definition") {
        if (currentNode.hostFunctionHash === key) {
          variableDefinitionsInsideKeyFunction.push(currentNode);
        }
      } else if (currentNode.type_name_ === "variable-reference") {
        if (currentNode.hostFunctionHash === key) {
          variableReferencesInsideKeyFunction.push(currentNode);
        }
      }
    }

    const fileNameBox = new FileNameBox(
      document,
      htmlBoxGraph,
      functionDefinitionNode.uri,
      trackableState
    );

    let functionName = functionDefinitionNode.symbol.detail
      ? functionDefinitionNode.symbol.detail
      : functionDefinitionNode.symbol.name;

    let parentSymbolName = functionDefinitionNode.parentSymbol
      ? functionDefinitionNode.parentSymbol.name
      : "";
    if (parentSymbolName !== "") {
      functionName = parentSymbolName + "." + functionName;
    }

    // only find children that is type of function
    const nestedFunctionDefinitionNodes =
      functionDefinitionNode.symbol.children.filter((child) => {
        // 12 is lsp.SymbolKind.Function
        return child.kind === 12;
      });

    const codeBoxState = new CodeBoxState(
      /*functionReferenceNodes=*/ functionReferencesInsideKeyFunction,
      /*variableDefinitionNodes=*/ variableDefinitionsInsideKeyFunction,
      /*variableReferenceNodes=*/ variableReferencesInsideKeyFunction,
      /*nestedFunctionDefinitionNodes=*/ nestedFunctionDefinitionNodes,
      /*highlightedFunctionReferenceHash=*/ highlightedFunctionReferenceHash
    );

    return new FunctionBox(
      document,
      htmlBoxGraph,
      trackableState,
      key,
      functionName,
      fileNameBox,
      functionBodyAndSignature,
      functionDefinitionNode.symbol.range.start,
      codeBoxState
    );
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

// TODO: Clean the mess with the if statement bro wtf lol
function constructSpanCoordinatesFromNodes(
  type,
  rawCodeText,
  nodes,
  variableDefinitionHashToStyle,
  codeStartLocation
) {
  if (type == "variable-definition") {
    nodes.sort((a, b) => {
      if (
        a.symbol.selectionRange.start.line < b.symbol.selectionRange.start.line
      ) {
        return -1;
      } else if (
        a.symbol.selectionRange.start.line > b.symbol.selectionRange.start.line
      ) {
        return 1;
      } else {
        if (
          a.symbol.selectionRange.start.character <
          b.symbol.selectionRange.start.character
        ) {
          return -1;
        } else if (
          a.symbol.selectionRange.start.character >
          b.symbol.selectionRange.start.character
        ) {
          return 1;
        } else {
          return 0;
        }
      }
    });
  } else if (type == "function-reference" || type == "variable-reference") {
    // sort nodes by location
    nodes.sort((a, b) => {
      if (a.location.range.start.line < b.location.range.start.line) {
        return -1;
      } else if (a.location.range.start.line > b.location.range.start.line) {
        return 1;
      } else {
        if (
          a.location.range.start.character < b.location.range.start.character
        ) {
          return -1;
        } else if (
          a.location.range.start.character > b.location.range.start.character
        ) {
          return 1;
        } else {
          return 0;
        }
      }
    });
  }

  let indexMapper = new TwoDimensionIndexMapper(rawCodeText);
  let spanCoordinates = [];
  for (let i = 0; i < nodes.length; i++) {
    let currentNode = nodes[i];
    let startLine, startCharacter, endLine, endCharacter;

    if (type == "function-reference") {
      startLine =
        currentNode.location.range.start.line - codeStartLocation.line;
      startCharacter =
        currentNode.location.range.start.character -
        codeStartLocation.character;

      endLine = currentNode.location.range.end.line - codeStartLocation.line;
      endCharacter =
        currentNode.location.range.end.character - codeStartLocation.character;
    } else if (type == "variable-definition") {
      startLine =
        currentNode.symbol.selectionRange.start.line - codeStartLocation.line;
      startCharacter =
        currentNode.symbol.selectionRange.start.character -
        codeStartLocation.character;

      endLine =
        currentNode.symbol.selectionRange.end.line - codeStartLocation.line;
      endCharacter =
        currentNode.symbol.selectionRange.end.character -
        codeStartLocation.character;
    } else if (type == "variable-reference") {
      startLine =
        currentNode.location.range.start.line - codeStartLocation.line;
      startCharacter =
        currentNode.location.range.start.character -
        codeStartLocation.character;

      endLine = currentNode.location.range.end.line - codeStartLocation.line;
      endCharacter =
        currentNode.location.range.end.character - codeStartLocation.character;
    }

    let start = indexMapper.map(startLine, startCharacter);
    let end = indexMapper.map(endLine, endCharacter);
    if (type == "function-reference") {
      spanCoordinates.push({
        type: "opening",
        index: start,
        tag: `<span class="hljs-title function_ functionReference" function-definition-hash="${currentNode.functionDefinitionHash}" function-reference-hash="${currentNode.hashString}">`,
      });
    } else if (type == "variable-definition") {
      let style = variableDefinitionHashToStyle[currentNode.hashString];
      if (style) {
        spanCoordinates.push({
          type: "opening",
          index: start,
          tag: `<span class="variableDefinition highlight" variable-definition-hash="${currentNode.hashString}" style="background-color: ${style.backgroundColor}; color: ${style.textColor};">`,
        });
      } else {
        spanCoordinates.push({
          type: "opening",
          index: start,
          tag: `<span class="variableDefinition" variable-definition-hash="${currentNode.hashString}">`,
        });
      }
    } else if (type == "variable-reference") {
      let style =
        variableDefinitionHashToStyle[currentNode.variableDefinitionHash];
      if (style) {
        spanCoordinates.push({
          type: "opening",
          index: start,
          tag: `<span class="variableReference highlight" variable-definition-hash="${currentNode.variableDefinitionHash}" style="background-color: ${style.backgroundColor}; color: ${style.textColor};">`,
        });
      } else {
        spanCoordinates.push({
          type: "opening",
          index: start,
          tag: `<span class="variableReference" variable-definition-hash=${currentNode.variableDefinitionHash}>`,
        });
      }
    }
    spanCoordinates.push({
      type: "closing",
      index: end,
      tag: "</span>",
    });
  }
  return spanCoordinates;
}

function shiftCanvasTowardsHtmlBox(htmlBox, anchor = { x: 300, y: 300 }) {
  // we will shift the canvas so that the functionMetadataBox is at the anchor
  // we will shift the canvas and change the scale to SCALE_TARGET
  const SCALE_TARGET = 0.5;

  let functionMetadataBoxPosition = getDocumentRelativePosition(
    htmlBox.htmlElement()
  );

  // box canvas pixel
  let bcpx = {
    x: functionMetadataBoxPosition.left,
    y: functionMetadataBoxPosition.top,
  };

  // canvas real pixel
  let crpx = {
    x: canvasTranslate().x,
    y: canvasTranslate().y,
  };

  // box real pixel
  let brpx = {
    x: bcpx.x * SCALE_TARGET + crpx.x,
    y: bcpx.y * SCALE_TARGET + crpx.y,
  };

  // real gap pixel
  let rGapx = brpx.x - crpx.x;
  let rGapy = brpx.y - crpx.y;

  // new canvas real pixel
  let nCrpx = { x: anchor.x - rGapx, y: anchor.y - rGapy };

  const canvas = document.querySelector(".canvas");
  canvas.style.transition = "transform 0.3s ease"; // Adjust duration and easing as needed
  canvas.style.transform = `translate(${nCrpx.x}px, ${nCrpx.y}px) scale(${SCALE_TARGET})`;

  // Add an event listener to remove the transition property after the animation is done
  function removeTransition() {
    canvas.style.transition = ""; // Remove the transition property
    canvas.removeEventListener("transitionend", removeTransition); // Remove the event listener
  }

  // Add an event listener to detect the end of the transition
  canvas.addEventListener("transitionend", removeTransition);
}

export function rootURL() {
  return `http://localhost:${window.location.port}`;
}

export function canvasTranslate() {
  let canvasElement = document.querySelector(".canvas");
  var transformStyle = canvasElement.style.transform;
  var match = transformStyle.match(/translate\(([^,]+),([^)]+)\)/);

  if (match) {
    var translateX = parseFloat(match[1]);
    var translateY = parseFloat(match[2]);
    return { x: translateX, y: translateY };
  } else {
    return { x: 0, y: 0 };
  }
}

export function canvasScale() {
  const canvasEl = document.querySelector(".canvas");

  const styleAttribute = canvasEl.getAttribute("style");

  if (!styleAttribute) {
    console.error("styleAttribute is null");
    return null;
  }

  const scaleMatch = styleAttribute.match(/scale\(([^)]+)\)/);

  if (scaleMatch) {
    return parseFloat(scaleMatch[1]);
  } else {
    console.error("scaleMatch is null");
    return null;
  }
}

export function removeAllHoverHighlight() {
  let allVariableHoverHighlightedReference =
    document.querySelectorAll(".variableHover");

  allVariableHoverHighlightedReference.forEach(
    (variableHoverHighlightedReference) => {
      variableHoverHighlightedReference.classList.remove("variableHover");
    }
  );
}

class SVGIndexMapper {
  constructor(svgTop, svgLeft) {
    // svgTop and svgLeft is the top and left of the svg element
    this.svgTop = svgTop;
    this.svgLeft = svgLeft;
  }

  mapToSvgIndex(realX, realY) {
    return {
      x: realX - this.svgLeft,
      y: realY - this.svgTop,
    };
  }

  mapToRealIndex(svgX, svgY) {
    return {
      x: svgX + this.svgLeft,
      y: svgY + this.svgTop,
    };
  }
}

function createLine(svg, x1, y1, x2, y2, strokeWidth, markerEnd) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "white");
  line.setAttribute("stroke-width", strokeWidth);
  if (markerEnd) {
    line.setAttribute("marker-end", "url(#arrowhead)");
  }
  svg.appendChild(line);
}

function addArrowTipDefinitionToSvg(markerWidth, markerHeight, svg) {
  const marker = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "marker"
  );
  marker.id = "arrowhead";
  marker.setAttribute("markerWidth", markerWidth);
  marker.setAttribute("markerHeight", markerHeight);
  marker.setAttribute("refX", "0");
  marker.setAttribute("refY", markerHeight / 2);
  marker.setAttribute("orient", "auto");

  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon"
  );
  polygon.setAttribute(
    "points",
    `0 0, ${markerWidth} ${markerHeight / 2}, 0 ${markerHeight}`
  );
  polygon.setAttribute("fill", "white");

  marker.appendChild(polygon);

  // Remove existing defs if any and add the updated one
  const existingDefs = svg.querySelector("defs");
  if (existingDefs) {
    existingDefs.remove();
  }
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.appendChild(marker);
  svg.appendChild(defs);
}

export function injectDraggingBehaviour(
  document,
  draggableBoxHtmlElement,
  /** @type {HTMLBoxGraph} */
  htmlBoxGraph
) {
  if (draggableBoxHtmlElement.onmousedown !== null) {
    return;
  }

  draggableBoxHtmlElement.onmousedown = function (event) {
    // check if its a right click
    if (event.button == 2) {
      return;
    }

    // check if command button is also being held
    if (event.metaKey || event.ctrlKey) {
      handleEntireSubtreeBoxDragging(event);
    } else {
      handleIndividualBoxDragging(event);
    }
  };

  function handleIndividualBoxDragging(event) {
    let boxRect = getDocumentRelativePosition(draggableBoxHtmlElement);
    let shiftX = event.clientX / canvasScale() - boxRect.left;
    let shiftY = event.clientY / canvasScale() - boxRect.top;

    function moveAt(viewPortX, viewPortY) {
      /*
    Think of it this way,
 
    pageX is the current mouse position on the page,
    shiftX is the distance between the mouse and the left edge of the draggableBox
    you want the left edge of the draggableBox to be at the mouse position (pageX) - shiftX
    */
      // Calculate the new position of the draggableBox
      let newLeft = viewPortX / canvasScale() - shiftX;
      let newTop = viewPortY / canvasScale() - shiftY;

      draggableBoxHtmlElement.style.left = newLeft + "px";
      draggableBoxHtmlElement.style.top = newTop + "px";
      htmlBoxGraph.recomputeSVGArrowConnections(
        /*recentlyMovedBoxId=*/ draggableBoxHtmlElement.getAttribute("id")
      );
      if (DEBUG_MODE) {
        let positionDebuggingDiv = draggableBoxHtmlElement.querySelector(
          ".positionDebuggingDiv"
        );
        positionDebuggingDiv.innerHTML = `${newLeft}px, ${newTop}px`;
      }
    }

    function onMouseMove(event) {
      event.preventDefault();
      moveAt(event.clientX, event.clientY);
    }

    moveAt(event.clientX, event.clientY);

    document.addEventListener("mousemove", onMouseMove);
    document.onmouseup = function () {
      document.removeEventListener("mousemove", onMouseMove);
      draggableBoxHtmlElement.onmouseup = null;
    };
  }

  function handleEntireSubtreeBoxDragging(event) {
    let clickedBoxInitialRect = getDocumentRelativePosition(
      draggableBoxHtmlElement
    );
    let mouseDownX = event.clientX / canvasScale();
    let mouseDownY = event.clientY / canvasScale();

    function moveAt(mouseMoveX, mouseMoveY) {
      let oldLeftOfClickedBox = getDocumentRelativePosition(
        draggableBoxHtmlElement
      ).left;
      let oldTopOfClickedBox = getDocumentRelativePosition(
        draggableBoxHtmlElement
      ).top;

      let shiftX = mouseDownX - clickedBoxInitialRect.left;
      let shiftY = mouseDownY - clickedBoxInitialRect.top;

      let newLeftOfClickedBox = mouseMoveX / canvasScale() - shiftX;
      let newTopOfClickedBox = mouseMoveY / canvasScale() - shiftY;

      moveClickedBox(newLeftOfClickedBox, newTopOfClickedBox);
      moveClickedBoxSubtree(
        newLeftOfClickedBox,
        oldLeftOfClickedBox,
        newTopOfClickedBox,
        oldTopOfClickedBox
      );
    }

    function moveClickedBoxSubtree(newLeft, oldLeft, newTop, oldTop) {
      let subStreeHtmlBox = htmlBoxGraph.getSubTree(
        draggableBoxHtmlElement.getAttribute("id")
      );
      let handledHtmlBoxIds = new Set();
      for (let i = 1; i < subStreeHtmlBox.length; i++) {
        let currentHtmlBox = subStreeHtmlBox[i];
        if (handledHtmlBoxIds.has(currentHtmlBox.id())) {
          continue;
        }
        handledHtmlBoxIds.add(currentHtmlBox.id());
        let currentHtmlBoxRect = getDocumentRelativePosition(
          currentHtmlBox.htmlElement()
        );
        currentHtmlBox.htmlElement().style.left =
          currentHtmlBoxRect.left + (newLeft - oldLeft) + "px";
        currentHtmlBox.htmlElement().style.top =
          currentHtmlBoxRect.top + (newTop - oldTop) + "px";
        if (DEBUG_MODE) {
          let positionDebuggingDiv = currentHtmlBox
            .htmlElement()
            .querySelector(".positionDebuggingDiv");
          positionDebuggingDiv.innerHTML = `${
            currentHtmlBoxRect.left + (newLeft - oldLeft)
          }px, ${currentHtmlBoxRect.top + (newTop - oldTop)}px`;
        }
        htmlBoxGraph.recomputeSVGArrowConnections(currentHtmlBox.id());
      }
    }

    function moveClickedBox(newLeft, newTop) {
      draggableBoxHtmlElement.style.left = newLeft + "px";
      draggableBoxHtmlElement.style.top = newTop + "px";
      /** @type {HTMLBoxGraph} */
      htmlBoxGraph.recomputeSVGArrowConnections(
        /*recentlyMovedBoxId=*/ draggableBoxHtmlElement.getAttribute("id")
      );
      if (DEBUG_MODE) {
        let positionDebuggingDiv = draggableBoxHtmlElement.querySelector(
          ".positionDebuggingDiv"
        );
        positionDebuggingDiv.innerHTML = `${newLeft}px, ${newTop}px`;
      }
      return { newLeft, newTop };
    }

    function onMouseMove(event) {
      event.preventDefault();
      moveAt(event.clientX, event.clientY);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.onmouseup = function () {
      document.removeEventListener("mousemove", onMouseMove);
      draggableBoxHtmlElement.onmouseup = null;
    };
  }
}

// Only used for debugging
function printElementAttributes(element) {
  // Check if the element is valid
  if (!element) {
    console.log("Invalid element");
    return;
  }

  // Get the attributes of the element
  var attributes = element.attributes;

  // Iterate through the attributes and print them
  for (var i = 0; i < attributes.length; i++) {
    var attribute = attributes[i];
    console.log(attribute.name + ": " + attribute.value);
  }
}

export function getDocumentRelativePosition(el) {
  var top = 0;
  var left = 0;

  var originalElement = el; // Keep a reference to the original element for later use

  while (el) {
    top += el.offsetTop || 0;
    left += el.offsetLeft || 0;
    el = el.offsetParent; // Move up to the next offset parent in the hierarchy
  }

  var width = originalElement.offsetWidth;
  var height = originalElement.offsetHeight;

  return {
    top: top,
    left: left,
    right: left + width,
    bottom: top + height,
    width: width,
    height: height,
  };
}

export function unGlowSameColorVariableReference() {
  let relevantVariableReferences =
    document.querySelectorAll(".glowingHighlight");

  relevantVariableReferences.forEach((relevantVariableReference) => {
    relevantVariableReference.style.boxShadow = "";
    relevantVariableReference.classList.remove("colorPallettePickingShadow");
    relevantVariableReference.classList.remove("glowingHighlight");
  });

  removeDimming();
}

// To undo the dimming, remove the 'dimmed' class from elements
// You can call this function when needed
function removeDimming() {
  document.querySelectorAll(".dimmed").forEach((el) => {
    el.classList.remove("dimmed");
  });
}

function drawIntoCanvas(elem) {
  let canvas = document.querySelector(".canvas");
  canvas.appendChild(elem);
}

async function getCodeContent(node, line) {
  let uri = node.location.uri;
  let start = {
    line: node.location.range.start,
    character: 0,
  };
  let end = node.location.range.end;
  let code = await getFunctionBodyAndSignature(uri, start, end);
  let lines = code.split("\n");
  return lines[line];
}

function glowSameColorVariableReference(colorHex) {
  let allHighlightedVariablesEl = document.querySelectorAll(".highlight");
  // get all the variable reference that has the same highlighted color as colorHex
  let relevantVariableReferences = Array.from(allHighlightedVariablesEl).filter(
    (highlightedVariableEl) => {
      let style = highlightedVariableEl.style;
      return (
        rgbToHex(style.backgroundColor).toLowerCase() === colorHex.toLowerCase()
      );
    }
  );

  relevantVariableReferences.forEach((relevantVariableReference) => {
    relevantVariableReference.style.boxShadow = `0px 0px 50px 0px ${colorHex}`;
    relevantVariableReference.classList.add("glowingHighlight");
  });

  // dim all variable references and defintions that is not glowing
  if (relevantVariableReferences.length > 0) {
    document
      .querySelectorAll(".variableReference, .variableDefinition")
      .forEach((el) => {
        if (!el.classList.contains("glowingHighlight")) {
          el.classList.add("dimmed");
        }
      });
  }
}

function rgbToHex(rgb) {
  const matches = rgb.match(/\d+/g);
  if (matches && matches.length === 3) {
    const r = parseInt(matches[0]);
    const g = parseInt(matches[1]);
    const b = parseInt(matches[2]);
    return (
      "#" +
      ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()
    );
  }
  return null;
}

function splitRawCodeTextIntoTwo(
  rawCodeText,
  startingLocation,
  endingLocation
) {
  let lines = rawCodeText.split("\n");
  let cutOffLine = endingLocation.line - startingLocation.line + 1;
  let firstCodeBoxContent = lines.slice(0, cutOffLine);
  let secondCodeBoxContent = lines.slice(cutOffLine);

  // join the lines back together
  let firstRawCodeString = firstCodeBoxContent.join("\n");
  let secondRawCodeString = secondCodeBoxContent.join("\n");

  return { firstRawCodeString, secondRawCodeString };
}

function splitFunctionReferenceNodesIntoTwo(
  functionReferenceNodes,
  startingLocation,
  endingLocation
) {
  let firstFunctionReferenceNodes = [];
  let secondFunctionReferenceNodes = [];
  for (let i = 0; i < functionReferenceNodes.length; i++) {
    let currentFunctionReferenceNode = functionReferenceNodes[i];
    if (
      currentFunctionReferenceNode.location.range.start.line <=
      endingLocation.line
    ) {
      firstFunctionReferenceNodes.push(currentFunctionReferenceNode);
    } else {
      secondFunctionReferenceNodes.push(currentFunctionReferenceNode);
    }
  }
  return { firstFunctionReferenceNodes, secondFunctionReferenceNodes };
}

function splitNestedFunctionDefinitionNodesIntoTwo(
  nestedFunctionDefinitionNodes,
  startingLocation,
  endingLocation
) {
  let firstNestedFunctionDefinitionNodes = [];
  let secondNestedFunctionDefinitionNodes = [];
  for (let i = 0; i < nestedFunctionDefinitionNodes.length; i++) {
    let currentNestedFunctionDefinitionNode = nestedFunctionDefinitionNodes[i];
    if (
      currentNestedFunctionDefinitionNode.range.start.line <=
      endingLocation.line
    ) {
      firstNestedFunctionDefinitionNodes.push(
        currentNestedFunctionDefinitionNode
      );
    } else {
      secondNestedFunctionDefinitionNodes.push(
        currentNestedFunctionDefinitionNode
      );
    }
  }
  return {
    firstNestedFunctionDefinitionNodes,
    secondNestedFunctionDefinitionNodes,
  };
}

function splitVariableDefinitionNodesIntoTwo(
  variableDefinitionNodes,
  startingLocation,
  endingLocation
) {
  let firstVariableDefinitionNodes = [];
  let secondVariableDefinitionNodes = [];
  for (let i = 0; i < variableDefinitionNodes.length; i++) {
    let currentVariableDefinitionNode = variableDefinitionNodes[i];
    if (
      currentVariableDefinitionNode.symbol.range.start.line <=
      endingLocation.line
    ) {
      firstVariableDefinitionNodes.push(currentVariableDefinitionNode);
    } else {
      secondVariableDefinitionNodes.push(currentVariableDefinitionNode);
    }
  }
  return { firstVariableDefinitionNodes, secondVariableDefinitionNodes };
}

function splitVariableReferenceNodesIntoTwo(
  variableReferenceNodes,
  startingLocation,
  endingLocation
) {
  let firstVariableReferenceNodes = [];
  let secondVariableReferenceNodes = [];
  for (let i = 0; i < variableReferenceNodes.length; i++) {
    let currentVariableReferenceNode = variableReferenceNodes[i];
    if (
      currentVariableReferenceNode.location.range.start.line <=
      endingLocation.line
    ) {
      firstVariableReferenceNodes.push(currentVariableReferenceNode);
    } else {
      secondVariableReferenceNodes.push(currentVariableReferenceNode);
    }
  }
  return { firstVariableReferenceNodes, secondVariableReferenceNodes };
}

function splitCodeBoxIntoTwo(hostCodeBox, functionReferenceCallRange) {
  let { firstRawCodeString, secondRawCodeString } = splitRawCodeTextIntoTwo(
    hostCodeBox.rawCodeText,
    hostCodeBox.codeStartLocation,
    functionReferenceCallRange.end
  );

  let { firstFunctionReferenceNodes, secondFunctionReferenceNodes } =
    splitFunctionReferenceNodesIntoTwo(
      hostCodeBox.codeBoxState.functionReferenceNodes,
      hostCodeBox.codeStartLocation,
      functionReferenceCallRange.end
    );

  let {
    firstNestedFunctionDefinitionNodes,
    secondNestedFunctionDefinitionNodes,
  } = splitNestedFunctionDefinitionNodesIntoTwo(
    hostCodeBox.codeBoxState.nestedFunctionDefinitionNodes,
    hostCodeBox.codeStartLocation,
    functionReferenceCallRange.end
  );

  let { firstVariableDefinitionNodes, secondVariableDefinitionNodes } =
    splitVariableDefinitionNodesIntoTwo(
      hostCodeBox.codeBoxState.variableDefinitionNodes,
      hostCodeBox.codeStartLocation,
      functionReferenceCallRange.end
    );

  let { firstVariableReferenceNodes, secondVariableReferenceNodes } =
    splitVariableReferenceNodesIntoTwo(
      hostCodeBox.codeBoxState.variableReferenceNodes,
      hostCodeBox.codeStartLocation,
      functionReferenceCallRange.end
    );

  const firstCodeBoxState = new CodeBoxState(
    firstFunctionReferenceNodes,
    firstVariableDefinitionNodes,
    firstVariableReferenceNodes,
    firstNestedFunctionDefinitionNodes,
    hostCodeBox.codeBoxState.highlightedFunctionReferenceHash,
    hostCodeBox.codeBoxState.boxOrder
  );
  let firstCodeBox = new CodeBox(
    hostCodeBox.document,
    hostCodeBox.htmlBoxGraph,
    hostCodeBox.defHash,
    firstRawCodeString,
    hostCodeBox.codeStartLocation,
    firstCodeBoxState,
    hostCodeBox.trackableState
  );

  const secondCodeBoxState = new CodeBoxState(
    secondFunctionReferenceNodes,
    secondVariableDefinitionNodes,
    secondVariableReferenceNodes,
    secondNestedFunctionDefinitionNodes,
    hostCodeBox.codeBoxState.highlightedFunctionReferenceHash,
    hostCodeBox.codeBoxState.boxOrder + 1
  );
  let secondCodeBox = new CodeBox(
    hostCodeBox.document,
    hostCodeBox.htmlBoxGraph,
    hostCodeBox.defHash,
    secondRawCodeString,
    // I don't think this is correct
    {
      line: functionReferenceCallRange.end.line + 1,
      character: hostCodeBox.codeStartLocation.character,
    },
    secondCodeBoxState,
    hostCodeBox.trackableState
  );

  return { firstCodeBox, secondCodeBox };
}

function splitCodeBoxAndRedrawSVGArrows(
  functionReferenceCallRange,
  htmlBoxGraph,
  hostCodeBox
) {
  var { firstCodeBox, secondCodeBox } = splitCodeBoxIntoTwo(
    hostCodeBox,
    functionReferenceCallRange
  );

  let hostCodeBoxPosition = getDocumentRelativePosition(
    hostCodeBox.htmlElement()
  );

  firstCodeBox.draw(
    hostCodeBoxPosition.left + hostCodeBoxPosition.width,
    hostCodeBoxPosition.top
  );
  firstCodeBox.scrollToBottom();

  secondCodeBox.draw(
    hostCodeBoxPosition.left - hostCodeBoxPosition.width / 2,
    hostCodeBoxPosition.bottom - hostCodeBoxPosition.height / 2
  );
  htmlBoxGraph.addBox(firstCodeBox);
  htmlBoxGraph.addBox(secondCodeBox);

  updateNeighbordingCodeBoxOrder(
    htmlBoxGraph,
    hostCodeBox,
    secondCodeBox.codeBoxState
  );

  injectTheSplitBoxesIntoGraph(
    firstCodeBox.htmlBoxGraph,
    hostCodeBox,
    firstCodeBox,
    secondCodeBox
  );

  injectDraggingBehaviour(
    hostCodeBox.document,
    firstCodeBox.htmlElement(),
    hostCodeBox.htmlBoxGraph
  );
  injectDraggingBehaviour(
    hostCodeBox.document,
    secondCodeBox.htmlElement(),
    hostCodeBox.htmlBoxGraph
  );

  return { firstCodeBox, secondCodeBox };
}

async function getFunctionBodyAndSignature(uri, start, end) {
  try {
    const response = await fetch(
      `${rootURL()}/get-file-content?fileUri=${uri}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch ${uri}`);
    }

    const responseJson = await response.json();
    const fileContent = await responseJson.fileContent;
    const lines = fileContent.split("\n");
    const functionLines = lines.slice(start.line, end.line + 1);

    for (let i = 0; i < functionLines.length; i++) {
      if (i == functionLines.length - 1) {
        functionLines[functionLines.length - 1] = functionLines[
          functionLines.length - 1
        ].substring(start.character, end.character);
      } else {
        functionLines[i] = functionLines[i].substring(start.character);
      }
    }
    return functionLines.join("\n");
  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

function generateUUID() {
  const uuidTemplate = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return uuidTemplate.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function extractChildrenRange(keyFunctionChildrenList) {
  let childrenRangeList = [];
  for (let i = 0; i < keyFunctionChildrenList.length; i++) {
    let currentChild = keyFunctionChildrenList[i];
    childrenRangeList.push({
      start: currentChild.range.start,
      end: currentChild.range.end,
    });
  }
  // sort the childrenRangeList by start
  childrenRangeList.sort((a, b) => {
    if (a.start.line < b.start.line) {
      return -1;
    } else if (a.start.line > b.start.line) {
      return 1;
    } else {
      if (a.start.character < b.start.character) {
        return -1;
      } else if (a.start.character > b.start.character) {
        return 1;
      } else {
        return 0;
      }
    }
  });
  return childrenRangeList;
}

// struct that stores function reference, the id of function box that the reference is connected to, and the svg arrow id that connects them
class RefAndFunctionBoxIdPair {
  constructor(functionReferenceHash, functionBoxId, svgId) {
    this.functionReferenceHash = functionReferenceHash;
    this.functionBoxId = functionBoxId;
    this.svgId = svgId;
  }

  getHash() {
    return `${this.functionReferenceHash}-${this.functionBoxId}-${this.svgId}`;
  }
}

export class HTMLBoxGraph {
  constructor() {
    // maps HTMLBox id to HTMLBox instance
    this.idToHtmlBox = {};
    this.idToSVGHTMLElement = {};

    // maps functionBox id to RefAndFunctionBoxIdPairs
    /** @type {Object.<string, RefAndFunctionBoxIdPair[]>} */
    this.parentFunctionBoxIdToChildrenRefAndFunctionBoxIdPairs = {};

    // maps functionBox id to its parent RefAndFunctionBoxIdPairs
    /** @type {Object<string, RefAndFunctionBoxIdPair[]>} */
    this.childrenFunctionBoxIdToParentRefFunctionBoxIdPairs = {};

    // maps parent id to list of children id items i.e. {box_id, svg_id}
    this.parentToChildrens = {}; // TODO: Deprecate this

    // maps children id to list of parent id items i.e. {box_id, svg_id}
    this.childrenToParents = {}; // TODO: Deprecate this

    // TODO: VERY MISLEADING, MOVE EVERYTHING BELOW. We shouldn't put the tnire NodeMap in HTMLBoxGraph
    this.nodeMap = {};
    this.renderedFunctionReferenceHashes = new Set();
  }

  getCodeBoxParentId(boxId) {
    let parents = this.childrenToParents[boxId];
    // codebox should only have one parent
    return parents[0].box_id;
  }

  getBox(boxId) {
    if (this.idToHtmlBox[boxId] == null) {
      throw new Error(
        `box is null for id = ${JSON.stringify(
          boxId
        )}, perhaps you forgot to call addBox?`
      );
    }
    return this.idToHtmlBox[boxId];
  }

  addBox(htmlBox) {
    this.idToHtmlBox[htmlBox.id()] = htmlBox;
  }

  getSubTree(boxId) {
    let htmlBox = this.getBox(boxId);
    let subTree = [htmlBox];

    let childrenRefAndFunctionBoxIdPairs =
      this.parentFunctionBoxIdToChildrenRefAndFunctionBoxIdPairs[boxId];

    if (childrenRefAndFunctionBoxIdPairs) {
      for (let i = 0; i < childrenRefAndFunctionBoxIdPairs.length; i++) {
        let refAndFunctionBoxIdPair = childrenRefAndFunctionBoxIdPairs[i];
        subTree = subTree.concat(
          this.getSubTree(refAndFunctionBoxIdPair.functionBoxId)
        );
      }
    }
    return subTree;
  }

  getParentBoxIdItems(boxId) {
    return this.childrenToParents[boxId] || [];
  }

  getChildrenBoxIdItems(boxId) {
    return (
      this.parentFunctionBoxIdToChildrenRefAndFunctionBoxIdPairs[boxId] || []
    );
  }

  connectTwoFunctionBox(
    parentFunctionBoxId,
    functionReferenceSpanEl,
    childrenFunctionBoxId
  ) {
    if (this.idToHtmlBox[parentFunctionBoxId] === undefined) {
      throw new Error(
        `parentFunctionBoxId of ${parentFunctionBoxId} cannot be found, please call addBox on parentFunctionBox first`
      );
    }

    if (this.idToHtmlBox[childrenFunctionBoxId] === undefined) {
      throw new Error(
        `childrenFunctionBoxId of ${childrenFunctionBoxId} cannot be found, please call addBox on childrenFunctionBox first`
      );
    }

    let svgArrowSection = this.createSvgArrowSection();
    this.updateParentChildrenRegister(
      parentFunctionBoxId,
      functionReferenceSpanEl.getAttribute("function-reference-hash"),
      childrenFunctionBoxId,
      svgArrowSection.getAttribute("id")
    );

    let { x1, y1, x2, y2 } = this.computeConnectingPoints(
      functionReferenceSpanEl,
      childrenFunctionBoxId
    );
    this.setSVGArrowAttributes(
      svgArrowSection,
      parentFunctionBoxId,
      childrenFunctionBoxId,
      x1,
      y1,
      x2,
      y2
    );
    drawIntoCanvas(svgArrowSection);
  }

  createSvgArrowSection() {
    let svgArrow = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    let svgID = generateUUID();
    svgArrow.setAttribute("id", svgID);
    svgArrow.classList.add("animateZoomIn");
    this.idToSVGHTMLElement[svgID] = svgArrow;
    return svgArrow;
  }

  computeConnectingPoints(functionReferenceSpanEl, childrenFunctionBoxId) {
    let childrenFunctionBoxEl =
      this.idToHtmlBox[childrenFunctionBoxId].htmlElement();
    let childrenFunctionBoxPosition = getDocumentRelativePosition(
      childrenFunctionBoxEl
    );
    let functionReferencePosition = getDocumentRelativePosition(
      functionReferenceSpanEl
    );

    let x1 = functionReferencePosition.right;
    let y1 =
      functionReferencePosition.top + functionReferencePosition.height / 2;
    let x2 =
      childrenFunctionBoxPosition.left + childrenFunctionBoxPosition.width / 2;

    // need to take into accoutn file name box height to ensure that the arrow lands at the correct spot
    let fileNameEl = childrenFunctionBoxEl.querySelector(".fileName");
    let y2 = childrenFunctionBoxPosition.top + fileNameEl.offsetHeight;
    return { x1, y1, x2, y2 };
  }

  updateParentChildrenRegister(
    parentFunctionBoxId,
    referenceHash,
    childrenFunctionBoxId,
    svg_id
  ) {
    let childrenRefAndFunctionBoxIdPair = new RefAndFunctionBoxIdPair(
      referenceHash,
      childrenFunctionBoxId,
      svg_id
    );
    this.parentFunctionBoxIdToChildrenRefAndFunctionBoxIdPairs[
      parentFunctionBoxId
    ] =
      this.parentFunctionBoxIdToChildrenRefAndFunctionBoxIdPairs[
        parentFunctionBoxId
      ] || [];
    this.parentFunctionBoxIdToChildrenRefAndFunctionBoxIdPairs[
      parentFunctionBoxId
    ].push(childrenRefAndFunctionBoxIdPair);

    this.childrenFunctionBoxIdToParentRefFunctionBoxIdPairs[
      childrenFunctionBoxId
    ] =
      this.childrenFunctionBoxIdToParentRefFunctionBoxIdPairs[
        childrenFunctionBoxId
      ] || [];
    this.childrenFunctionBoxIdToParentRefFunctionBoxIdPairs[
      childrenFunctionBoxId
    ].push(
      new RefAndFunctionBoxIdPair(referenceHash, parentFunctionBoxId, svg_id)
    );
  }

  setSVGArrowAttributes(svg, parentId, childrenId, x1, y1, x2, y2) {
    svg.innerHTML = ""; // Clear existing SVG contents
    let markerWidth = 10;
    let markerHeight = 7;
    // this is just to add the arrow tip definition to the svg lol idk why it has to be this complicated
    addArrowTipDefinitionToSvg(markerWidth, markerHeight, svg);

    // This is a hack, Bunch of constant to ensure that the arrow is drawn at correct position
    const DELTA = 3;
    const EPSILON = 45;
    const GAMMA = markerWidth + 5;

    if (x2 > x1) {
      let width, height, top, left;
      if (y2 < y1 || y2 - y1 < 100) {
        // in some cases, y2 > y1 (i.e. y2 - y1 < 100)
        if (y2 > y1) {
          width = Math.abs(x2 - x1) + 20;
          height = Math.abs(y1 - y2) + 100;

          top = y1 - 100;
          left = x1 - 10;
        } else {
          width = Math.abs(x2 - x1) + 20;
          height = Math.abs(y1 - y2) + 100;

          top = y2 - 100;
          left = x1 - 10;
        }

        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.style.position = "absolute";
        svg.style.top = top + "px";
        svg.style.left = left + "px";

        let svgIndexMapper = new SVGIndexMapper(top, left);

        let parentFunctionBox = this.idToHtmlBox[parentId];
        let childrenFunctionBox = this.idToHtmlBox[childrenId];

        let parentFunctionBoxPosition = getDocumentRelativePosition(
          parentFunctionBox.htmlElement()
        );

        let childrenFunctionBoxPosition = getDocumentRelativePosition(
          childrenFunctionBox.htmlElement()
        );

        // in some cases, y2 > y1 (i.e. y2 - y1 < 100)
        if (y2 > y1) {
          let svgIndexStart = svgIndexMapper.mapToSvgIndex(x1, y1);
          let svgIndexPivot = svgIndexMapper.mapToSvgIndex(
            (parentFunctionBoxPosition.right +
              childrenFunctionBoxPosition.left) /
              2,
            -999 /* This is actually irrelevant, we just need the converted x */
          );
          createLine(
            svg,
            /*x1=*/ svgIndexStart.x,
            /*y1=*/ svgIndexStart.y,
            /*x2=*/ svgIndexPivot.x,
            /*y2=*/ svgIndexStart.y,
            /*strokeWidth*/ 4,
            false
          );
          createLine(
            svg,
            /*x1=*/ svgIndexPivot.x,
            /*y1=*/ svgIndexStart.y,
            /*x2=*/ svgIndexPivot.x,
            /*y2=*/ DELTA,
            /*strokeWidth*/ 4,
            false
          );
          createLine(
            svg,
            /*x1=*/ svgIndexPivot.x,
            /*y1=*/ DELTA,
            /*x2=*/ width - GAMMA,
            /*y2=*/ DELTA,
            /*strokeWidth*/ 4,
            false
          );
          let svgIndexEnd = svgIndexMapper.mapToSvgIndex(
            (childrenFunctionBoxPosition.left +
              childrenFunctionBoxPosition.width) /
              2,
            childrenFunctionBoxPosition.top
          );
          createLine(
            svg,
            /*x1=*/ width - GAMMA,
            /*y1=*/ DELTA,
            /*x2=*/ width - GAMMA,
            /*y2=*/ svgIndexEnd.y,
            /*strokeWidth*/ 4,
            true
          );
        } else {
          let svgIndex = svgIndexMapper.mapToSvgIndex(
            (parentFunctionBoxPosition.right +
              childrenFunctionBoxPosition.left) /
              2,
            -999 /* This is actually irrelevant, we just need the converted x */
          );

          let pivotPoint = {
            x: svgIndex.x,
            y: height - DELTA,
          };
          createLine(
            svg,
            /*x1=*/ 0,
            /*y1=*/ height - DELTA,
            /*x2=*/ pivotPoint.x,
            /*y2=*/ pivotPoint.y,
            /*strokeWidth*/ 4,
            false
          );
          createLine(
            svg,
            /*x1=*/ pivotPoint.x,
            /*y1=*/ pivotPoint.y,
            /*x2=*/ pivotPoint.x,
            /*y2=*/ 5,
            /*strokeWidth*/ 4,
            false
          );
          createLine(
            svg,
            /*x1=*/ pivotPoint.x,
            /*y1=*/ 5,
            /*x2=*/ width - GAMMA,
            /*y2=*/ 5,
            /*strokeWidth*/ 4,
            false
          );

          svgIndex = svgIndexMapper.mapToSvgIndex(
            (childrenFunctionBoxPosition.left +
              childrenFunctionBoxPosition.width) /
              2,
            childrenFunctionBoxPosition.top
          );

          createLine(
            svg,
            /*x1=*/ width - GAMMA,
            /*y1=*/ 5,
            /*x2=*/ width - GAMMA,
            /*y2=*/ svgIndex.y,
            /*strokeWidth*/ 4,
            true
          );
        }
      } else if (y2 > y1) {
        let width = Math.abs(x2 - x1) + 20;
        let height = Math.abs(y2 - y1);
        let top = y1;
        let left = x1 - 10;

        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.style.position = "absolute";
        svg.style.top = top + "px";
        svg.style.left = left + "px";

        createLine(
          svg,
          /*x1=*/ 0,
          /*y1=*/ DELTA,
          /*x2=*/ width - GAMMA,
          /*y2=*/ DELTA,
          /*strokeWidth*/ 4,
          false
        );
        createLine(
          svg,
          /*x1=*/ width - GAMMA,
          /*y1=*/ DELTA,
          /*x2=*/ width - GAMMA,
          /*y2=*/ height - EPSILON > DELTA
            ? height - EPSILON
            : markerHeight / 2,
          /*strokeWidth*/ 4,
          true
        );
      }
    } else {
      // x2 < x1
      if (y2 < y1) {
        let width = Math.abs(x1 - x2) + 100;
        let height = Math.abs(y1 - y2) + 140;

        let top = y2 - 140;
        let left = x2;

        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.style.position = "absolute";
        svg.style.top = top + "px";
        svg.style.left = left + "px";

        let svgIndexMapper = new SVGIndexMapper(top, left);
        let svgIndex = svgIndexMapper.mapToSvgIndex(x1, y1);

        createLine(
          svg,
          /*x1=*/ svgIndex.x,
          /*y1=*/ svgIndex.y - DELTA,
          /*x2=*/ width - GAMMA,
          /*y2=*/ svgIndex.y - DELTA,
          /*strokeWidth*/ 4,
          false
        );
        createLine(
          svg,
          /*x1=*/ width - GAMMA,
          /*y1=*/ svgIndex.y - DELTA,
          /*x2=*/ width - GAMMA,
          /*y2=*/ EPSILON,
          /*strokeWidth*/ 4,
          false
        );
        createLine(
          svg,
          /*x1=*/ width - GAMMA,
          /*y1=*/ EPSILON,
          /*x2=*/ EPSILON,
          /*y2=*/ EPSILON,
          /*strokeWidth*/ 4,
          false
        );
        svgIndex = svgIndexMapper.mapToSvgIndex(x2, y2);
        createLine(
          svg,
          /*x1=*/ EPSILON,
          /*y1=*/ EPSILON,
          /*x2=*/ EPSILON,
          /*y2=*/ svgIndex.y - 40,
          /*strokeWidth*/ 4,
          true
        );
      } else if (y2 >= y1) {
        let width = Math.abs(x1 - x2) + 100;
        let height = Math.abs(y1 - y2);

        let top = y1;
        let left = x2;

        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.style.position = "absolute";
        svg.style.top = top + "px";
        svg.style.left = left + "px";

        let svgIndexMapper = new SVGIndexMapper(top, left);
        let svgIndex = svgIndexMapper.mapToSvgIndex(x1, y1);

        createLine(
          svg,
          /*x1=*/ svgIndex.x,
          /*y1=*/ svgIndex.y + DELTA,
          /*x2=*/ width - GAMMA,
          /*y2=*/ svgIndex.y + DELTA,
          /*strokeWidth*/ 4,
          false
        );
        createLine(
          svg,
          /*x1=*/ width - GAMMA,
          /*y1=*/ svgIndex.y + DELTA,
          /*x2=*/ width - GAMMA,
          /*y2=*/ height - 100,
          /*strokeWidth*/ 4,
          false
        );
        createLine(
          svg,
          /*x1=*/ width - GAMMA,
          /*y1=*/ height - 100,
          /*x2=*/ EPSILON,
          /*y2=*/ height - 100,
          /*strokeWidth*/ 4,
          false
        );
        createLine(
          svg,
          /*x1=*/ EPSILON,
          /*y1=*/ height - 100,
          /*x2=*/ EPSILON,
          /*y2=*/ height - EPSILON,
          /*strokeWidth*/ 4,
          true
        );
      }
    }
  }

  recomputeSVGArrowConnections(recentlyMovedBoxId) {
    let childrenRefAndFunctionBoxIdPairs =
      this.parentFunctionBoxIdToChildrenRefAndFunctionBoxIdPairs[
        recentlyMovedBoxId
      ];

    if (childrenRefAndFunctionBoxIdPairs) {
      for (let i = 0; i < childrenRefAndFunctionBoxIdPairs.length; i++) {
        let childrenRefAndFunctionBoxIdPair =
          childrenRefAndFunctionBoxIdPairs[i];
        this._recomputeSVGArrowConnections(
          recentlyMovedBoxId,
          childrenRefAndFunctionBoxIdPair.functionReferenceHash,
          childrenRefAndFunctionBoxIdPair.functionBoxId,
          childrenRefAndFunctionBoxIdPair.svgId
        );
      }
    }

    let parentRefAndFunctionBoxIdPairs =
      this.childrenFunctionBoxIdToParentRefFunctionBoxIdPairs[
        recentlyMovedBoxId
      ];

    if (parentRefAndFunctionBoxIdPairs) {
      for (let i = 0; i < parentRefAndFunctionBoxIdPairs.length; i++) {
        let parentRefAndFunctionBoxIdPair = parentRefAndFunctionBoxIdPairs[i];
        this._recomputeSVGArrowConnections(
          parentRefAndFunctionBoxIdPair.functionBoxId,
          parentRefAndFunctionBoxIdPair.functionReferenceHash,
          recentlyMovedBoxId,
          parentRefAndFunctionBoxIdPair.svgId
        );
      }
    }
  }

  removeConnection(parentId, childrenId) {
    let childBoxToRemove = this.idToHtmlBox[childrenId];
    if (childBoxToRemove == null) {
      throw new Error("childBoxToRemove is null, it's impossible");
    }

    this._removeSVGArrow(parentId, childrenId);

    // remove childBoxToRemove from parentToChildrens
    this.parentToChildrens[parentId] = this.parentToChildrens[parentId].filter(
      (childBox) => {
        return childBox.box_id !== childrenId;
      }
    );

    // remove parentBox from childrenToParents
    this.childrenToParents[childrenId] = this.childrenToParents[
      childrenId
    ].filter((parentBox) => {
      return parentBox.box_id !== parentId;
    });
  }

  _removeSVGArrow(parentId, childrenId) {
    let childrensOfParent = this.parentToChildrens[parentId];
    let svgIdToRemove = null;
    for (let i = 0; i < childrensOfParent.length; i++) {
      if (childrensOfParent[i].box_id === childrenId) {
        svgIdToRemove = childrensOfParent[i].svg_id;
        break;
      }
    }
    if (svgIdToRemove == null) {
      throw new Error("svgIdToRemove is null, it's impossible");
    }
    // remove svgIdToRemove from body
    let svgToRemove = document.getElementById(svgIdToRemove);
    svgToRemove.remove();
  }

  _recomputeSVGArrowConnections(parentId, referenceHash, childrenId, svgId) {
    let parentBoxElement = this.idToHtmlBox[parentId].htmlElement();
    let parentFunctionReferenceEl = parentBoxElement.querySelector(
      `[function-reference-hash="${referenceHash}"]`
    );
    let { x1, y1, x2, y2 } = this.computeConnectingPoints(
      parentFunctionReferenceEl,
      childrenId
    );

    let svg = document.getElementById(svgId);
    this.setSVGArrowAttributes(svg, parentId, childrenId, x1, y1, x2, y2);
  }

  // Implement later
  draw() {
    throw new Error("draw method is not implemented yet");
  }
}

// TODO (BUG): Ensure that TrackableState only contain data that is intended to be relevant GLOBALLY
export class TrackableState {
  constructor() {
    this.chosenVariableHighlightColor = new Set();
    this.variableDefinitionHashToStyle = {};
    this.cursorInsideHTMLBox = false;
  }
}

class HTMLBox {
  constructor(document, htmlBoxGraph, trackableState) {
    this.id_ = generateUUID();
    this._isDrawn = false;
    this.document = document;
    this.htmlBoxGraph = htmlBoxGraph;
    this.trackableState = trackableState;
  }

  id() {
    return this.id_;
  }

  htmlElement() {
    let toReturn = this.document.getElementById(this.id_);
    if (toReturn === null) {
      throw new Error(
        `Cannot find element with id = ${this.id_}. Maybe it's not drawn yet?`
      );
    }
    return toReturn;
  }

  // This funciton is used because sometimes we need to redraw the box only after we draw it the first time
  // (i.e. we want to position the box based on the width and height of the box)
  reDraw(left = 0, top = 0) {
    if (this._isDrawn) {
      this.removeHtmlElement(false);
      this._isDrawn = false;
    }
    return this.draw(left, top);
  }

  draw(left = 0, top = 0) {
    if (this._isDrawn) {
      throw new Error("Box is already drawn. Box can only be drawn once.");
    }
    let elem = this.constructHTMLElement(left, top);
    drawIntoCanvas(elem);
    this._isDrawn = true;
    return elem;
  }

  updateCursorInsideHtmlBoxFlag(elem) {
    let handleMouseOver = (event) => {
      this.trackableState.cursorInsideHTMLBox = true;
    };
    elem.addEventListener("mouseover", handleMouseOver.bind(this));

    let handleMouseOut = (event) => {
      this.trackableState.cursorInsideHTMLBox = false;
    };
    elem.addEventListener("mouseleave", handleMouseOut.bind(this));
  }

  async drawAsync(left = 0, top = 0) {
    if (this._isDrawn) {
      throw new Error("Box is already drawn. Box can only be drawn once.");
    }
    let htmlElement = await this.constructHTMLElementAsync(left, top);
    drawIntoCanvas(htmlElement);
    this._isDrawn = true;
    return htmlElement;
  }

  async constructHTMLElementAsync(left = 0, top = 0) {
    throw new Error("constructHTMLElement method must be implemented.");
  }

  constructHTMLElement(left = 0, top = 0) {
    throw new Error("constructHTMLElement method must be implemented.");
  }

  removeHtmlElement(animate = true) {
    if (animate) {
      this.htmlElement().classList.remove("animateZoomIn");
      this.htmlElement().classList.add("animateZoomOut");
      this.htmlElement().addEventListener("animationend", () => {
        this.htmlElement().remove();
      });
    } else {
      this.htmlElement().remove();
    }
    this.trackableState.cursorInsideHTMLBox = false;
  }

  shiftCanvasTowardsHtmlBox(htmlBox, anchor = { x: 500, y: 400 }) {
    // we will shift the canvas so that the functionMetadataBox is at the anchor
    // we will shift the canvas and change the scale to SCALE_TARGET
    const SCALE_TARGET = 0.5;

    let functionMetadataBoxPosition = getDocumentRelativePosition(
      htmlBox.htmlElement()
    );

    // box canvas pixel
    let bcpx = {
      x: functionMetadataBoxPosition.left,
      y: functionMetadataBoxPosition.top,
    };

    // canvas real pixel
    let crpx = {
      x: canvasTranslate().x,
      y: canvasTranslate().y,
    };

    // box real pixel
    let brpx = {
      x: bcpx.x * 0.5 + crpx.x,
      y: bcpx.y * 0.5 + crpx.y,
    };

    // real gap pixel
    let rGapx = brpx.x - crpx.x;
    let rGapy = brpx.y - crpx.y;

    // new canvas real pixel
    let nCrpx = { x: anchor.x - rGapx, y: anchor.y - rGapy };

    const canvas = document.querySelector(".canvas");
    canvas.style.transition = "transform 0.3s ease"; // Adjust duration and easing as needed
    canvas.style.transform = `translate(${nCrpx.x}px, ${nCrpx.y}px) scale(${SCALE_TARGET})`;

    // Add an event listener to remove the transition property after the animation is done
    function removeTransition() {
      canvas.style.transition = ""; // Remove the transition property
      canvas.removeEventListener("transitionend", removeTransition); // Remove the event listener
    }

    // Add an event listener to detect the end of the transition
    canvas.addEventListener("transitionend", removeTransition);
  }
}

export class CallHierarchySearchBoxGraph extends HTMLBox {
  constructor(
    document,
    htmlBoxGraph,
    trackableState,
    sourceFunctionDefinitionHash,
    sourceFunctionBoxId
  ) {
    super(document, htmlBoxGraph, trackableState);
    this.sourceFunctionDefinitionHash = sourceFunctionDefinitionHash;
    this.sourceFunctionBoxId = sourceFunctionBoxId;
    this.nodeMap = this.htmlBoxGraph.nodeMap;

    // maps callSectionId to {containingCodeSnippetIds[], nextCallSectionIds[]}
    this.callHierarchyTree = {};

    // maps codeSnippetId to callSectionId
    this.containedCodeSnippetIdToCallSectionId = {};

    // maps callSectionId to hostCallSectionId
    this.containedCallSectionIdToHostCallSectionId = {};

    this._hasValidSearchInput = false;

    document.addEventListener(
      "keydown",
      this._handleSearchGraphEnterKey.bind(this)
    );
  }

  async constructHTMLElementAsync(left = 0, top = 0) {
    this.functionDefinitionHashToLineNumberCodeTextItem = {};
    this.functionDefinitionNode =
      this.nodeMap[this.sourceFunctionDefinitionHash];

    let panelDiv = document.createElement("div");
    panelDiv.setAttribute("id", this.id_);
    panelDiv.classList.add("panel");
    panelDiv.classList.add("draggableBox");
    panelDiv.classList.add("animateZoomIn");

    let panelNav = document.createElement("div");
    panelNav.classList.add("panelNav");

    let panelNavItem = document.createElement("div");
    panelNavItem.classList.add("panelNavItem");
    panelNavItem.classList.add("panelNavItemSelected");
    let selectedBar = document.createElement("div");
    selectedBar.classList.add("selectedBar");
    let panelNavItemText = document.createElement("span");
    panelNavItemText.classList.add("panelNavItemText");
    panelNavItemText.innerHTML = "Call Hierarchy";
    panelNavItem.appendChild(selectedBar);
    panelNavItem.appendChild(panelNavItemText);
    panelNav.appendChild(panelNavItem);

    let panelNavItem2 = document.createElement("div");
    panelNavItem2.classList.add("panelNavItem");
    let selectedBar2 = document.createElement("div");
    selectedBar2.classList.add("selectedBar");
    let panelNavItemText2 = document.createElement("span");
    panelNavItemText2.classList.add("panelNavItemText");
    panelNavItemText2.innerHTML = "Search Graph";
    panelNavItem2.appendChild(selectedBar2);
    panelNavItem2.appendChild(panelNavItemText2);
    panelNav.appendChild(panelNavItem2);

    // add the "close icon" button into panelNav
    // Create an SVG element
    var closeIconButton = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    closeIconButton.classList.add("closeIconButton");
    closeIconButton.setAttribute("viewBox", "0 0 229 229");
    closeIconButton.innerHTML = `
      <g filter="url(#filter0_d_741_14)">
        <path d="M225 110.5C225 171.524 175.524 221 114.5 221C53.4764 221 4 171.524 4 110.5C4 49.4764 53.4764 0 114.5 0C175.524 0 225 49.4764 225 110.5Z" fill="#FFCE00"/>
      </g>
      <path d="M145.747 63.626L161.371 79.2507L83.2477 157.374L67.623 141.749L145.747 63.626Z" fill="#1F1F1F"/>
      <path d="M161.371 141.749L145.747 157.374L67.623 79.2507L83.2477 63.626L161.371 141.749Z" fill="#1F1F1F"/>
      <defs>
        <filter id="filter0_d_741_14" x="0" y="0" width="229" height="229" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="4"/>
          <feGaussianBlur stdDeviation="2"/>
          <feComposite in2="hardAlpha" operator="out"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_741_14"/>
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_741_14" result="shape"/>
        </filter>
      </defs>
    `;
    closeIconButton.addEventListener("click", (event) => {
      this.removeHtmlElement();
    });
    panelDiv.appendChild(closeIconButton);

    let panelFileNameAndFunctionName = document.createElement("div");
    panelFileNameAndFunctionName.classList.add("panelFileNameAndFunctionName");
    let panelFileName = document.createElement("div");
    panelFileName.classList.add("panelFileName");
    const uri = new URL(this.functionDefinitionNode.uri);
    panelFileName.innerHTML = uri.pathname.split("/").pop();

    let panelFunctionName = document.createElement("div");
    panelFunctionName.classList.add("panelFunctionName");
    let functionName = this.functionDefinitionNode.symbol.detail
      ? this.functionDefinitionNode.symbol.detail
      : this.functionDefinitionNode.symbol.name;

    let parentSymbolName = this.functionDefinitionNode.parentSymbol
      ? this.functionDefinitionNode.parentSymbol.name
      : "";
    if (parentSymbolName !== "") {
      functionName = parentSymbolName + "." + functionName;
    }
    panelFunctionName.innerHTML = functionName;

    panelFileNameAndFunctionName.appendChild(panelFileName);
    panelFileNameAndFunctionName.appendChild(panelFunctionName);

    let panelContentContainer = document.createElement("div");
    panelContentContainer.classList.add("panelContentContainer");
    panelContentContainer.style.height = panelDiv.style.height + "px";
    let panelContent = document.createElement("div");
    panelContent.classList.add("panelContent");
    panelContentContainer.appendChild(panelContent);

    await this._initCallHierarchyPanelContent(panelContent);

    panelNavItem.addEventListener("click", async (event) => {
      panelNavItem2.classList.remove("panelNavItemSelected");
      panelNavItem.classList.add("panelNavItemSelected");
      await this._initCallHierarchyPanelContent(panelContent);
    });
    panelNavItem2.addEventListener("click", async (event) => {
      panelNavItem.classList.remove("panelNavItemSelected");
      panelNavItem2.classList.add("panelNavItemSelected");
      await this._initSearchGraphPanelContent(panelContent);
    });

    panelDiv.appendChild(panelNav);
    panelDiv.appendChild(panelFileNameAndFunctionName);
    panelDiv.appendChild(panelContentContainer);
    panelDiv.style.left = `${left}px`;
    panelDiv.style.top = `${top}px`;

    this.updateCursorInsideHtmlBoxFlag(panelDiv);

    this._adjustLevellMargins();
    return panelDiv;
  }

  _searchFunction(searchFunctionInputValue, nodeMap) {
    let searchResult = [];
    for (const key in nodeMap) {
      let currentNode = nodeMap[key];
      if (currentNode.type_name_ != "function-definition") {
        continue;
      }
      if (currentNode.symbol.name.includes(searchFunctionInputValue)) {
        searchResult.push(currentNode);
      }
    }
    // cut off searchResult to 10
    searchResult = searchResult.slice(0, 5);
    return searchResult;
  }

  // TODO: This is just a temporary hack for the video demo
  async _handleSearchGraphEnterKey(event) {
    if (event.key !== "Enter" || !this._hasValidSearchInput) {
      return;
    }
    let drawInstructionList = [
      {
        defHash:
          "function-definition:file:///Users/fahrankamili/Projects/socrates-demo/index_demo.js:9:0",
        containedRefHashList: [
          "function-reference:file:///Users/fahrankamili/Projects/socrates-demo/index_demo.js:13:35",
        ],
      },
      {
        defHash:
          "function-definition:file:///Users/fahrankamili/Projects/socrates-demo/utils_demo.js:2:0",
        containedRefHashList: [
          "function-reference:file:///Users/fahrankamili/Projects/socrates-demo/utils_demo.js:92:24",
        ],
      },
    ];
    let currentAnchorFunctionMetadataBoxId = this.sourceFunctionBoxId;
    for (let i = drawInstructionList.length - 1; i >= 0; i--) {
      let drawInstruction = drawInstructionList[i];
      currentAnchorFunctionMetadataBoxId = await this._drawHTMLBox(
        currentAnchorFunctionMetadataBoxId,
        drawInstruction.defHash,
        drawInstruction.containedRefHashList,
        this.htmlBoxGraph
      );
    }
  }

  async _initSearchGraphPanelContent(panelContent) {
    panelContent.innerHTML = "";
    panelContent.classList.add("searchFunction");

    let searchFunctionInput = document.createElement("input");
    searchFunctionInput.classList.add("searchFunctionInput");
    searchFunctionInput.setAttribute("type", "text");
    searchFunctionInput.setAttribute("placeholder", "Search function");
    searchFunctionInput.addEventListener("input", async (event) => {
      // remove the existing searchFunctionSuggestionBox
      let searchFunctionSuggestionBox = panelContent.querySelector(
        ".searchFunctionSuggestionBox"
      );
      if (searchFunctionSuggestionBox !== null) {
        searchFunctionSuggestionBox.remove();
      }

      if (searchFunctionInput.value === "") {
        return;
      }

      this._hasValidSearchInput = true;
      let searchFunctionInputValue = searchFunctionInput.value;
      let searchResult = this._searchFunction(
        searchFunctionInputValue,
        this.nodeMap
      );

      searchFunctionSuggestionBox = document.createElement("div");
      searchFunctionSuggestionBox.classList.add("searchFunctionSuggestionBox");

      for (let i = 0; i < searchResult.length; i++) {
        let searchResultItem = searchResult[i];
        let suggestionItem = document.createElement("div");
        suggestionItem.classList.add("suggestionItem");
        if (i === 0) {
          suggestionItem.classList.add("selected");
        }

        let functionName = searchResultItem.symbol.name
          ? searchResultItem.symbol.name
          : "";

        if (functionName === "") {
          console.error("functionName is empty");
        }

        let suggestionItemFunctionName = document.createElement("span");
        suggestionItemFunctionName.classList.add("suggestionItemFunctionName");
        suggestionItemFunctionName.innerHTML = functionName;
        suggestionItem.appendChild(suggestionItemFunctionName);

        let suggestionItemFileName = document.createElement("span");
        suggestionItemFileName.classList.add("suggestionItemFileName");
        const uri = new URL(searchResultItem.uri);
        suggestionItemFileName.innerHTML = uri.pathname.split("/").pop();
        suggestionItem.appendChild(suggestionItemFileName);

        searchFunctionSuggestionBox.appendChild(suggestionItem);
      }

      if (searchResult.length > 0) {
        panelContent.appendChild(searchFunctionSuggestionBox);
      }
    });

    panelContent.appendChild(searchFunctionInput);
  }

  async _initCallHierarchyPanelContent(panelContent) {
    panelContent.innerHTML = "";
    let hostDefHashToContainedRefHashes =
      await this._populateFunctionDefinitionHashToLineNumberCodeTextItem(
        this.functionDefinitionNode
      );

    this.triangleSVGIDToFunctionDefinitionHash = {};

    for (const key in hostDefHashToContainedRefHashes) {
      let hostDefNode = this.nodeMap[key];
      let callSection = this._constructCallSection(
        hostDefNode,
        hostDefHashToContainedRefHashes,
        0
      );
      panelContent.appendChild(callSection);
    }
  }

  async _populateFunctionDefinitionHashToLineNumberCodeTextItem(
    functionDefinitionNode
  ) {
    // TODO: the bug must be functionDefinitionNode of "main" is not being populated properly
    let functionReferenceHashList =
      functionDefinitionNode.functionReferenceHashList;
    let hostDefHashToContainedRefHashes = {};

    for (let i = 0; i < functionReferenceHashList.length; i++) {
      let functionReferenceHash = functionReferenceHashList[i];
      let functionReferenceNode = this.nodeMap[functionReferenceHash];
      let hostFunctionDefinitionNode =
        this.nodeMap[functionReferenceNode.hostFunctionHash];
      if (hostFunctionDefinitionNode === undefined) {
        continue;
      }
      hostDefHashToContainedRefHashes[hostFunctionDefinitionNode.hashString] =
        hostDefHashToContainedRefHashes[
          hostFunctionDefinitionNode.hashString
        ] || [];
      hostDefHashToContainedRefHashes[
        hostFunctionDefinitionNode.hashString
      ].push(functionReferenceNode.hashString);
    }

    return hostDefHashToContainedRefHashes;
  }

  _constructCallSection(
    functionDefinitionNode,
    hostDefHashToContainedRefHashes,
    level
  ) {
    let callSection = document.createElement("div");
    callSection.classList.add("callSection");
    callSection.setAttribute("id", generateUUID());
    callSection.setAttribute(
      "definition-hash",
      functionDefinitionNode.hashString
    );
    // add attribute level="0"
    callSection.setAttribute("level", level);

    /* Construct triangle */
    let triangleSVG = this._constructTrangleSVG();
    this.triangleSVGIDToFunctionDefinitionHash[triangleSVG.id] =
      functionDefinitionNode.hashString;
    this._setupTriangleClickBehaviour(
      triangleSVG,
      hostDefHashToContainedRefHashes,
      this.triangleSVGIDToFunctionDefinitionHash,
      callSection.getAttribute("id")
    );
    callSection.appendChild(triangleSVG);

    /* Construct callSectionFileName */
    let callSectionFileName = document.createElement("div");
    callSectionFileName.classList.add("callSectionFileName");
    callSectionFileName.innerHTML = functionDefinitionNode.uri.split("/").pop();

    /* Construct callSectionFunctionName */
    let callSectionFunctionName = document.createElement("div");
    callSectionFunctionName.classList.add("callSectionFunctionName");
    let functionName = functionDefinitionNode.symbol.detail
      ? functionDefinitionNode.symbol.detail
      : functionDefinitionNode.symbol.name;
    let parentSymbolName = functionDefinitionNode.parentSymbol
      ? functionDefinitionNode.parentSymbol.name
      : "";
    callSectionFunctionName.innerHTML = functionName;
    if (parentSymbolName !== "") {
      callSectionFunctionName.innerHTML = parentSymbolName + "." + functionName;
    }
    callSection.appendChild(callSectionFileName);
    callSection.appendChild(callSectionFunctionName);
    return callSection;
  }

  _adjustLevellMargins() {
    let callHierarchiItems = document.querySelectorAll(
      ".codeSnippet, .callSection"
    );
    for (let i = 0; i < callHierarchiItems.length; i++) {
      let callSection = callHierarchiItems[i];
      let level = parseInt(callSection.getAttribute("level"));
      callSection.style.marginLeft = level * 20 + "px";
    }
  }

  _setupTriangleClickBehaviour(
    triangleSVGElement,
    hostDefHashToContainedRefHashes,
    triangleSVGIDToFunctionDefinitionHash,
    callSectionId
  ) {
    triangleSVGElement.addEventListener("click", async (event) => {
      triangleSVGElement.classList.toggle(
        "callHierarchyContainerArrowIconSelected"
      );
      if (
        triangleSVGElement.classList.contains(
          "callHierarchyContainerArrowIconSelected"
        )
      ) {
        let hostDefHash =
          triangleSVGIDToFunctionDefinitionHash[
            triangleSVGElement.getAttribute("id")
          ];
        let hostDivRow = triangleSVGElement.parentElement;
        let hostDivRowLevel = parseInt(hostDivRow.getAttribute("level"));
        let containedRefHashList = hostDefHashToContainedRefHashes[hostDefHash];
        let codeSnippetsAndCallSectionContainer = document.createElement("div");
        codeSnippetsAndCallSectionContainer.classList.add(
          "codeSnippetsAndCallSectionContainer"
        );

        let containingCodeSnippetIds = [];
        for (let i = 0; i < containedRefHashList.length; i++) {
          let containedRefHash = containedRefHashList[i];
          let lineNumberCodeTextItem = await LineNumberCodeTextItem.fromRefNode(
            this.nodeMap[containedRefHash]
          );
          let codeSnippetSection = document.createElement("div");
          codeSnippetSection.setAttribute("id", generateUUID());
          codeSnippetSection.classList.add("codeSnippet");
          codeSnippetSection.setAttribute(
            "function-reference-hash",
            containedRefHash
          );
          containingCodeSnippetIds.push(codeSnippetSection.getAttribute("id"));
          codeSnippetSection.setAttribute("level", hostDivRowLevel + 1);
          let lineNumber = document.createElement("div");
          lineNumber.classList.add("codeLineNumber");
          lineNumber.innerHTML = lineNumberCodeTextItem.lineNumber;
          let codeText = document.createElement("div");
          codeText.classList.add("codeSnippetCodeText");
          codeText.innerHTML = lineNumberCodeTextItem.codeText;
          let addButton = document.createElement("div");
          addButton.classList.add("addButton");
          addButton.innerHTML = "Add";

          this._setupAddButtonBehaviour(
            addButton,
            codeSnippetSection.getAttribute("id"),
            hostDefHash,
            containedRefHash,
            this.sourceFunctionBoxId,
            this.htmlBoxGraph
          );

          codeSnippetSection.appendChild(lineNumber);
          codeSnippetSection.appendChild(codeText);
          codeSnippetSection.appendChild(addButton);
          codeSnippetsAndCallSectionContainer.appendChild(codeSnippetSection);
        }

        let referenceHashList =
          this.nodeMap[hostDefHash].functionReferenceHashList;

        let innerFunctionDefinitionHashToLineNumberCodeTextItem =
          await this._populateFunctionDefinitionHashToLineNumberCodeTextItem(
            this.nodeMap[hostDefHash]
          );

        let hostFunctionHashToRender = new Set();
        for (let i = 0; i < referenceHashList.length; i++) {
          let referenceHash = referenceHashList[i];
          let hostFunctionHash = this.nodeMap[referenceHash].hostFunctionHash;
          if (hostFunctionHash == "null_main") {
            continue;
          }
          hostFunctionHashToRender.add(hostFunctionHash);
        }

        let nextCallSectionIds = [];
        for (const key of hostFunctionHashToRender) {
          let definitionNode = this.nodeMap[key];
          let callSection = this._constructCallSection(
            definitionNode,
            innerFunctionDefinitionHashToLineNumberCodeTextItem,
            hostDivRowLevel + 1
          );
          nextCallSectionIds.push(callSection.getAttribute("id"));
          codeSnippetsAndCallSectionContainer.appendChild(callSection);
        }

        this._updateCallHierarchyTree(
          callSectionId,
          containingCodeSnippetIds,
          nextCallSectionIds
        );

        hostDivRow.insertAdjacentElement(
          "afterend",
          codeSnippetsAndCallSectionContainer
        );
        this._adjustLevellMargins();
      } else {
        let codeSnippetsAndCallSectionContainer =
          triangleSVGElement.parentElement.nextSibling;
        codeSnippetsAndCallSectionContainer.remove();
      }
    });
  }

  _updateCallHierarchyTree(
    callSectionId,
    containingCodeSnippetIds,
    nextCallSectionIds
  ) {
    this.callHierarchyTree[callSectionId] = this.callHierarchyTree[
      callSectionId
    ] || {
      containingCodeSnippetIds: [],
      nextCallSectionIds: [],
    };
    for (let codeSnippetId of containingCodeSnippetIds) {
      this.callHierarchyTree[callSectionId].containingCodeSnippetIds.push(
        codeSnippetId
      );
      this.containedCodeSnippetIdToCallSectionId[codeSnippetId] = callSectionId;
    }
    for (let nextCallSectionId of nextCallSectionIds) {
      this.callHierarchyTree[callSectionId].nextCallSectionIds.push(
        nextCallSectionId
      );
      this.containedCallSectionIdToHostCallSectionId[nextCallSectionId] =
        callSectionId;
    }
  }

  _findDefFunctionMetadataBoxId(
    hostDefHash,
    sourceFunctionMetadataBoxId,
    htmlBoxGraph
  ) {
    // trace up starting from sourceFunctionMetataBoxId until we find a box with hostDefHash
    let currentBoxId = sourceFunctionMetadataBoxId;
    let circuitBreaker = 0;
    while (currentBoxId) {
      if (circuitBreaker++ > 100) {
        throw new Error("circuitBreaker triggered");
      }
      let parentBoxIdItems = htmlBoxGraph.getParentBoxIdItems(currentBoxId);
      for (let i = 0; i < parentBoxIdItems.length; i++) {
        let parentBoxIdItem = parentBoxIdItems[i];
        let box = htmlBoxGraph.getBox(parentBoxIdItem.box_id);
        if (
          box.type == "FunctionMetadataBox" &&
          parentBoxIdItem.box_id === hostDefHash
        ) {
          return currentBoxId;
        }
      }
      if (parentBoxIdItems.length > 0) {
        currentBoxId = parentBoxIdItems[0].box_id;
      } else {
        currentBoxId = null;
      }
    }
    return null;
  }

  _computeCenterPosition(relevantCodeBoxes) {
    let left = 0;
    let top = 0;
    for (let i = 0; i < relevantCodeBoxes.length; i++) {
      let relevantCodeBox = relevantCodeBoxes[i];
      let relevantCodeBoxPosition = getDocumentRelativePosition(
        relevantCodeBox.htmlElement()
      );
      left += relevantCodeBoxPosition.left;
      top = max(relevantCodeBoxPosition.bottom, top);
    }
    left /= relevantCodeBoxes.length;
    return { left: left, top: top + 30 };
  }

  /* 
    Draws the FunctionBox with function definition hash equals to `defHash`
    and it will connect the new FunctionBox to the FunctionBox with id of anchorFunctionBoxId
    with the containedRefHashList as the references that connects the two FunctionBoxes
  */
  async _drawHTMLBox(
    anchorFunctionBoxId,
    defHash,
    containedRefHashList,
    htmlBoxGraph
  ) {
    let functionBox = await getFunctionBox(
      document,
      htmlBoxGraph,
      this.trackableState,
      defHash,
      new Set(containedRefHashList)
    );
    let anchorFunctionBoxPosition = getDocumentRelativePosition(
      htmlBoxGraph.getBox(anchorFunctionBoxId).htmlElement()
    );

    functionBox.draw(
      anchorFunctionBoxPosition.left,
      anchorFunctionBoxPosition.top
    );
    let functionBoxPosition = getDocumentRelativePosition(
      functionBox.htmlElement()
    );
    functionBox.reDraw(
      anchorFunctionBoxPosition.left - 100 - functionBoxPosition.width,
      anchorFunctionBoxPosition.top - 300
    );

    htmlBoxGraph.addBox(functionBox);
    injectDraggingBehaviour(document, functionBox.htmlElement(), htmlBoxGraph);

    for (let i = 0; i < containedRefHashList.length; i++) {
      // get the span inside the funtionBox with `function-reference-hash` = `refHash`
      let functionReferenceSpanEl = htmlBoxGraph
        .getBox(functionBox.id())
        .htmlElement()
        .querySelector(
          `[function-reference-hash="${containedRefHashList[i]}"]`
        );
      this.htmlBoxGraph.connectTwoFunctionBox(
        functionBox.id(),
        functionReferenceSpanEl,
        anchorFunctionBoxId
      );
    }
    return functionBox.id();
  }

  _findNextSection(codeSnippetId) {
    let hostCallSectionId =
      this.containedCallSectionIdToHostCallSectionId[
        this.containedCodeSnippetIdToCallSectionId[codeSnippetId]
      ];
    if (!hostCallSectionId) {
      return { hostCallSectionId: null, containedCodeSnippetIds: null };
    }
    let containedCodeSnippetIds =
      this.callHierarchyTree[hostCallSectionId].containingCodeSnippetIds;
    return {
      hostCallSectionId: hostCallSectionId,
      containedCodeSnippetIds: containedCodeSnippetIds,
    };
  }

  _setupAddButtonBehaviour(
    addButton,
    hostCodeSnippetId,
    hostDefHash,
    containedRefHash,
    sourceFunctionBoxId,
    htmlBoxGraph
  ) {
    addButton.addEventListener("click", async (event) => {
      const drawInstructionList = this._collectDrawInstructions(
        hostCodeSnippetId,
        hostDefHash,
        containedRefHash
      );

      await this._processDrawInstructions(
        drawInstructionList,
        sourceFunctionBoxId,
        htmlBoxGraph
      );
    });
  }

  /* This collects the Draw Insturctions from the relevant call hierarchy that the user want to draw */
  _collectDrawInstructions(hostCodeSnippetId, hostDefHash, containedRefHash) {
    let currentHostDefHash = hostDefHash;
    let currentContainedRefHashList = [containedRefHash];
    let currentHostCodeSnippetIds = [hostCodeSnippetId];
    let drawInstructionList = [];

    while (currentHostCodeSnippetIds.length > 0) {
      drawInstructionList.push(
        new CallHierarchyDrawInstruction(
          currentHostDefHash,
          currentContainedRefHashList
        )
      );

      let next = this._findNextSection(currentHostCodeSnippetIds[0]);
      if (!next.hostCallSectionId) {
        break;
      }

      currentHostCodeSnippetIds = next.containedCodeSnippetIds;
      let nextHostDefHash = document
        .getElementById(next.hostCallSectionId)
        .getAttribute("definition-hash");

      let nextContainedRefHashList = [];
      for (let codeSnippetId of next.containedCodeSnippetIds) {
        let codeSnippet = document.getElementById(codeSnippetId);
        nextContainedRefHashList.push(
          codeSnippet.getAttribute("function-reference-hash")
        );
      }
      currentHostDefHash = nextHostDefHash;
      currentContainedRefHashList = nextContainedRefHashList;
    }

    return drawInstructionList;
  }

  /* This draw the relevant FunctionBoxes into the canvas based on the Draw Instructions*/
  async _processDrawInstructions(
    drawInstructionList,
    sourceFunctionBoxId,
    htmlBoxGraph
  ) {
    let currentAnchorFunctionBoxId = sourceFunctionBoxId;

    for (let i = drawInstructionList.length - 1; i >= 0; i--) {
      let drawInstruction = drawInstructionList[i];
      currentAnchorFunctionBoxId = await this._drawHTMLBox(
        currentAnchorFunctionBoxId,
        drawInstruction.defHash,
        drawInstruction.containedRefHashList,
        htmlBoxGraph
      );

      if (i === drawInstructionList.length - 1) {
        this.shiftCanvasTowardsHtmlBox(
          this.htmlBoxGraph.idToHtmlBox[currentAnchorFunctionBoxId],
          { x: 500, y: 100 }
        );
      }
    }
  }

  _constructTrangleSVG() {
    const triangleSVG = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    triangleSVG.setAttribute("id", generateUUID());
    triangleSVG.setAttribute("class", "callHierarchyContainerArrowIcon");
    triangleSVG.setAttribute("viewBox", "0 0 20 24");
    triangleSVG.setAttribute("fill", "none");

    // Create the path element
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M19.9962 11.6816L0.777791 23.4143L0.226247 0.904345L19.9962 11.6816Z"
    );
    path.setAttribute("fill", "#5D5D5D");

    // Append the path to the SVG
    triangleSVG.appendChild(path);
    return triangleSVG;
  }
}

class CallHierarchyGraphModificationInstruction {
  constructor(defFunctionMetadataBoxId, containedRefHashList) {
    this.defFunctionMetadataBoxId = defFunctionMetadataBoxId;
    this.containedRefHashList = containedRefHashList;
  }
}

class CallHierarchyDrawInstruction {
  constructor(defHash, containedRefHashList) {
    this.defHash = defHash;
    this.containedRefHashList = containedRefHashList;
  }
}

class LineNumberCodeTextItem {
  static async fromRefNode(refNode) {
    let functionReferenceLine = refNode.location.range.start.line;
    let firstLineCodeText = await getCodeContent(
      refNode,
      functionReferenceLine
    );
    return new LineNumberCodeTextItem(functionReferenceLine, firstLineCodeText);
  }

  constructor(lineNumber, codeText) {
    this.lineNumber = lineNumber;
    this.codeText = codeText;
  }
}

class FileNameBox extends HTMLBox {
  constructor(document, htmlBoxGraph, fileName, trackableState) {
    super(document, htmlBoxGraph, trackableState);
    // grab the file name from the uri
    const uri = new URL(fileName);
    this.fileName = uri.pathname.split("/").pop();
  }

  constructHTMLElement(left = 0, top = 0) {
    const fileNameDiv = document.createElement("div");
    fileNameDiv.setAttribute("id", this.id_);
    fileNameDiv.classList.add("fileName");
    fileNameDiv.innerHTML = this.fileName;
    return fileNameDiv;
  }
}

class CodeBoxState {
  constructor(
    functionReferenceNodes,
    variableDefinitionNodes,
    variableReferenceNodes,
    nestedFunctionDefinitionNodes,
    highlightedFunctionReferenceHash = null,
    boxOrder = 1
  ) {
    this.functionReferenceNodes = functionReferenceNodes;
    this.variableDefinitionNodes = variableDefinitionNodes;
    this.variableReferenceNodes = variableReferenceNodes;
    this.nestedFunctionDefinitionNodes = nestedFunctionDefinitionNodes;
    if (highlightedFunctionReferenceHash === null) {
      this.highlightedFunctionReferenceHash = new Set();
    } else {
      this.highlightedFunctionReferenceHash = highlightedFunctionReferenceHash;
    }
    this.boxOrder = boxOrder;
  }
}

export class FunctionBox extends HTMLBox {
  constructor(
    document,
    htmlBoxGraph,
    trackableState,
    defHash,
    functionNameOrSignature,
    fileNameBox,
    rawCodeText,
    codeStartLocation,
    codeBoxState
  ) {
    super(document, htmlBoxGraph, trackableState);
    this.type = "FunctionBox";
    this.fileNameBox = fileNameBox;
    this.functionNameOrSignature = functionNameOrSignature;
    this.defHash = defHash;
    console.log(
      `in functionBox constructor, codeStartLocation: ${JSON.stringify(
        codeStartLocation
      )}`
    );
    codeStartLocation.character = 0;
    this.codeStartLocation = codeStartLocation;
    this.rawCodeText = rawCodeText;
    this.nodeMap = htmlBoxGraph.nodeMap;
    /** @type {CodeBoxState} */
    this.codeBoxState = codeBoxState;

    this.nodeMap = htmlBoxGraph.nodeMap;

    // this.codeHighlightSpanCoordinatesLayer =
    //   this._constructHighlightedSpanCoordinatesLayer(this.rawCodeText);
    this.codeHighlightSpanCoordinatesLayer = [];

    this.functionReferenceSpanCoordinatesLayer =
      constructSpanCoordinatesFromNodes(
        "function-reference",
        this.rawCodeText,
        this.codeBoxState.functionReferenceNodes,
        this.trackableState.variableDefinitionHashToStyle,
        codeStartLocation
      );

    this.variableDefinitionSpanCoordinatesLayer =
      constructSpanCoordinatesFromNodes(
        "variable-definition",
        this.rawCodeText,
        this.codeBoxState.variableDefinitionNodes,
        this.trackableState.variableDefinitionHashToStyle,
        codeStartLocation
      );

    this.variableReferenceSpanCoordinatesLayer =
      constructSpanCoordinatesFromNodes(
        "variable-reference",
        this.rawCodeText,
        this.codeBoxState.variableReferenceNodes,
        this.trackableState.variableDefinitionHashToStyle,
        codeStartLocation
      );

    this.divLineWrapperLayer = this._constructDivWrapperCoordinatesLayer(
      this.rawCodeText
    );

    this._markNestedFunctionContentAsHiddenDiv(
      this.rawCodeText,
      this.codeBoxState.nestedFunctionDefinitionNodes,
      codeStartLocation,
      this.divLineWrapperLayer
    );
  }

  constructHTMLElement(left = 0, top = 0) {
    let functionBox = document.createElement("div");
    functionBox.setAttribute("id", this.id_);
    functionBox.classList.add("functionBox");
    functionBox.classList.add("draggableBox");
    functionBox.style.left = left + "px";
    functionBox.style.top = top + "px";
    functionBox.appendChild(this.constructFunctionMetadataBox(left, top));
    functionBox.appendChild(this.constructCodeBox(left, top));
    return functionBox;
  }

  checkOverflow(el) {
    var curOverflow = el.style.overflow;

    if (!curOverflow || curOverflow === "visible") el.style.overflow = "hidden";

    var isOverflowing =
      el.clientWidth < el.scrollWidth || el.clientHeight < el.scrollHeight;

    const OVERFLOWING_THRESHOLD = 10;

    var isOverflowing =
      el.scrollWidth - el.clientWidth > OVERFLOWING_THRESHOLD ||
      el.scrollHeight - el.clientHeight > OVERFLOWING_THRESHOLD;

    el.style.overflow = curOverflow;

    return isOverflowing;
  }

  constructFunctionMetadataBox() {
    const functionMetadataBox = document.createElement("div");
    functionMetadataBox.setAttribute("id", this.id_);
    functionMetadataBox.classList.add("functionMetadataBox");
    functionMetadataBox.classList.add("animateZoomIn");
    functionMetadataBox.classList.add("float");
    // functionMetadataBox.style.left = `${left}px`;
    // functionMetadataBox.style.top = `${top}px`;

    functionMetadataBox.appendChild(this.fileNameBox.constructHTMLElement());

    const functionNameDiv = document.createElement("div");
    functionNameDiv.classList.add("functionNameBox");
    const functionSignatureDiv = document.createElement("div");
    functionSignatureDiv.classList.add("functionSignature");
    functionSignatureDiv.innerHTML = this.functionNameOrSignature;
    if (DEBUG_MODE) {
      let positionDebuggingDiv = document.createElement("div");
      positionDebuggingDiv.classList.add("positionDebuggingDiv");
      positionDebuggingDiv.innerHTML = `${left}px, ${top}px`;
      functionSignatureDiv.appendChild(positionDebuggingDiv);
    }

    functionSignatureDiv.addEventListener("click", async (event) => {
      let callHierarchySearchBoxGraph = new CallHierarchySearchBoxGraph(
        document,
        this.htmlBoxGraph,
        this.trackableState,
        /*sourceFunctionHash*/ this.defHash,
        /*sourceFunctionMetadataCodeBoxId*/ this.id_
      );
      let currentFunctionMetadataBoxPosition = getDocumentRelativePosition(
        this.htmlElement()
      );
      await callHierarchySearchBoxGraph.drawAsync(
        currentFunctionMetadataBoxPosition.left - 1045,
        currentFunctionMetadataBoxPosition.top
      );
      injectDraggingBehaviour(
        document,
        callHierarchySearchBoxGraph.htmlElement(),
        this.htmlBoxGraph
      );
    });

    functionNameDiv.appendChild(functionSignatureDiv);
    functionMetadataBox.appendChild(functionNameDiv);
    return functionMetadataBox;
  }

  constructCodeBox() {
    const codeBoxEl = document.createElement("div");

    codeBoxEl.setAttribute("id", this.id_);
    codeBoxEl.classList.add("codeBox");
    codeBoxEl.classList.add("animateZoomIn");
    codeBoxEl.classList.add("float");

    /* construct codeBoxInnerContainer */
    const codeBoxInnerContainer = document.createElement("div");
    codeBoxInnerContainer.classList.add("codeBoxInnerContainer");

    /* construct codeText */
    const codeTextElement = document.createElement("div");
    codeTextElement.classList.add("codeText");
    codeTextElement.innerHTML = this._constructCodeTextHTML(this.rawCodeText, [
      this.divLineWrapperLayer,
      this.codeHighlightSpanCoordinatesLayer,
      this.functionReferenceSpanCoordinatesLayer,
      this.variableDefinitionSpanCoordinatesLayer,
      this.variableReferenceSpanCoordinatesLayer,
    ]);

    const functionReferenceEls =
      codeTextElement.querySelectorAll(".functionReference");
    functionReferenceEls.forEach((functionReferenceEl) => {
      let bindedFunction = this._handleFunctionReferenceClick.bind(
        this,
        functionReferenceEl
      );
      functionReferenceEl.addEventListener("click", bindedFunction);

      let functionReferenceHash = functionReferenceEl.getAttribute(
        "function-reference-hash"
      );
      if (
        this.codeBoxState.highlightedFunctionReferenceHash.has(
          functionReferenceHash
        )
      ) {
        functionReferenceEl.classList.add("functionReferenceGlowing");
      }
    });

    const variableTags = codeTextElement.querySelectorAll(
      ".variableDefinition, .variableReference"
    );
    variableTags.forEach((variableTag) => {
      let bindedFunction = this._handleVariableReferenceClick.bind(
        this,
        variableTag,
        this.id(),
        codeTextElement,
        this.document,
        this.htmlBoxGraph
      );
      variableTag.addEventListener("click", bindedFunction);

      let handleVariableReferenceHoverBinded =
        this._handleVariableReferenceHover.bind(this, variableTag);

      let hoverTimeout;
      variableTag.addEventListener("mouseover", () => {
        // unless the variable is already highlighted,
        //  we require the mouse to be hovering for 200ms before we show the hover or else it will be annoying
        hoverTimeout = setTimeout(
          handleVariableReferenceHoverBinded,
          variableTag.classList.contains("highlight") ? 0 : 200
        );
      });
      variableTag.addEventListener("mouseout", () => {
        clearTimeout(hoverTimeout);
      });
    });

    /* construct codeLineNums */
    const codeLineNums = document.createElement("div");
    codeLineNums.classList.add("codeLineNums");
    codeLineNums.innerHTML = this._constructCodeLineNumsHTML(
      this.divLineWrapperLayer,
      this.codeStartLocation.line + 1
    );
    codeBoxInnerContainer.appendChild(codeLineNums);
    codeBoxInnerContainer.appendChild(codeTextElement);
    codeBoxEl.appendChild(codeBoxInnerContainer);

    if (DEBUG_MODE) {
      let positionDebuggingDiv = document.createElement("div");
      positionDebuggingDiv.classList.add("positionDebuggingDiv");
      positionDebuggingDiv.innerHTML = `${left}px, ${top}px`;
      codeBoxEl.appendChild(positionDebuggingDiv);
    }

    return codeBoxEl;
  }

  async _handleVariableReferenceHover(variableReferenceEl, event) {
    // disable variable ref hover when  color picker is in the DOM
    //   because it distrupt the user experience
    if (document.getElementById("colorPickerBoxId") !== null) {
      return;
    }
    unGlowSameColorVariableReference();
    removeAllHoverHighlight();

    // check if variableReferenceEl has class of highlight?
    if (variableReferenceEl.classList.contains("highlight")) {
      // get the color of the variableReferenceEl
      glowSameColorVariableReference(
        rgbToHex(variableReferenceEl.style.backgroundColor)
      );
    } else {
      hoverHighlightRelatedVariables(variableReferenceEl);
    }
  }

  async _handleVariableReferenceClick(
    variableReferenceEl,
    codeBoxId,
    codeTextElement,
    document,
    htmlBoxGraph,
    event
  ) {
    // needed so that we can remove colorPicker when we click outside of colorPicker
    event.stopPropagation();

    if (
      document.querySelector(".colorPickerAndHighlightedVariableBoxContainer")
    ) {
      document
        .querySelector(".colorPickerAndHighlightedVariableBoxContainer")
        .remove();
    }

    const colorPickerBox = new ColorPickerBox(
      this.document,
      this.htmlBoxGraph,
      this.trackableState,
      variableReferenceEl,
      codeTextElement
    );
    colorPickerBox.draw(event.clientX, event.clientY);
  }

  async _handleFunctionReferenceClick(functionReferenceSpanEl, event) {
    let functionDefinitionHash = functionReferenceSpanEl.getAttribute(
      "function-definition-hash"
    );

    let functionBox = await getFunctionBox(
      document,
      this.htmlBoxGraph,
      this.trackableState,
      functionDefinitionHash
    );

    let functionReferencePosition =
      functionReferenceSpanEl.getBoundingClientRect();

    let hostCodeBoxPosition = getDocumentRelativePosition(this.htmlElement());
    functionBox.draw(
      hostCodeBoxPosition.right + 100,
      (functionReferencePosition.bottom - canvasTranslate().y) / canvasScale() +
        100
    );

    let functionBoxPosition = getDocumentRelativePosition(
      functionBox.htmlElement()
    );

    // TODO: This might not work properly yet
    this.htmlBoxGraph.addBox(functionBox);
    injectDraggingBehaviour(
      document,
      functionBox.htmlElement(),
      this.htmlBoxGraph
    );

    this.htmlBoxGraph.connectTwoFunctionBox(
      // TODO: This WON'T WORK until we combine FunctionMetadataBox and CodeBox into FunctionBox
      this.id(),
      functionReferenceSpanEl,
      functionBox.id()
    );
    shiftCanvasTowardsHtmlBox(functionBox);
    functionReferenceSpanEl.classList.add("functionReferenceGlowing");
  }

  _constructCodeLineNumsHTML(divLineWrapperLayer, codeStartingLine) {
    let line = codeStartingLine;
    let codeLineNumsHTML = "";
    for (let i = 0; i < divLineWrapperLayer.length; i++) {
      if (divLineWrapperLayer[i].type === "opening") {
        let divTag = divLineWrapperLayer[i].tag;
        // check if divTag have a class of "hidden"
        if (divTag.indexOf("hidden") !== -1) {
          continue;
        }
        codeLineNumsHTML += `<div class="lineNum">${line}</div>`;
      }
      line++;
    }
    return codeLineNumsHTML;
  }

  _constructCodeTextHTML(rawCodeText, layers) {
    function escapeSpecialCharacters(inputString) {
      return inputString.replace(/[&<>"'\/ ]/g, function (match) {
        switch (match) {
          case "&":
            return "&amp;";
          case "<":
            return "&lt;";
          case ">":
            return "&gt;";
          case '"':
            return "&quot;";
          case "'":
            return "&#39;";
          case "/":
            return "&#x2F;";
          case " ":
            return "&nbsp;"; // Replace space with non-breaking space entity
          default:
            return match;
        }
      });
    }

    function getTagName(tag) {
      const match = tag.match(/^<\s*([\w-]+)/);
      return match ? match[1] : null;
    }

    function combineTag(tag1, tag2) {
      if (getTagName(tag1) !== getTagName(tag2)) {
        throw new Error("tag names are not the same");
      }

      if (getTagName(tag1) === null || getTagName(tag2) === null) {
        return;
      }

      // Create temporary elements to parse the tags
      const tempDiv1 = document.createElement("div");
      const tempDiv2 = document.createElement("div");

      const tagName = getTagName(tag1);

      let tag1Temp = tag1 + `</${tagName}>`;
      let tag2Temp = tag2 + `</${tagName}>`;

      tempDiv1.innerHTML = tag1Temp;
      tempDiv2.innerHTML = tag2Temp;

      const tag1HtmlTemp = tempDiv1.querySelector(tagName);
      const tag2HtmlTemp = tempDiv2.querySelector(tagName);

      const mergedClasses = [
        ...tag1HtmlTemp.classList,
        ...tag2HtmlTemp.classList,
      ];

      // Create the combined element
      const combinedSpan = document.createElement(tagName);
      for (const className of mergedClasses) {
        combinedSpan.classList.add(className);
      }

      // Set the attributes on the combined element
      const attributes1 = tag1HtmlTemp.attributes;
      const attributes2 = tag2HtmlTemp.attributes;

      for (const attribute of attributes1) {
        if (attribute.name === "class") {
          continue;
        }
        combinedSpan.setAttribute(attribute.name, attribute.value);
      }

      for (const attribute of attributes2) {
        if (attribute.name === "class") {
          continue;
        }
        combinedSpan.setAttribute(attribute.name, attribute.value);
      }

      // Construct the opening tag string
      let openingTag = `<${tagName}`;
      for (const attribute of combinedSpan.attributes) {
        openingTag += ` ${attribute.name}="${attribute.value}"`;
      }
      openingTag += ">";

      return openingTag;
    }

    function setOrCombineTag(indexToTagMap, tagCoordinate) {
      indexToTagMap[tagCoordinate.index] =
        indexToTagMap[tagCoordinate.index] || [];
      let tagsInIndex = indexToTagMap[tagCoordinate.index];
      for (let i = 0; i < tagsInIndex.length; i++) {
        let tag_i = tagsInIndex[i];
        if (
          tagCoordinate.type != "closing" &&
          getTagName(tag_i) == getTagName(tagCoordinate.tag)
        ) {
          // if we found a tag with the same tag name, we combine them and return
          tagsInIndex[i] = combineTag(tag_i, tagCoordinate.tag);
          return;
        }
      }
      tagsInIndex.push(tagCoordinate.tag);
    }

    function constructIndexToTagsMap(layers) {
      let indexToTagsMap = new Map();
      for (let i = 0; i < layers.length; i++) {
        for (let j = 0; j < layers[i].length; j++) {
          let currentTagCoordinate = layers[i][j];
          setOrCombineTag(indexToTagsMap, currentTagCoordinate);
        }
      }
      return indexToTagsMap;
    }

    let indexToTagsMap = constructIndexToTagsMap(layers);

    let codeTextHTML = "";
    for (let i = 0; i < rawCodeText.length; i++) {
      let currentChar = rawCodeText[i];
      let tags = indexToTagsMap["" + i];
      if (tags) {
        // if the only character in the line is just a new line character. This is very hacky but works
        const isOnlyEmptyLine =
          tags.length == 2 &&
          tags[0] == `<div class="codeLine">` &&
          tags[1] == "</div>" &&
          currentChar == "\n";
        if (isOnlyEmptyLine) {
          codeTextHTML += tags[0];
          codeTextHTML += "&nbsp;";
          codeTextHTML += tags[1];
        } else {
          for (let j = 0; j < tags.length; j++) {
            codeTextHTML += tags[j];
          }
        }
      }
      codeTextHTML += escapeSpecialCharacters(currentChar);
    }

    return codeTextHTML;
  }

  _constructDivWrapperCoordinatesLayer(rawCodeText) {
    let divCoordinates = [];
    let i = 0;
    let rawCodeTextSplitted = rawCodeText.split("\n");
    let rawCodeIndex = 0;
    for (let i = 0; i < rawCodeTextSplitted.length; i++) {
      divCoordinates.push({
        type: "opening",
        index: rawCodeIndex,
        tag: `<div class="codeLine">`,
      });
      divCoordinates.push({
        type: "closing",
        index: rawCodeIndex + rawCodeTextSplitted[i].length,
        tag: "</div>",
      });
      rawCodeIndex += rawCodeTextSplitted[i].length + 1;
    }
    return divCoordinates;
  }

  _constructHighlightedSpanCoordinatesLayer(rawCodeText) {
    let syntaxHighlightedCode = hljs.highlight("javascript", rawCodeText).value;
    return constructSpanCoordinates(this._decodeHtml(syntaxHighlightedCode));
  }

  _constructAnnotatedTagCode(type, rawCodeText, nodes, codeStartLocation) {
    if (type == "variable-definition") {
      nodes.sort((a, b) => {
        if (
          a.symbol.selectionRange.start.line <
          b.symbol.selectionRange.start.line
        ) {
          return -1;
        } else if (
          a.symbol.selectionRange.start.line >
          b.symbol.selectionRange.start.line
        ) {
          return 1;
        } else {
          if (
            a.symbol.selectionRange.start.character <
            b.symbol.selectionRange.start.character
          ) {
            return -1;
          } else if (
            a.symbol.selectionRange.start.character >
            b.symbol.selectionRange.start.character
          ) {
            return 1;
          } else {
            return 0;
          }
        }
      });
    } else if (type == "function-reference" || type == "variable-reference") {
      // sort nodes by location
      nodes.sort((a, b) => {
        if (a.location.range.start.line < b.location.range.start.line) {
          return -1;
        } else if (a.location.range.start.line > b.location.range.start.line) {
          return 1;
        } else {
          if (
            a.location.range.start.character < b.location.range.start.character
          ) {
            return -1;
          } else if (
            a.location.range.start.character > b.location.range.start.character
          ) {
            return 1;
          } else {
            return 0;
          }
        }
      });
    }
    let keyFuncStartLine = codeStartLocation.line;
    let keyFuncStartChar = codeStartLocation.character;

    let rawCodeSplitted = rawCodeText.split("\n");
    let offsetByLines = new Array(rawCodeSplitted.length).fill(0);
    for (let i = 0; i < nodes.length; i++) {
      let currentNode = nodes[i];

      let startLine;
      let startChar;
      let endLine;
      let endChar;
      let startingSpanTag;
      let endingSpanTag;
      if (type == "function-reference") {
        startLine = currentNode.location.range.start.line;
        startChar = currentNode.location.range.start.character;

        endLine = currentNode.location.range.end.line;
        endChar = currentNode.location.range.end.character;

        startingSpanTag = `<span class="hljs-title function_ functionReference" function-definition-hash="${currentNode.functionDefinitionHash}" function-reference-hash="${currentNode.hashString}">`;
        endingSpanTag = "</span>";
      } else if (type == "variable-definition") {
        startLine = currentNode.symbol.selectionRange.start.line;
        startChar = currentNode.symbol.selectionRange.start.character;

        endLine = currentNode.symbol.selectionRange.end.line;
        endChar = currentNode.symbol.selectionRange.end.character;

        let style =
          this.trackableState.variableDefinitionHashToStyle[
            currentNode.hashString
          ];
        if (style) {
          startingSpanTag = `<span class="variableDefinition highlight" variable-definition-hash="${currentNode.hashString}" style="background-color: ${style.backgroundColor}; color: ${style.textColor};">`;
        } else {
          startingSpanTag = `<span class="variableDefinition" variable-definition-hash="${currentNode.hashString}">`;
        }
        endingSpanTag = "</span>";
      } else if (type == "variable-reference") {
        startLine = currentNode.location.range.start.line;
        startChar = currentNode.location.range.start.character;

        endLine = currentNode.location.range.end.line;
        endChar = currentNode.location.range.end.character;
        let style =
          this.trackableState.variableDefinitionHashToStyle[
            currentNode.variableDefinitionHash
          ];
        if (style) {
          startingSpanTag = `<span class="variableReference highlight" variable-definition-hash="${currentNode.variableDefinitionHash}" style="background-color: ${style.backgroundColor}; color: ${style.textColor};">`;
        } else {
          startingSpanTag = `<span class="variableReference" variable-definition-hash="${currentNode.variableDefinitionHash}">`;
        }
        endingSpanTag = "</span>";
      }

      let startLineOffset = startLine - keyFuncStartLine;
      let startCharOffset = startChar - keyFuncStartChar;

      let endLineOffset = endLine - keyFuncStartLine;
      let endCharOffset = endChar - keyFuncStartChar;

      // now i need to insert a span tag into the rawLineOfCodes
      // at the correct location

      rawCodeSplitted[startLineOffset] =
        rawCodeSplitted[startLineOffset].substring(
          0,
          startCharOffset + offsetByLines[startLineOffset]
        ) +
        startingSpanTag +
        rawCodeSplitted[startLineOffset].substring(
          startCharOffset + offsetByLines[startLineOffset]
        );

      offsetByLines[startLineOffset] += startingSpanTag.length;

      // insert the ending span tag
      rawCodeSplitted[endLineOffset] =
        rawCodeSplitted[endLineOffset].substring(
          0,
          endCharOffset + offsetByLines[startLineOffset]
        ) +
        endingSpanTag +
        rawCodeSplitted[endLineOffset].substring(
          endCharOffset + offsetByLines[startLineOffset]
        );
      offsetByLines[endLineOffset] += endingSpanTag.length;
    }
    return rawCodeSplitted.join("\n");
  }

  _decodeHtml(html) {
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
  }

  _markNestedFunctionContentAsHiddenDiv(
    rawCodeText,
    nestFunctionDefinitionNodes,
    codeStartLocation,
    divLineWrapperLayer
  ) {
    /*
    Given a list of span coordinates and a list of children, 
    filter out span coordinates that is within each children.range.start and children.range.end
    */

    let childrenRange2DList = extractChildrenRange(nestFunctionDefinitionNodes);
    let rawCodeSplitted = rawCodeText.split("\n");
    let indexMapper = new TwoDimensionIndexMapper(rawCodeText);

    // create a set called filteredIndex
    let filteredIndex = new Set();
    let mergedCoordinatesIndex = 0;
    for (let i = 0; i < childrenRange2DList.length; i++) {
      let currentChildrenRange = childrenRange2DList[i];

      let currentStart = currentChildrenRange.start;
      let currentEnd = currentChildrenRange.end;

      let offsettedCurrentStartLine =
        currentStart.line - codeStartLocation.line;
      let offsettedCurrentEndLine = currentEnd.line - codeStartLocation.line;

      let startIndex = indexMapper.map(offsettedCurrentStartLine + 1, 0);
      let endIndex = indexMapper.map(
        offsettedCurrentEndLine - 1,
        rawCodeSplitted[offsettedCurrentEndLine - 1].length
      );

      /*
      . . . . . . . startIndex . . . . . . endIndex . . . .. . .
      ^
      */
      while (
        mergedCoordinatesIndex < divLineWrapperLayer.length &&
        divLineWrapperLayer[mergedCoordinatesIndex].index < endIndex
      ) {
        if (divLineWrapperLayer[mergedCoordinatesIndex].index < startIndex) {
          mergedCoordinatesIndex++;
        } else {
          filteredIndex.add(mergedCoordinatesIndex);
          mergedCoordinatesIndex++;
        }
      }
    }
    for (let i = 0; i < divLineWrapperLayer.length; i++) {
      if (filteredIndex.has(i)) {
        if (divLineWrapperLayer[i].type === "opening") {
          let divTag = divLineWrapperLayer[i].tag;
          divTag = divTag.replace(">", " hidden>");
          divLineWrapperLayer[i].tag = divTag;
        }
      }
    }
  }
}

class VariableHighlighter {
  static highlightVariable(
    variableReferenceEl,
    colorTextColorPair,
    trackableState
  ) {
    const variableDefinitionHash = variableReferenceEl.getAttribute(
      "variable-definition-hash"
    );

    // get all the variable reference that has the same variable definition hash
    // TODO: This is buggy because if two variable belong to two different codeboxes from *different* functionRoot,
    //   this selector will catch it even though it shouldn't
    let relevantVariableReferences = Array.from(
      document.querySelectorAll(
        `span[variable-definition-hash="${variableDefinitionHash}"]`
      )
    );

    relevantVariableReferences.forEach((relevantVariableReference) => {
      relevantVariableReference.classList.add("highlight");
      relevantVariableReference.style.backgroundColor =
        colorTextColorPair.backgroundColor;
      relevantVariableReference.style.color = colorTextColorPair.textColor;
      trackableState.variableDefinitionHashToStyle[variableDefinitionHash] = {
        highlighted: true,
        backgroundColor: colorTextColorPair.backgroundColor,
        textColor: colorTextColorPair.textColor,
      };
    });
  }

  static unHighlightVariable(variableReferenceEl, codeTextEl, trackableState) {
    const variableDefinitionHash = variableReferenceEl.getAttribute(
      "variable-definition-hash"
    );

    let relevantVariableReferences = Array.from(
      codeTextEl.querySelectorAll(
        `span[variable-definition-hash="${variableDefinitionHash}"]`
      )
    );
    relevantVariableReferences.forEach((relevantVariableReference) => {
      // remove "highlight" class
      relevantVariableReference.classList.remove("highlight");
      relevantVariableReference.style.backgroundColor = "";
      relevantVariableReference.style.color = "";
      trackableState.variableDefinitionHashToStyle[variableDefinitionHash] = {
        highlighted: false,
        backgroundColor: "",
        textColor: "",
      };
    });
  }
}

class HighlightedVariableBox extends HTMLBox {
  constructor(
    document,
    htmlBoxGraph,
    trackableState,
    variableReferenceEl,
    codeTextEl
  ) {
    super(document, htmlBoxGraph, trackableState);
    this.variableReferenceEl = variableReferenceEl;
    this.codeTextEl = codeTextEl;
  }

  constructHTMLElement(left = 0, top = 0) {
    const parentDiv = this._createParentDiv();
    const titleDiv = this._createTitleDiv();
    const containerDiv = this._createContainerDiv();
    const backgroundColorToVariableDefinitionHashList =
      this._groupVariablesByBackgroundColor(this.trackableState);

    for (const backgroundColor in backgroundColorToVariableDefinitionHashList) {
      const variableDefinitionHashList =
        backgroundColorToVariableDefinitionHashList[backgroundColor];
      const coloredVariableGroup =
        this._createColoredVariableGroup(backgroundColor);
      const coloredVariableListDiv = this._createColoredVariableListDiv();

      for (let i = 0; i < variableDefinitionHashList.length; i++) {
        const variableDefinitionHash = variableDefinitionHashList[i];
        const variableDefinitionNode =
          this.htmlBoxGraph.nodeMap[variableDefinitionHash];

        // TODO: This is temporary. In theory variableDefinitionHash should always be in the nodeMap
        if (variableDefinitionNode === undefined) {
          continue;
        }

        const style =
          this.trackableState.variableDefinitionHashToStyle[
            variableDefinitionHash
          ];
        const coloredVariableItem = this._createColoredVariableItem(
          variableDefinitionNode,
          backgroundColor,
          style.textColor
        );

        coloredVariableListDiv.appendChild(coloredVariableItem);
      }

      coloredVariableGroup.appendChild(coloredVariableListDiv);
      containerDiv.appendChild(coloredVariableGroup);
    }

    parentDiv.appendChild(titleDiv);
    parentDiv.appendChild(containerDiv);

    parentDiv.addEventListener("mouseenter", (event) => {
      this.trackableState.cursorInsideHighlightedVariableBox = true;
    });

    parentDiv.addEventListener("mouseleave", (event) => {
      this.trackableState.cursorInsideHighlightedVariableBox = false;
    });

    return parentDiv;
  }

  // Function to construct the HTML element
  _createParentDiv() {
    const parentDiv = document.createElement("div");
    parentDiv.classList.add("highlightedVariablesListBox");
    return parentDiv;
  }

  _createTitleDiv() {
    const titleDiv = document.createElement("div");
    titleDiv.classList.add("title");
    titleDiv.textContent = "Highlighted Variables";
    return titleDiv;
  }

  _createContainerDiv() {
    const containerDiv = document.createElement("div");
    containerDiv.classList.add("coloredVariableGroupContainer");
    return containerDiv;
  }

  _groupVariablesByBackgroundColor(trackableState) {
    const backgroundColorToVariableDefinitionHashList = {};

    for (const variableDefinitionHash in trackableState.variableDefinitionHashToStyle) {
      const style =
        trackableState.variableDefinitionHashToStyle[variableDefinitionHash];
      const backgroundColor = style.backgroundColor;
      backgroundColorToVariableDefinitionHashList[backgroundColor] =
        backgroundColorToVariableDefinitionHashList[backgroundColor] || [];
      backgroundColorToVariableDefinitionHashList[backgroundColor].push(
        variableDefinitionHash
      );
    }

    return backgroundColorToVariableDefinitionHashList;
  }

  _createColoredVariableGroup(backgroundColor) {
    const coloredVariableGroup = document.createElement("div");
    coloredVariableGroup.classList.add("coloredVariablesGroup");
    return coloredVariableGroup;
  }

  _createColoredVariableListDiv() {
    const coloredVariableListDiv = document.createElement("div");
    coloredVariableListDiv.classList.add("coloredVariableList");
    return coloredVariableListDiv;
  }

  _createColoredVariableItem(
    variableDefinitionNode,
    backgroundColor,
    textColor
  ) {
    const coloredVariableItem = document.createElement("div");
    coloredVariableItem.classList.add("coloredVariableItem");

    const coloredVariableDiv = document.createElement("div");
    coloredVariableDiv.classList.add("coloredVariable");
    coloredVariableDiv.textContent = variableDefinitionNode.symbol.name;
    coloredVariableDiv.style.backgroundColor = backgroundColor;
    coloredVariableDiv.style.color = textColor;

    const functionNameDiv = document.createElement("div");
    functionNameDiv.classList.add("functionName");
    functionNameDiv.textContent =
      this.htmlBoxGraph.nodeMap[
        variableDefinitionNode.hostFunctionHash
      ].symbol.name;

    coloredVariableItem.appendChild(coloredVariableDiv);
    coloredVariableItem.appendChild(functionNameDiv);

    coloredVariableItem.addEventListener("click", () => {
      VariableHighlighter.highlightVariable(
        this.variableReferenceEl,
        {
          backgroundColor: backgroundColor,
          textColor: textColor,
        },
        this.trackableState
      );
    });

    return coloredVariableItem;
  }
}

class ColorPickerBox extends HTMLBox {
  constructor(
    document,
    htmlBoxGraph,
    trackableState,
    variableReferenceEl,
    codeTextEl
  ) {
    super(document, htmlBoxGraph, trackableState);

    this.variableReferenceEl = variableReferenceEl;
    this.codeTextEl = codeTextEl;

    this.highlightedVariableBox = new HighlightedVariableBox(
      document,
      htmlBoxGraph,
      trackableState,
      this.variableReferenceEl,
      this.codeTextEl
    );

    this.chosenColors = this._constructChosenColors(
      this.trackableState.variableDefinitionHashToStyle
    );

    this.COLOR_PICKER_WIDTH = 145;
    this.COLOR_PICKER_HEIGHT = 115;
    this.COLOR_BOX_DIMENSION = 15;

    this.DEFAULT_COLOR_ITEMS = [
      { backgroundColor: "#ffd700", textColor: "#000000" },
      { backgroundColor: "#ff0000", textColor: "#FFFFFF" },
      { backgroundColor: "#ff8c00", textColor: "#000000" },
      { backgroundColor: "#00ff00", textColor: "#000000" },
      { backgroundColor: "#1e90ff", textColor: "#000000" },
      { backgroundColor: "#000080", textColor: "#FFFFFF" },
      { backgroundColor: "#a9a9a9", textColor: "#000000" },
      { backgroundColor: "#00fa9a", textColor: "#000000" },
      { backgroundColor: "#9acd32", textColor: "#000000" },
      { backgroundColor: "#2f4f4f", textColor: "#FFFFFF" },
      { backgroundColor: "#556b2f", textColor: "#FFFFFF" },
      { backgroundColor: "#483d8b", textColor: "#FFFFFF" },
      { backgroundColor: "#b22222", textColor: "#FFFFFF" },
      { backgroundColor: "#008000", textColor: "#FFFFFF" },
      { backgroundColor: "#20b2aa", textColor: "#FFFFFF" },
      { backgroundColor: "#8b008b", textColor: "#FFFFFF" },
      { backgroundColor: "#8a2be2", textColor: "#FFFFFF" },
      { backgroundColor: "#00bfff", textColor: "#000000" },
      { backgroundColor: "#0000ff", textColor: "#FFFFFF" },
      { backgroundColor: "#ff00ff", textColor: "#000000" },
      { backgroundColor: "#eee8aa", textColor: "#000000" },
      { backgroundColor: "#ffa07a", textColor: "#000000" },
      { backgroundColor: "#ee82ee", textColor: "#000000" },
    ];
  }

  constructHTMLElement(left, top) {
    let colorPickerAndHighlightedVariableBoxContainer =
      document.createElement("div");
    colorPickerAndHighlightedVariableBoxContainer.classList.add(
      "colorPickerAndHighlightedVariableBoxContainer"
    );

    let colorPickerBox = this.initializeColorPickerBox(
      this.COLOR_PICKER_WIDTH,
      this.COLOR_PICKER_HEIGHT
    );
    colorPickerBox.appendChild(this.constructHighlighterIconSection());

    let colorPalletteSection = document.createElement("div");
    colorPalletteSection.classList.add("colorPalleteSection");

    colorPalletteSection.appendChild(this.constructRemoveColorBox());

    for (let i = 0; i < this.DEFAULT_COLOR_ITEMS.length; i++) {
      colorPalletteSection.appendChild(
        this.constructColorBox(this.DEFAULT_COLOR_ITEMS[i], colorPickerBox)
      );
    }
    colorPickerBox.appendChild(colorPalletteSection);

    colorPickerAndHighlightedVariableBoxContainer.appendChild(colorPickerBox);
    colorPickerAndHighlightedVariableBoxContainer.appendChild(
      this.highlightedVariableBox.constructHTMLElement()
    );

    // place the box at the mouse position
    colorPickerAndHighlightedVariableBoxContainer.style.left = `${
      left / canvasScale() - canvasTranslate().x / canvasScale()
    }px`;
    colorPickerAndHighlightedVariableBoxContainer.style.top = `${
      top / canvasScale() - canvasTranslate().y / canvasScale()
    }px`;
    return colorPickerAndHighlightedVariableBoxContainer;
  }

  _constructChosenColors(variableDefinitionHashToStyle) {
    let chosenColors = new Set();
    for (const variableDefinitionHash in variableDefinitionHashToStyle) {
      const style = variableDefinitionHashToStyle[variableDefinitionHash];
      chosenColors.add(style.backgroundColor);
    }
    return chosenColors;
  }

  constructColorBox(colorItem, colorPickerBox) {
    let colorBox = document.createElement("div");
    colorBox.classList.add("colorBox");
    colorBox.style.width = `${this.COLOR_BOX_DIMENSION}px`;
    colorBox.style.height = `${this.COLOR_BOX_DIMENSION}px`;
    colorBox.style.borderRadius = "5px";
    // check if the color is already selected
    if (this.chosenColors.has(colorItem.backgroundColor)) {
      colorBox.style.border = "2px solid white";
    }
    colorBox.style.backgroundColor = colorItem.backgroundColor;

    colorBox.addEventListener("mouseenter", (event) => {
      colorBox.style.boxShadow = `0px 0px 5px 0px ${colorItem.backgroundColor}`;
      glowSameColorVariableReference(colorItem.backgroundColor);
    });

    colorBox.addEventListener("mouseleave", (event) => {
      colorBox.style.boxShadow = "";
      unGlowSameColorVariableReference();
    });
    colorBox.addEventListener("click", (event) => {
      VariableHighlighter.highlightVariable(
        this.variableReferenceEl,
        {
          backgroundColor: colorItem.backgroundColor,
          textColor: colorItem.textColor,
        },
        this.trackableState
      );
      unGlowSameColorVariableReference();
    });

    return colorBox;
  }

  /* Construct the color box that removes the color from a variable */
  constructRemoveColorBox() {
    let removeColorBox = document.createElement("div");
    removeColorBox.classList.add("colorBox");
    removeColorBox.style.width = `${this.COLOR_BOX_DIMENSION}px`;
    removeColorBox.style.height = `${this.COLOR_BOX_DIMENSION}px`;
    removeColorBox.style.borderRadius = "5px";
    removeColorBox.style.border = "2px solid gray";
    removeColorBox.addEventListener("click", (event) => {
      VariableHighlighter.unHighlightVariable(
        this.variableReferenceEl,
        this.codeTextEl,
        this.trackableState
      );
    });
    return removeColorBox;
  }

  initializeColorPickerBox(colorPickerWidth, colorPickerHeight) {
    let colorPickerBox = document.createElement("div");
    colorPickerBox.id = "colorPickerBoxId";
    colorPickerBox.classList.add("colorPickerBox");
    colorPickerBox.style.width = `${colorPickerWidth}px`;
    colorPickerBox.style.minHeight = `${colorPickerHeight}px`;
    return colorPickerBox;
  }

  constructHighlighterIconSection() {
    let colorHighlightIcon = document.createElement("img");
    colorHighlightIcon.src = "../assets/colorHighlighter.svg";
    colorHighlightIcon.style.width = "15px";
    colorHighlightIcon.style.height = "17px";

    let colorHighlighterIconSection = document.createElement("div");
    colorHighlighterIconSection.classList.add("colorHighlighterIconSection");
    colorHighlighterIconSection.appendChild(colorHighlightIcon);
    return colorHighlighterIconSection;
  }
}

class TwoDimensionIndexMapper {
  constructor(rawCodeText) {
    this.cumulativeCharacterUntilLine =
      this.constructCumulativeCharacterCountUntilLine(rawCodeText);
  }

  map(line, col) {
    return this.cumulativeCharacterUntilLine[line] + col;
  }

  constructCumulativeCharacterCountUntilLine(rawLineOfCodes) {
    let rawLineOfCodesSplitted = rawLineOfCodes.split("\n");
    let cumulativeCharacterUntilLine = new Array(rawLineOfCodesSplitted.length);
    for (let i = 0; i < rawLineOfCodesSplitted.length; i++) {
      if (i === 0) {
        cumulativeCharacterUntilLine[i] = 0;
      } else {
        cumulativeCharacterUntilLine[i] =
          cumulativeCharacterUntilLine[i - 1] +
          rawLineOfCodesSplitted[i - 1].length +
          1;
      }
    }
    return cumulativeCharacterUntilLine;
  }
}

function hoverHighlightRelatedVariables(variableReferenceEl) {
  const variableDefinitionHash = variableReferenceEl.getAttribute(
    "variable-definition-hash"
  );
  // get all the variable reference that has the same variable definition hash
  let relevantVariableReferences = Array.from(
    document.querySelectorAll(
      `span[variable-definition-hash="${variableDefinitionHash}"]`
    )
  );

  relevantVariableReferences.forEach((relevantVariableReference) => {
    relevantVariableReference.classList.add("variableHover");
  });
}
// getFunctionSignatureAndBodyDraggableBox(
//   "function-definition:file:///Users/fahrankamili/Projects/socrates-indexer-mock-project-small/main.cpp:12:0"
// );

// getFunctionSignatureAndBodyDraggableBox(
//   "function-definition:file:///Users/fahrankamili/Projects/socrates-frontend/utils.js:602:0"
// );
