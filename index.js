require("dotenv").config();

const bot    = require("./bot.js"),
      server = require("./server.js");

bot.run();
server.run();