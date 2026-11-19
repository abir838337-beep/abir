/**
 * Compatibility shim. The real pool lives in bot/login/accountPool.js.
 * Older scripts requiring ./accountPool.js from the project root used a broken
 * ../../accountManager.js path; this shim points everyone to the single truth.
 */
"use strict";

module.exports = require("./bot/login/accountPool.js");
