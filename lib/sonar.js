var Board = require("../lib/board.js"),
  Emitter = require("events").EventEmitter,
  util = require("util"),
  within = require("./mixins/within"),
  __ = require("./fn");

var priv = new Map();
var Controllers;

/**
 * Sonar
 * @constructor
 *
 * @param {Object} opts Options: pin (analog)
 */

function Sonar(opts) {

  if (!(this instanceof Sonar)) {
    return new Sonar(opts);
  }

  Board.Component.call(
    this, opts = Board.Options(opts)
  );

  var controller = null;
  var err = null;
  var state = {
    median: 0,
    value: 0,
    samples: []
  };

  this.freq = opts.freq || 25;

  if (typeof opts.controller === "string") {
    controller = Controllers[opts.controller];
  } else {
    controller = opts.controller;
  }

  if (controller == null) {
    controller = Controllers.DEFAULT;
  }

  Object.defineProperties(this, controller);

  if (!this.toCm) {
    this.toCm = opts.toCm || function(x) { return x; };
  }

  Object.defineProperties(this, {
    value: {
      get: function() {
        return state.value;
      }
    },
    /**
     * [read-only] Calculated centimeter value
     * @property centimeters
     * @type Number
     */
    centimeters: {
      get: function() {
        return this.toCm(state.value);
      }
    },
    cm: {
      get: function () {
        return this.centimeters;
      }
    },
    /**
     * [read-only] Calculated inch value
     * @property inches
     * @type Number
     */
    inches: {
      get: function() {
        // These devices have 1in resolution
        return Math.round(this.centimeters * 0.39);
      }
    },
    in: {
      get: function () {
        return this.inches;
      }
    },
  });

  if (typeof this.initialize === "function") {
    this.initialize(opts, function(data) {
      if (Math.round(data) !== Math.round(state.value)) {
        this.emit("change", this);
      }

      state.value = data;
    }.bind(this));
  }

  // Throttle
  setInterval(function() {
    console.log("message");
    this.emit("data", this);
 }.bind(this), this.freq);
}


util.inherits(Sonar, Emitter);

__.mixin(Sonar.prototype, within);

Controllers = {
  SRF10: {
    initialize: {
      value: function() {

        var samples = priv.get(this).samples;
        var address = 0x70;
        var delay = 65;

        // Set up I2C data connection
        this.io.i2cConfig();

        // Startup parameter
        this.io.i2cWrite(address, [0x01, 16]);
        this.io.i2cWrite(address, [0x02, 255]);

        // this.io.setMaxListeners(100);

        function read() {
          this.io.i2cWrite(address, [0x02]);
          this.io.i2cReadOnce(address, 2, function(data) {
            dataHandler(int16(data[0], data[1]));
            // samples.push((data[0] << 8) | data[1]);
          }.bind(this));

          prime.call(this);
        }

        function prime() {
          this.io.i2cWrite(address, [0x00, 0x52]);
          setTimeout(read.bind(this), delay);
        }

        prime.call(this);
      }
    },
    toCm: {
      value: function(raw) {
        return (((raw / 2) * 343.2) / 10) / 1000;
      }
    }
  },

  DEFAULT: {
    initialize: {
      value: function(opts, dataHandler) {

        // Set the pin to ANALOG mode
        this.mode = this.io.MODES.ANALOG;
        this.io.pinMode(this.pin, this.mode);

        this.io.analogRead(this.pin, function(data) {
          dataHandler(data);
        }.bind(this));
      }
    },
    toCm: {
      value: function(raw) {
        return Math.round(raw / 2) * 2.54;
      }
    }
  }
};

Controllers.SRF02 = Controllers.SRF08 = Controllers.SRF10;

module.exports = Sonar;

// Reference
//
// http://www.maxbotix.com/tutorials.htm#Code_example_for_the_BasicX_BX24p
// http://www.electrojoystick.com/tutorial/?page_id=285

// Tutorials
//
// http://www.sensorpedia.com/blog/how-to-interface-an-ultrasonic-rangefinder-with-sensorpedia-via-twitter-guide-2/
