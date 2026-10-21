/**
 * The Node controller's event API, against the committed dist bundle (#686, #731).
 *
 * - Listeners registered with on(), the EventEmitter API that examples/node uses, receive
 *   every dispatched event, also when no addEventListener() listener exists for that
 *   name.
 * - Event names that are also Object.prototype properties ("toString", "constructor",
 *   ...) behave like any other name: dispatching them does not throw.
 *
 * Run with `npm run test:node`.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ARControllerNFT } = require("../../dist/ARToolkitNFT_node.js");

describe("Node ARControllerNFT events", () => {
  it("delivers to on() listeners when no addEventListener() listener exists", () => {
    const ar = new ARControllerNFT();
    const received = [];
    ar.on("getNFTMarker", (event) => received.push(event));

    const event = { name: "getNFTMarker", target: ar };
    ar.dispatchEvent(event);

    assert.deepEqual(received, [event]);
  });

  it("delivers to on() and addEventListener() listeners alike", () => {
    const ar = new ARControllerNFT();
    const order = [];
    ar.on("lostNFTMarker", () => order.push("on"));
    ar.addEventListener("lostNFTMarker", () => order.push("addEventListener"));

    ar.dispatchEvent({ name: "lostNFTMarker", target: ar });

    // addEventListener() listeners first, then the EventEmitter.
    assert.deepEqual(order, ["addEventListener", "on"]);
  });

  it("treats Object.prototype property names as ordinary event names", () => {
    const ar = new ARControllerNFT();
    for (const name of [
      "toString",
      "constructor",
      "hasOwnProperty",
      "__proto__",
    ]) {
      assert.doesNotThrow(() => ar.dispatchEvent({ name, target: ar }), name);

      let fired = 0;
      const listener = () => {
        fired += 1;
      };
      ar.addEventListener(name, listener);
      ar.dispatchEvent({ name, target: ar });
      assert.equal(fired, 1, name);

      ar.removeEventListener(name, listener);
      ar.dispatchEvent({ name, target: ar });
      assert.equal(fired, 1, name);
    }
  });
});
