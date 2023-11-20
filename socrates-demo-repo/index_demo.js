import {
  CodeBox,
  FunctionMetadataBox,
  HTMLBoxGraph,
  TrackableState,
  getFunctionMetadataBoxAndCodebox,
  injectDraggingBehaviour,
} from "./utils_demo";

function main() {
  let htmlBoxGraph = new HTMLBoxGraph();
  let trackableState = new TrackableState();

  let functionMetadataAndCodeBox = getFunctionMetadataBoxAndCodebox(
    document,
    htmlBoxGraph,
    trackableState,
    "function-definition:file:///Users/fahrankamili/Projects/socrates-frontend/src/index.js:23:0"
  );

  /** @type {FunctionMetadataBox} */
  let functionMetadataBox;

  /** @type {CodeBox} */
  let codeBox;

  if (functionMetadataAndCodeBox !== null) {
    functionMetadataBox = functionMetadataAndCodeBox[0];
    codeBox = functionMetadataAndCodeBox[1];

    functionMetadataBox.draw(2000, 560);
    codeBox.draw(2000, 760);

    htmlBoxGraph.addBox(functionMetadataBox);
    htmlBoxGraph.addBox(codeBox);

    htmlBoxGraph.connectTwoBoxes(functionMetadataBox.id(), codeBox.id());

    injectDraggingBehaviour(
      document,
      functionMetadataBox.htmlElement(),
      htmlBoxGraph
    );
    injectDraggingBehaviour(document, codeBox.htmlElement(), htmlBoxGraph);
  }
}

main();
