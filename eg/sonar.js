var five = require("../lib/johnny-five.js");
var board = new five.Board();

board.on("ready", function() {
  var sonar = new five.Sonar("A0");

  sonar.on("change", function() {
    console.log("inches     : " + this.in);
    console.log("centimeters: " + this.cm);
    console.log("-----------------------");
  });
});
