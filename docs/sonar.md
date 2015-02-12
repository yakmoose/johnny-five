<!--remove-start-->
# Sonar Component

Run with:
```bash
node eg/sonar.js
```
<!--remove-end-->

```javascript
var five = require("johnny-five");
var board = new five.Board();

board.on("ready", function() {
  var sonar = new five.Sonar("A0");

  sonar.on("change", function() {
    console.log("inches     : " + this.in);
    console.log("centimeters: " + this.cm);
    console.log("-----------------------");
  });
});

```


## Breadboard/Illustration


![docs/breadboard/sonar.png](breadboard/sonar.png)
[docs/breadboard/sonar.fzz](breadboard/sonar.fzz)




<!--remove-start-->
## License
Copyright (c) 2012, 2013, 2014 Rick Waldron <waldron.rick@gmail.com>
Licensed under the MIT license.
Copyright (c) 2014, 2015 The Johnny-Five Contributors
Licensed under the MIT license.
<!--remove-end-->
