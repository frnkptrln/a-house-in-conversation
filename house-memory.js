"use strict";

// A failed or old-shaped visit record must not keep anyone outside the house.
// Reading never rewrites storage: a room saves again at its existing visit point.
(function (root) {
  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function readVisits(storage) {
    try {
      const source = storage === undefined ? root.localStorage : storage;
      const value = JSON.parse(source.getItem("house-room-visits") || "{}");
      return isRecord(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  const api = { isRecord, readVisits };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HouseMemory = api;
})(typeof globalThis === "object" ? globalThis : this);
