import hljs from "highlight.js";

export async function getFunctionMetadataBoxAndCodebox(
  document,
  htmlBoxGraph,
  trackableState,
  key
) {
  try {
    let nodeMap = {};
    if (htmlBoxGraph.nodeMap.length > 0) {
      nodeMap = htmlBoxGraph.nodeMap;
    } else {
      // make request to localhost:3000/get-node-map
      const response = await fetch("http://localhost:3000/get-node-map");
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
      functionDefinitionNode.uri
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

    const functionNameBox = new FunctionNameBox(
      document,
      htmlBoxGraph,
      functionName
    );
    const functionMetadataBox = new FunctionMetadataBox(
      document,
      htmlBoxGraph,
      fileNameBox,
      functionNameBox
    );

    // only find children that is type of function
    const nestedFunctionDefinitionNodes =
      functionDefinitionNode.symbol.children.filter((child) => {
        // 12 is lsp.SymbolKind.Function
        return child.kind === 12;
      });

    const codeBox = new CodeBox(
      document,
      htmlBoxGraph,
      /*rawCodeText=*/ functionBodyAndSignature,
      /*functionReferenceNodes=*/ functionReferencesInsideKeyFunction,
      /*variableDefinitionNodes=*/ variableDefinitionsInsideKeyFunction,
      /*variableReferenceNodes=*/ variableReferencesInsideKeyFunction,
      /*nestedFunctionDefinitionNodes=*/ nestedFunctionDefinitionNodes,
      /*codeStartLocation=*/ functionDefinitionNode.symbol.range.start,
      trackableState
    );

    return { functionMetadataBox, codeBox };
  } catch (error) {
    console.error("Error:", error);
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

export function setSVGArrowAttributes(svg, x1, y1, x2, y2) {
  svg.innerHTML = ""; // Clear existing SVG contents

  let width = Math.abs(x2 - x1) + 20;
  let height = Math.abs(y2 - y1);
  let left;
  if (x1 > x2) {
    left = x2 - 10;
  } else {
    left = x1 - 10;
  }
  let top = y1;

  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.style.position = "absolute";
  svg.style.left = left + "px";
  svg.style.top = top + "px";

  const marker = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "marker"
  );
  marker.id = "arrowhead";
  marker.setAttribute("markerWidth", "10");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("refX", "0");
  marker.setAttribute("refY", "3.5");
  marker.setAttribute("orient", "auto");

  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon"
  );
  polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
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

  function createLine(x1, y1, x2, y2, strokeWidth, markerEnd) {
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

  if (x1 < x2) {
    createLine(10, 0, 10, height / 2, 4, false);
    createLine(10, height / 2, width - 10, height / 2, 4, false);
    createLine(width - 10, height / 2, width - 10, height - 20, 4, false);
    createLine(width - 10, height / 2, width - 10, height - 20, 2, true);
  } else {
    createLine(width - 10, 0, width - 10, height / 2, 4, false);
    createLine(width - 10, height / 2, 10, height / 2, 4, false);
    createLine(10, height / 2, 10, height - 20, 4, false);
    createLine(10, height / 2, 10, height - 20, 2, true);
  }
}

/**
 * @param {any} document - Dom Document.
 * @param {any} draggableBoxHtmlElement - The HTML element that is draggable.
 * @param {HTMLBoxGraph} htmlBoxGraph - The HTML Box Graph.
 * */
export function injectDraggingBehaviour(
  document,
  draggableBoxHtmlElement,
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
    let shiftX = event.clientX - boxRect.left;
    let shiftY = event.clientY - boxRect.top;

    function moveAt(viewPortX, viewPortY) {
      /*
    Think of it this way,
 
    pageX is the current mouse position on the page,
    shiftX is the distance between the mouse and the left edge of the draggableBox
    you want the left edge of the draggableBox to be at the mouse position (pageX) - shiftX
    */
      // Calculate the new position of the draggableBox
      let newLeft = viewPortX - shiftX;
      let newTop = viewPortY - shiftY;

      if (newLeft < 0) {
        newLeft = 0;
      }
      if (newTop < 0) {
        newTop = 0;
      }
      draggableBoxHtmlElement.style.left = newLeft + "px";
      draggableBoxHtmlElement.style.top = newTop + "px";
      updateArrowConnections();
    }

    moveAt(event.clientX, event.clientY);

    function updateArrowConnections() {
      htmlBoxGraph.recomputeSVGArrowConnections(
        /*recentlyMovedBoxId=*/ draggableBoxHtmlElement.getAttribute("id")
      );
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

  function handleEntireSubtreeBoxDragging(event) {
    let clickedBoxInitialRect = getDocumentRelativePosition(
      draggableBoxHtmlElement
    );
    let mouseDownX = event.clientX;
    let mouseDownY = event.clientY;

    function moveAt(mouseMoveX, mouseMoveY) {
      let oldLeftOfClickedBox = getDocumentRelativePosition(
        draggableBoxHtmlElement
      ).left;
      let oldTopOfClickedBox = getDocumentRelativePosition(
        draggableBoxHtmlElement
      ).top;

      let shiftX = mouseDownX - clickedBoxInitialRect.left;
      let shiftY = mouseDownY - clickedBoxInitialRect.top;

      let newLeftOfClickedBox =
        mouseMoveX - shiftX > 0 ? mouseMoveX - shiftX : 0;
      let newTopOfClickedBox =
        mouseMoveY - shiftY > 0 ? mouseMoveY - shiftY : 0;

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

      for (let i = 1; i < subStreeHtmlBox.length; i++) {
        let currentHtmlBox = subStreeHtmlBox[i];
        let currentHtmlBoxRect = getDocumentRelativePosition(
          currentHtmlBox.htmlElement()
        );
        currentHtmlBox.htmlElement().style.left =
          currentHtmlBoxRect.left + (newLeft - oldLeft) + "px";
        currentHtmlBox.htmlElement().style.top =
          currentHtmlBoxRect.top + (newTop - oldTop) + "px";
        htmlBoxGraph.recomputeSVGArrowConnections(currentHtmlBox.id());
      }
    }

    function moveClickedBox(newLeft, newTop) {
      draggableBoxHtmlElement.style.left = newLeft + "px";
      draggableBoxHtmlElement.style.top = newTop + "px";
      updateArrowConnections();
      return { newLeft, newTop };
    }

    function updateArrowConnections() {
      htmlBoxGraph.recomputeSVGArrowConnections(
        /*recentlyMovedBoxId=*/ draggableBoxHtmlElement.getAttribute("id")
      );
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
  });
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
}

// Function to check if a color is "darker" than a threshold for black text
function isColorTooDark(color, threshold = 128) {
  // Parse the color using a temporary HTML element
  const tempElement = document.createElement("div");
  tempElement.style.color = color;
  document.body.appendChild(tempElement);

  // Get the computed color value
  const computedColor = window.getComputedStyle(tempElement).color;

  // Calculate the brightness of the color (HSL lightness)
  const hslMatch = computedColor.match(/\d+/g);
  if (hslMatch && hslMatch.length === 3) {
    const lightness = parseInt(hslMatch[2]);
    return lightness < threshold;
  }

  // Default to false if color parsing or brightness calculation fails
  return false;
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
      hostCodeBox.functionReferenceNodes,
      hostCodeBox.codeStartLocation,
      functionReferenceCallRange.end
    );

  let {
    firstNestedFunctionDefinitionNodes,
    secondNestedFunctionDefinitionNodes,
  } = splitNestedFunctionDefinitionNodesIntoTwo(
    hostCodeBox.nestedFunctionDefinitionNodes,
    hostCodeBox.codeStartLocation,
    functionReferenceCallRange.end
  );

  let { firstVariableDefinitionNodes, secondVariableDefinitionNodes } =
    splitVariableDefinitionNodesIntoTwo(
      hostCodeBox.variableDefinitionNodes,
      hostCodeBox.codeStartLocation,
      functionReferenceCallRange.end
    );

  let { firstVariableReferenceNodes, secondVariableReferenceNodes } =
    splitVariableReferenceNodesIntoTwo(
      hostCodeBox.variableReferenceNodes,
      hostCodeBox.codeStartLocation,
      functionReferenceCallRange.end
    );

  let firstCodeBox = new CodeBox(
    hostCodeBox.document,
    hostCodeBox.htmlBoxGraph,
    firstRawCodeString,
    firstFunctionReferenceNodes,
    firstVariableDefinitionNodes,
    firstVariableReferenceNodes,
    firstNestedFunctionDefinitionNodes,
    hostCodeBox.codeStartLocation,
    hostCodeBox.trackableState,
    hostCodeBox.variableDefinitionHashToStyle
  );

  let secondCodeBox = new CodeBox(
    hostCodeBox.document,
    hostCodeBox.htmlBoxGraph,
    secondRawCodeString,
    secondFunctionReferenceNodes,
    secondVariableDefinitionNodes,
    secondVariableReferenceNodes,
    secondNestedFunctionDefinitionNodes,
    // I don't think this is correct
    {
      line: functionReferenceCallRange.end.line + 1,
      character: hostCodeBox.codeStartLocation.character,
    },
    hostCodeBox.trackableState,
    hostCodeBox.variableDefinitionHashToStyle
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

function injectTheSplitBoxesIntoGraph(
  htmlBoxGraph,
  hostCodeBox,
  firstCodeBox,
  secondCodeBox
) {
  let parentBoxIdItems = htmlBoxGraph.getParentBoxIdItems(hostCodeBox.id());
  if (parentBoxIdItems) {
    for (let i = 0; i < parentBoxIdItems.length; i++) {
      let parentBoxIdItem = parentBoxIdItems[i];
      htmlBoxGraph.removeConnection(parentBoxIdItem.box_id, hostCodeBox.id());
      htmlBoxGraph.connectTwoBoxes(parentBoxIdItem.box_id, firstCodeBox.id());
      htmlBoxGraph.connectTwoBoxes(parentBoxIdItem.box_id, secondCodeBox.id());
    }
  }

  let childBoxIdItems = htmlBoxGraph.getChildrenBoxIdItems(hostCodeBox.id());
  if (childBoxIdItems) {
    for (let i = 0; i < childBoxIdItems.length; i++) {
      let childBoxIdItem = childBoxIdItems[i];
      htmlBoxGraph.removeConnection(hostCodeBox.id(), childBoxIdItem.box_id);
      htmlBoxGraph.connectTwoBoxes(secondCodeBox.id(), childBoxIdItem.box_id);
    }
  }
}

async function getFunctionBodyAndSignature(uri, start, end) {
  try {
    const response = await fetch(
      `http://localhost:3000/get-file-content?fileUri=${uri}`
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

function constructSpanCoordinates(code) {
  let spanCoordinates = [];
  let index = 0;
  let unanotaedIndex = 0;
  while (index < code.length) {
    if (code[index] == "<") {
      let tagEndIndex = code.indexOf(">", index);
      let tag = code.substring(index, tagEndIndex + 1);

      if (!tag.startsWith("<span") && !tag.startsWith("</span")) {
        index++;
        unanotaedIndex++;
        continue;
      }

      if (tag.startsWith("<span")) {
        spanCoordinates.push({
          type: "opening",
          index: unanotaedIndex,
          tag: tag,
        });
      } else if (tag.startsWith("</span")) {
        spanCoordinates.push({
          type: "closing",
          index: unanotaedIndex,
          tag: tag,
        });
      }
      index = tagEndIndex + 1;
    } else {
      index++;
      unanotaedIndex++;
    }
  }
  return spanCoordinates;
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

export class HTMLBoxGraph {
  constructor() {
    // maps HTMLBox id to HTMLBox instance
    this.idToHtmlBox = {};
    this.idToSVGHTMLElement = {};

    // maps parent id to list of children id items i.e. {box_id, svg_id}
    this.parentToChildrens = {};

    // maps children id to list of parent id items i.e. {box_id, svg_id}
    this.childrenToParents = {};

    this.nodeMap = {};
    this.renderedFunctionReferenceHashes = new Set();
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
    let childrenIdItems = this.parentToChildrens[boxId];
    if (childrenIdItems) {
      for (let i = 0; i < childrenIdItems.length; i++) {
        let childrenIdItem = childrenIdItems[i];
        subTree = subTree.concat(this.getSubTree(childrenIdItem.box_id));
      }
    }
    return subTree;
  }

  getParentBoxIdItems(boxId) {
    return this.childrenToParents[boxId] || [];
  }

  getChildrenBoxIdItems(boxId) {
    return this.parentToChildrens[boxId] || [];
  }

  connectTwoBoxes(parentBoxId, childBoxId) {
    if (this.idToHtmlBox[parentBoxId] == null) {
      throw new Error(
        "parentBox is null, please call addNode on parentBox first"
      );
    }
    if (this.idToHtmlBox[childBoxId] == null) {
      throw new Error(
        "childBox is null, please call addNode on childBox first"
      );
    }

    let svgArrow = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    let svg_id = generateUUID();
    svgArrow.setAttribute("id", svg_id);
    svgArrow.classList.add("animateZoomIn");
    this.idToSVGHTMLElement[svg_id] = svgArrow;

    this.parentToChildrens[parentBoxId] =
      this.parentToChildrens[parentBoxId] || [];
    this.parentToChildrens[parentBoxId].push({
      box_id: childBoxId,
      svg_id: svg_id,
    });

    this.childrenToParents[childBoxId] =
      this.childrenToParents[childBoxId] || [];
    this.childrenToParents[childBoxId].push({
      box_id: parentBoxId,
      svg_id: svg_id,
    });

    let parentBoxElement = this.idToHtmlBox[parentBoxId].htmlElement();
    let parentBoxPosition = getDocumentRelativePosition(parentBoxElement);

    let bottomMidPointOfParentBox = {
      x: parentBoxPosition.left + parentBoxPosition.width / 2,
      y: parentBoxPosition.top + parentBoxPosition.height,
    };

    let childBoxElement = this.idToHtmlBox[childBoxId].htmlElement();
    let childBoxPosition = getDocumentRelativePosition(childBoxElement);
    let fileNameElement = childBoxElement.querySelector(".fileName");
    let topMidPointOfChildBox = {};
    if (fileNameElement !== null) {
      let fileNameHeight = getDocumentRelativePosition(fileNameElement).height;
      topMidPointOfChildBox = {
        x: childBoxPosition.left + childBoxPosition.width / 2,
        y: childBoxPosition.top + fileNameHeight,
      };
    } else {
      topMidPointOfChildBox = {
        x: childBoxPosition.left + childBoxPosition.width / 2,
        y: childBoxPosition.top,
      };
    }

    setSVGArrowAttributes(
      svgArrow,
      bottomMidPointOfParentBox.x,
      bottomMidPointOfParentBox.y,
      topMidPointOfChildBox.x,
      topMidPointOfChildBox.y
    );

    // This is a hack.... figure out how to not draw inside HTMLBoxGraph?
    document.body.appendChild(svgArrow);
  }

  getSiblingBoxes(boxId) {
    let siblings = [];
    let parents = this.childrenToParents[boxId];
    for (let i = 0; i < parents.length; i++) {
      let parentIdItem = parents[i];
      let children = this.parentToChildrens[parentIdItem.box_id];
      for (let j = 0; j < children.length; j++) {
        let child = children[j];
        if (child.box_id !== boxId) {
          siblings.push(this.idToHtmlBox[child.box_id]);
        }
      }
    }
    return siblings;
  }

  recomputeSVGArrowConnections(recentlyMovedBoxId) {
    let childrenIdItemList = this.parentToChildrens[recentlyMovedBoxId];
    let parentIdItemList = this.childrenToParents[recentlyMovedBoxId];

    if (childrenIdItemList) {
      for (let i = 0; i < childrenIdItemList.length; i++) {
        let childrenIdItem = childrenIdItemList[i];
        this._recomputeSVGArrowConnections(
          recentlyMovedBoxId,
          childrenIdItem.box_id,
          childrenIdItem.svg_id
        );
      }
    }

    if (parentIdItemList) {
      for (let i = 0; i < parentIdItemList.length; i++) {
        let parentIdItem = parentIdItemList[i];
        this._recomputeSVGArrowConnections(
          parentIdItem.box_id,
          recentlyMovedBoxId,
          parentIdItem.svg_id
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

  _recomputeSVGArrowConnections(parentId, childrenId, svgId) {
    let parentBoxElement = this.idToHtmlBox[parentId].htmlElement();
    let childrenBoxElement = this.idToHtmlBox[childrenId].htmlElement();

    let parentBoxPosition = getDocumentRelativePosition(parentBoxElement);
    let parentBoxTop = parentBoxPosition.top;
    let parentBoxLeft = parentBoxPosition.left;
    let parentBoxHeight = parentBoxPosition.height;
    let parentBoxWidth = parentBoxPosition.width;

    let bottomMidPointOfParentBox = {
      x: parentBoxLeft + parentBoxWidth / 2,
      y: parentBoxTop + parentBoxHeight,
    };

    let childrenBoxPosition = getDocumentRelativePosition(childrenBoxElement);
    let childrenBoxTop = childrenBoxPosition.top;
    let childrenBoxLeft = childrenBoxPosition.left;

    let fileNameElement = childrenBoxElement.querySelector(".fileName");
    let topMidPointOfChildrenBox = {};
    if (fileNameElement !== null) {
      let fileNameHeight = getDocumentRelativePosition(fileNameElement).height;
      topMidPointOfChildrenBox = {
        x: childrenBoxLeft + childrenBoxPosition.width / 2,
        y: childrenBoxTop + fileNameHeight,
      };
    } else {
      topMidPointOfChildrenBox = {
        x: childrenBoxLeft + childrenBoxPosition.width / 2,
        y: childrenBoxTop,
      };
    }

    let svg = document.getElementById(svgId);
    setSVGArrowAttributes(
      svg,
      bottomMidPointOfParentBox.x,
      bottomMidPointOfParentBox.y,
      topMidPointOfChildrenBox.x,
      topMidPointOfChildrenBox.y
    );
  }

  // Implement later
  draw() {
    throw new Error("draw method is not implemented yet");
  }
}

export class TrackableState {
  constructor() {
    this.chosenVariableHighlightColor = new Set();
  }
}

class HTMLBox {
  /**
   * Adds two numbers.
   * @param {any} document - the dom document.
   * @param {HTMLBoxGraph} htmlBoxGraph - The HTML Box Graph.
   */
  constructor(document, htmlBoxGraph) {
    this.id_ = generateUUID();
    this._isDrawn = false;
    this.document = document;
    // add type hint for htmlBoxGraph
    this.htmlBoxGraph = htmlBoxGraph;
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

  // draw(left = 0, top = 0) {
  //   if (this._isDrawn) {
  //     throw new Error("Box is already drawn. Box can only be drawn once.");
  //   }
  //   this.document.body.appendChild(this.constructHTMLElement(left, top));
  //   this._isDrawn = true;
  // }

  constructHTMLElement(left = 0, top = 0) {
    throw new Error("constructHTMLElement method must be implemented.");
  }
}

export class FunctionMetadataBox extends HTMLBox {
  constructor(document, htmlBoxGraph, fileNameBox, functionNameBox) {
    super(document, htmlBoxGraph);
    this.fileNameBox = fileNameBox;
    this.functionNameBox = functionNameBox;
  }

  draw(left = 0, top = 0) {
    if (this._isDrawn) {
      throw new Error("Box is already drawn. Box can only be drawn once.");
    }
    this.document.body.appendChild(this.constructHTMLElement(left, top));
    this._isDrawn = true;
  }

  constructHTMLElement(left = 0, top = 0) {
    const functionMetadataBox = document.createElement("div");
    functionMetadataBox.setAttribute("id", this.id_);
    functionMetadataBox.classList.add("functionMetadataBox");
    functionMetadataBox.classList.add("draggableBox");
    functionMetadataBox.classList.add("animateZoomIn");
    functionMetadataBox.style.left = `${left}px`;
    functionMetadataBox.style.top = `${top}px`;

    functionMetadataBox.appendChild(this.fileNameBox.constructHTMLElement());
    functionMetadataBox.appendChild(
      this.functionNameBox.constructHTMLElement()
    );
    return functionMetadataBox;
  }
}

class FunctionNameBox extends HTMLBox {
  constructor(document, htmlBoxGraph, functionNameOrSignature) {
    super(document, htmlBoxGraph);
    this.functionNameOrSignature = functionNameOrSignature;
  }

  constructHTMLElement(left = 0, top = 0) {
    const functionNameDiv = document.createElement("div");
    functionNameDiv.setAttribute("id", this.id_);
    functionNameDiv.classList.add("functionNameBox");
    functionNameDiv.appendChild(
      this._constructFunctionSignatureDiv(this.functionNameOrSignature)
    );
    return functionNameDiv;
  }

  _constructFunctionSignatureDiv(functionNameOrSignature) {
    const functionSignatureDiv = document.createElement("div");
    functionSignatureDiv.innerHTML = functionNameOrSignature;
    return functionSignatureDiv;
  }
}

class FileNameBox extends HTMLBox {
  constructor(document, htmlBoxGraph, fileName) {
    super(document, htmlBoxGraph);
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

export class CodeBox extends HTMLBox {
  constructor(
    document,
    htmlBoxGraph,
    rawCodeText,
    functionReferenceNodes,
    variableDefinitionNodes,
    variableReferenceNodes,
    nestedFunctionDefinitionNodes,
    codeStartLocation,
    trackableState,
    variableDefinitionHashToStyle = {}
  ) {
    super(document, htmlBoxGraph);
    this.codeStartLocation = codeStartLocation;
    this.trackableState = trackableState;
    this.rawCodeText = rawCodeText;

    // this.codeHighlightSpanCoordinatesLayer =
    //   this._constructHighlightedSpanCoordinatesLayer(this.rawCodeText);
    this.codeHighlightSpanCoordinatesLayer = [];

    // maps variable definition hash to {highglighted: bool, backgroundColor: string, textColor: string}
    this.variableDefinitionHashToStyle = variableDefinitionHashToStyle;

    this.functionReferenceNodes = functionReferenceNodes;
    this.functionReferenceSpanCoordinatesLayer =
      constructSpanCoordinatesFromNodes(
        "function-reference",
        this.rawCodeText,
        functionReferenceNodes,
        this.variableDefinitionHashToStyle,
        codeStartLocation
      );

    this.variableDefinitionNodes = variableDefinitionNodes;
    this.variableDefinitionSpanCoordinatesLayer =
      constructSpanCoordinatesFromNodes(
        "variable-definition",
        this.rawCodeText,
        variableDefinitionNodes,
        this.variableDefinitionHashToStyle,
        codeStartLocation
      );

    this.variableReferenceNodes = variableReferenceNodes;
    this.variableReferenceSpanCoordinatesLayer =
      constructSpanCoordinatesFromNodes(
        "variable-reference",
        this.rawCodeText,
        variableReferenceNodes,
        this.variableDefinitionHashToStyle,
        codeStartLocation
      );

    this.divLineWrapperLayer = this._constructDivWrapperCoordinatesLayer(
      this.rawCodeText
    );

    this.nestedFunctionDefinitionNodes = nestedFunctionDefinitionNodes;

    // this._markNestedFunctionContentAsHiddenDiv(
    //   this.rawCodeText,
    //   nestedFunctionDefinitionNodes,
    //   codeStartLocation,
    //   this.divLineWrapperLayer
    // );
  }

  draw(left = 0, top = 0) {
    if (this._isDrawn) {
      throw new Error("Box is already drawn. Box can only be drawn once.");
    }
    this.document.body.appendChild(this.constructHTMLElement(left, top));
    this._isDrawn = true;
  }

  scrollToBottom() {
    let codeBoxContainer = this.htmlElement().querySelector(
      ".codeBoxInnerContainer"
    );
    codeBoxContainer.scrollTo(0, codeBoxContainer.scrollHeight);
  }

  constructHTMLElement(left = 0, top = 0) {
    const codeBoxEl = document.createElement("div");
    codeBoxEl.setAttribute("id", this.id_);
    codeBoxEl.classList.add("codeBox");
    codeBoxEl.classList.add("draggableBox");
    codeBoxEl.classList.add("animateZoomIn");
    codeBoxEl.style.left = `${left}px`;
    codeBoxEl.style.top = `${top}px`;

    /* constructW codeBoxInnerContainer */
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

    const functionReferences =
      codeTextElement.querySelectorAll(".functionReference");
    functionReferences.forEach((functionReference) => {
      let bindedFunction = this._handleFunctionReferenceClick.bind(
        this,
        functionReference,
        this.id(),
        this.document
      );
      functionReference.addEventListener("click", bindedFunction);
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

    function pickRandomColorButtonClickHandler(event) {
      const colorOptions = [
        { backgroundColor: "#a9a9a9", textColor: "#000000" },
        { backgroundColor: "#2f4f4f", textColor: "#FFFFFF" },
        { backgroundColor: "#556b2f", textColor: "#FFFFFF" },
        { backgroundColor: "#483d8b", textColor: "#FFFFFF" },
        { backgroundColor: "#b22222", textColor: "#FFFFFF" },
        { backgroundColor: "#008000", textColor: "#FFFFFF" },
        { backgroundColor: "#000080", textColor: "#FFFFFF" },
        { backgroundColor: "#9acd32", textColor: "#000000" },
        { backgroundColor: "#20b2aa", textColor: "#FFFFFF" },
        { backgroundColor: "#8b008b", textColor: "#FFFFFF" },
        { backgroundColor: "#ff0000", textColor: "#FFFFFF" },
        { backgroundColor: "#ff8c00", textColor: "#000000" },
        { backgroundColor: "#ffd700", textColor: "#000000" },
        { backgroundColor: "#00ff00", textColor: "#000000" },
        { backgroundColor: "#00fa9a", textColor: "#000000" },
        { backgroundColor: "#8a2be2", textColor: "#FFFFFF" },
        { backgroundColor: "#00bfff", textColor: "#000000" },
        { backgroundColor: "#0000ff", textColor: "#FFFFFF" },
        { backgroundColor: "#ff00ff", textColor: "#000000" },
        { backgroundColor: "#1e90ff", textColor: "#000000" },
        { backgroundColor: "#db7093", textColor: "#FFFFFF" },
        { backgroundColor: "#eee8aa", textColor: "#000000" },
        { backgroundColor: "#ff1493", textColor: "#FFFFFF" },
        { backgroundColor: "#ffa07a", textColor: "#000000" },
        { backgroundColor: "#ee82ee", textColor: "#000000" },
      ];

      const randomIndex = Math.floor(Math.random() * colorOptions.length);
      const pickedColor = colorOptions[randomIndex];
      highlightVariable(this, pickedColor);
      this.trackableState.chosenVariableHighlightColor.add(
        pickedColor.backgroundColor
      );
      colorPickerBox.remove();
    }

    function removeColorBoxClickHandler(event) {
      unHighlightVariable(this);
      colorPickerBox.remove();
    }

    function highlightVariable(codeBox, colorTextColorPair) {
      const variableDefinitionHash = variableReferenceEl.getAttribute(
        "variable-definition-hash"
      );

      // get all the variable reference that has the same variable definition hash
      // TODO: This is buggy because if two variable belong to two different codeboxes from *different* functionRoot,
      //   this selector will catch it even though it shouldn't
      let relevantVariableReferences = Array.from(
        codeBox.document.querySelectorAll(
          `span[variable-definition-hash="${variableDefinitionHash}"]`
        )
      );

      relevantVariableReferences.forEach((relevantVariableReference) => {
        relevantVariableReference.classList.add("highlight");
        relevantVariableReference.style.backgroundColor =
          colorTextColorPair.backgroundColor;
        relevantVariableReference.style.color = colorTextColorPair.textColor;
        codeBox.variableDefinitionHashToStyle[variableDefinitionHash] = {
          highlighted: true,
          backgroundColor: colorTextColorPair.backgroundColor,
          textColor: colorTextColorPair.textColor,
        };
      });
    }

    function unHighlightVariable(codeBox) {
      const variableDefinitionHash = variableReferenceEl.getAttribute(
        "variable-definition-hash"
      );

      // use HTMLBoxGraph.getSiblingBoxes to get all the relevant variable references from sibling code boxes
      let relevantVariableReferences = Array.from(
        codeTextElement.querySelectorAll(
          `span[variable-definition-hash="${variableDefinitionHash}"]`
        )
      );
      htmlBoxGraph.getSiblingBoxes(codeBoxId).forEach((siblingBox) => {
        let siblingCodeTextElement = siblingBox
          .htmlElement()
          .querySelector(".codeText");
        let innerRelevantVariableReferences =
          siblingCodeTextElement.querySelectorAll(
            `span[variable-definition-hash="${variableDefinitionHash}"]`
          );
        innerRelevantVariableReferences.forEach((relevantVariableReference) => {
          relevantVariableReferences.push(relevantVariableReference);
        });
      });

      relevantVariableReferences.forEach((relevantVariableReference) => {
        // remove "highlight" class
        relevantVariableReference.classList.remove("highlight");
        relevantVariableReference.style.backgroundColor = "";
        relevantVariableReference.style.color = "";
        codeBox.variableDefinitionHashToStyle[variableDefinitionHash] = {
          highlighted: false,
          backgroundColor: "",
          textColor: "",
        };
      });
    }

    if (document.getElementById("colorPickerBoxId")) {
      document.getElementById("colorPickerBoxId").remove();
    }

    // TODO: DO NOT MERGE. Need to encapsulate the creation of colorPickerBox into a function/class
    let colorPickerWidth = 145;
    let colorPickerHeight = 115;

    let colorPickerBox = document.createElement("div");
    colorPickerBox.id = "colorPickerBoxId";
    colorPickerBox.classList.add("colorPickerBox");
    colorPickerBox.style.width = `${colorPickerWidth}px`;
    colorPickerBox.style.minHeight = `${colorPickerHeight}px`;

    // <Construct colorHighlightIconSection>
    let colorHighlightIcon = document.createElement("img");
    colorHighlightIcon.src = "../assets/colorHighlighter.svg";
    colorHighlightIcon.style.width = "15px";
    colorHighlightIcon.style.height = "17px";

    let colorHighlighterIconSection = document.createElement("div");
    colorHighlighterIconSection.classList.add("colorHighlighterIconSection");
    colorHighlighterIconSection.appendChild(colorHighlightIcon);

    colorPickerBox.appendChild(colorHighlighterIconSection);
    // </Construct colorHighlightIconSection>

    // <Construct pickRandomColorButton>
    let pickRandomColorButton = document.createElement("div");
    pickRandomColorButton.classList.add("pickRandomColorButton");
    pickRandomColorButton.innerHTML = "Pick Random Color";
    pickRandomColorButton.addEventListener("mouseenter", (event) => {
      this.prevBackgroundColor = pickRandomColorButton.style.backgroundColor;
      pickRandomColorButton.style.backgroundColor = "#fdd632";
      // add box shadow to the button
      pickRandomColorButton.style.boxShadow = "0px 0px 5px 0px #fdd632";
      pickRandomColorButton.style.color = "black";
    });
    pickRandomColorButton.addEventListener("mouseleave", (event) => {
      pickRandomColorButton.style.backgroundColor = this.prevBackgroundColor;
      pickRandomColorButton.style.boxShadow = "";
      pickRandomColorButton.style.color = "white";
    });
    pickRandomColorButton.addEventListener(
      "click",
      pickRandomColorButtonClickHandler.bind(this)
    );
    colorPickerBox.appendChild(pickRandomColorButton);
    // </Construct pickRandomColorButton>

    let colorPalleteSection = document.createElement("div");

    const colorItem = [
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

    colorPalleteSection.classList.add("colorPalleteSection");

    let colorPalleteRowList = [];
    let box_per_row = 5;

    let colorPaletteToRender = [];
    // hack because the first colorItem to render is the the "color" to remove the color
    colorPaletteToRender.push(null);
    for (let i = 0; i < colorItem.length; i++) {
      colorPaletteToRender.push(colorItem[i]);
    }

    // <Construct the colorPalleteRowList>
    for (
      let i = 0;
      i <
      Math.min(
        Math.floor(colorPaletteToRender.length / box_per_row),
        box_per_row
      ) +
        1;
      i++
    ) {
      let colorPalleteRow = document.createElement("div");
      colorPalleteRow.classList.add("colorPaletteRow");
      colorPalleteRowList.push(colorPalleteRow);
    }
    // </Construct the colorPalleteRowList>

    // <Construct the removeColorPallette>
    let colorBoxWidth = 15;
    let colorBoxRightMargin =
      (125 - box_per_row * colorBoxWidth) / (box_per_row - 1);

    let removeColorBox = document.createElement("div");
    removeColorBox.classList.add("colorBox");
    removeColorBox.style.width = `${colorBoxWidth}px`;
    removeColorBox.style.height = `${colorBoxWidth}px`;
    removeColorBox.style.borderRadius = "5px";
    removeColorBox.style.border = "2px solid gray";
    removeColorBox.style.marginRight = `${colorBoxRightMargin}px`;
    removeColorBox.addEventListener(
      "click",
      removeColorBoxClickHandler.bind(this)
    );
    colorPalleteRowList[0].appendChild(removeColorBox);
    // </Construct the removeColorPallette>

    // <Construct the selectedColorBox>
    for (let i = 1; i < colorPaletteToRender.length; i++) {
      let colorBox = document.createElement("div");
      colorBox.classList.add("colorBox");
      colorBox.style.width = "15px";
      colorBox.style.height = "15px";
      colorBox.style.borderRadius = "5px";
      colorBox.style.backgroundColor = colorPaletteToRender[i].backgroundColor;

      // if i is not the right most box
      if ((i + 1) % box_per_row != 0) {
        colorBox.style.marginRight = `${colorBoxRightMargin}px`;
      }

      colorBox.addEventListener("mouseenter", (event) => {
        colorBox.style.boxShadow = `0px 0px 5px 0px ${colorPaletteToRender[i].backgroundColor}`;
        glowSameColorVariableReference(colorPaletteToRender[i].backgroundColor);
      });

      colorBox.addEventListener("mouseleave", (event) => {
        colorBox.style.boxShadow = "";
        unGlowSameColorVariableReference();
      });
      colorBox.addEventListener("click", (event) => {
        highlightVariable(this, {
          backgroundColor: colorPaletteToRender[i].backgroundColor,
          textColor: colorPaletteToRender[i].textColor,
        });
        colorPickerBox.remove();
        unGlowSameColorVariableReference();
      });

      colorPalleteRowList[Math.floor(i / box_per_row)].appendChild(colorBox);
    }
    // </Construct the selectedColorBox>

    for (let i = 0; i < colorPalleteRowList.length; i++) {
      colorPalleteSection.appendChild(colorPalleteRowList[i]);
    }

    colorPickerBox.appendChild(colorPalleteSection);

    // place the box at the mouse position
    colorPickerBox.style.left = `${event.pageX + 30}px`;
    colorPickerBox.style.top = `${event.pageY + 10}px`;

    this.document.body.appendChild(colorPickerBox);
  }

  async _handleFunctionReferenceClick(
    functionReference,
    codeBoxId,
    document,
    event
  ) {
    // TODO BUG: This is a bug since if the user click reference from different box, we should not return
    if (
      this.htmlBoxGraph.renderedFunctionReferenceHashes.has(
        functionReference.getAttribute("function-reference-hash")
      )
    ) {
      return;
    }
    const functionDefinitionHash = functionReference.getAttribute(
      "function-definition-hash"
    );

    const functionReferenceHash = functionReference.getAttribute(
      "function-reference-hash"
    );
    this.htmlBoxGraph.renderedFunctionReferenceHashes.add(
      functionReferenceHash
    );

    const response = await fetch(
      `http://localhost:3000/get-function-reference?key=${functionReferenceHash}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch ${functionReferenceHash}`);
    }

    const responseJson = await response.json();
    const functionReferenceNode = await responseJson.functionReference;

    let { firstCodeBox, secondCodeBox } = splitCodeBoxAndRedrawSVGArrows(
      functionReferenceNode.location.callRange,
      this.htmlBoxGraph,
      this
    );

    // get the hostbox position
    const hostCodeBox = this;
    const hostCodeBoxhtmlElement = hostCodeBox.htmlElement();
    const hostCodeBoxPosition = getDocumentRelativePosition(
      hostCodeBoxhtmlElement
    );
    hostCodeBox.htmlElement().remove();

    let { functionMetadataBox, codeBox } =
      await getFunctionMetadataBoxAndCodebox(
        document,
        this.htmlBoxGraph,
        this.trackableState,
        functionDefinitionHash
      );

    functionMetadataBox.draw(
      getDocumentRelativePosition(firstCodeBox.htmlElement()).left + 100,
      getDocumentRelativePosition(firstCodeBox.htmlElement()).bottom + 100
    );
    codeBox.draw(
      getDocumentRelativePosition(functionMetadataBox.htmlElement()).left,
      getDocumentRelativePosition(functionMetadataBox.htmlElement()).bottom + 75
    );

    this.htmlBoxGraph.addBox(functionMetadataBox);
    this.htmlBoxGraph.addBox(codeBox);

    // TODO: There is a bug. We actually need to pass in the id of functionName box
    this.htmlBoxGraph.connectTwoBoxes(
      firstCodeBox.id(),
      functionMetadataBox.id()
    );
    this.htmlBoxGraph.connectTwoBoxes(functionMetadataBox.id(), codeBox.id());
    injectDraggingBehaviour(
      this.document,
      functionMetadataBox.htmlElement(),
      this.htmlBoxGraph
    );
    injectDraggingBehaviour(
      this.document,
      codeBox.htmlElement(),
      this.htmlBoxGraph
    );

    this._tidyChildrenOfSecondBox(secondCodeBox, hostCodeBoxPosition);

    // at this point all the things that recently drawn have been drawn
    this._tidyTheGraph(
      this.htmlBoxGraph,
      firstCodeBox,
      secondCodeBox,
      functionMetadataBox,
      codeBox
    );
  }

  _tidyChildrenOfSecondBox(secondCodeBox, hostCodeBoxPosition) {
    let childrenIdItems = this.htmlBoxGraph.getChildrenBoxIdItems(
      secondCodeBox.id()
    );
    let secondCodeBoxPosition = getDocumentRelativePosition(
      secondCodeBox.htmlElement()
    );
    let leftDelta = secondCodeBoxPosition.left - hostCodeBoxPosition.left;
    let topDelta = secondCodeBoxPosition.top - hostCodeBoxPosition.top;

    for (let childrenIdItem of childrenIdItems) {
      let childrenSubTree = this.htmlBoxGraph.getSubTree(childrenIdItem.box_id);
      for (let childrenSubTreeItem of childrenSubTree) {
        let childrenSubTreeItemHtmlElement = childrenSubTreeItem.htmlElement();
        let childrenSubTreeItemPosition = getDocumentRelativePosition(
          childrenSubTreeItemHtmlElement
        );
        childrenSubTreeItemHtmlElement.style.top =
          childrenSubTreeItemPosition.top + topDelta + "px";
        childrenSubTreeItemHtmlElement.style.left =
          childrenSubTreeItemPosition.left + leftDelta + "px";
        this.htmlBoxGraph.recomputeSVGArrowConnections(
          childrenSubTreeItem.id()
        );
      }
    }
  }

  _tidyTheGraph(
    /** @type {HTMLDivElement} */
    htmlBoxGraph,
    firstCodeBox,
    secondCodeBox,
    functionMetadataBox,
    codeBox
  ) {
    function constructVirtualBox(boxId, htmlBoxGraph) {
      return {
        id: boxId,
        position: getDocumentRelativePosition(
          htmlBoxGraph.getBox(boxId).htmlElement()
        ),
      };
    }

    function constructVirtualBoxFromMovementInstruction(
      boxId,
      htmlBoxGraph,
      movementInstruction
    ) {
      let position = getDocumentRelativePosition(
        htmlBoxGraph.getBox(boxId).htmlElement()
      );
      position.left = movementInstruction.newLeft;
      position.right = position.left + position.width;
      return {
        id: boxId,
        position: position,
      };
    }

    function findNeighbors(entityId) {
      let parentIdItems = htmlBoxGraph.getParentBoxIdItems(entityId);
      let childrenIdItems = htmlBoxGraph.getChildrenBoxIdItems(entityId);
      let ret = [];
      for (let parentIdItem of parentIdItems) {
        ret.push(parentIdItem.box_id);
      }
      for (let childrenIdItem of childrenIdItems) {
        ret.push(childrenIdItem.box_id);
      }
      return ret;
    }

    function collides(virtualBox, entityId2) {
      let entity2 = htmlBoxGraph.getBox(entityId2);

      let entity2Position = getDocumentRelativePosition(entity2.htmlElement());

      return (
        virtualBox.position.left < entity2Position.right &&
        virtualBox.position.right > entity2Position.left &&
        virtualBox.position.top < entity2Position.bottom &&
        virtualBox.position.bottom > entity2Position.top
      );
    }

    function constructMovementInstruction(virtualBox, entityId2) {
      if (!collides(virtualBox, entityId2)) {
        throw new Error("entityId1 and entityId2 does not collide");
      }
      let entity2Position = getDocumentRelativePosition(
        htmlBoxGraph.getBox(entityId2).htmlElement()
      );

      if (virtualBox.position.left < entity2Position.left) {
        return {
          targetEntityId: entityId2,
          referenceEntityId: virtualBox.id,
          newLeft: virtualBox.position.right + 100,
        };
      } else {
        return {
          targetEntityId: entityId2,
          referenceEntityId: virtualBox.id,
          newLeft: virtualBox.position.left - 100,
        };
      }
    }

    function findOtherEntitiesThatCollideWith(
      virtualBox,
      movementInstructions
    ) {
      let graphQueue = findNeighbors(virtualBox.id);
      let addedToQueue = new Set();
      addedToQueue.add(virtualBox.id);

      let shortCircuitIndex = 0;
      while (graphQueue.length > 0) {
        // if (shortCircuitIndex > 1000) {
        //   throw new Error("short circuit");
        // }
        let currentBoxId = graphQueue.shift();

        if (collides(virtualBox, currentBoxId)) {
          let movementInstruction = constructMovementInstruction(
            virtualBox,
            currentBoxId
          );
          movementInstructions[movementInstruction.targetEntityId] =
            movementInstruction;
        }

        let neighbors = findNeighbors(currentBoxId);
        for (let neighbor of neighbors) {
          if (!addedToQueue.has(neighbor)) {
            addedToQueue.add(neighbor);
            graphQueue.push(neighbor);
          }
        }
      }
    }

    function moveEntity(movementInstruction) {
      let targetEntity = htmlBoxGraph.getBox(
        movementInstruction.targetEntityId
      );
      const duration = 200;
      const startTime = performance.now();
      const initialLeft = parseFloat(
        getComputedStyle(targetEntity.htmlElement()).left
      ); // Get the initial left position as a number

      function step(currentTime) {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        const newLeft =
          initialLeft + (movementInstruction.newLeft - initialLeft) * progress; // Interpolate between initial and final positions
        targetEntity.htmlElement().style.left = newLeft + "px";
        htmlBoxGraph.recomputeSVGArrowConnections(targetEntity.id());
        if (progress < 1) {
          requestAnimationFrame(step);
        }
      }
      requestAnimationFrame(step);
    }

    let entityPacketQueue = [
      [
        constructVirtualBox(firstCodeBox.id(), htmlBoxGraph),
        constructVirtualBox(secondCodeBox.id(), htmlBoxGraph),
        constructVirtualBox(functionMetadataBox.id(), htmlBoxGraph),
        constructVirtualBox(codeBox.id(), htmlBoxGraph),
      ],
    ];
    let alreadyAddedToTheQueue = new Set([
      firstCodeBox.id(),
      secondCodeBox.id(),
      functionMetadataBox.id(),
      codeBox.id(),
    ]);

    let shortCircuitIndex = 0;
    let outerMovementInstructions = {};
    while (entityPacketQueue.length > 0) {
      // if (shortCircuitIndex > 1000) {
      //   throw new Error("short circuit");
      // }
      // shortCircuitIndex++;
      let currentVirtualBoxes = entityPacketQueue.shift();
      let movementInstructions = {};

      for (let currentVirtualBox of currentVirtualBoxes) {
        findOtherEntitiesThatCollideWith(
          currentVirtualBox,
          movementInstructions
        );
      }

      let nextPacketQueue = [];
      for (let movementInstruction of Object.values(movementInstructions)) {
        if (!alreadyAddedToTheQueue.has(movementInstruction.targetEntityId)) {
          alreadyAddedToTheQueue.add(movementInstruction.targetEntityId);
          outerMovementInstructions[movementInstruction.targetEntityId] =
            movementInstruction;
          nextPacketQueue.push(
            constructVirtualBoxFromMovementInstruction(
              movementInstruction.targetEntityId,
              htmlBoxGraph,
              movementInstruction
            )
          );
        }
      }
      if (nextPacketQueue.length > 0) {
        entityPacketQueue.push(nextPacketQueue);
      }
    }

    for (let movementInstruction of Object.values(outerMovementInstructions)) {
      moveEntity(movementInstruction);
    }
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

        let style = this.variableDefinitionHashToStyle[currentNode.hashString];
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
          this.variableDefinitionHashToStyle[
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
