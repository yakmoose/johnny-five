var Board = require("./board"),
  events = require("events"),
  util = require("util"),
  __ = require("./fn"),
  sum = __.sum,
  int16 = __.int16;

var priv = new Map();
var axes = ["x", "y", "z"];

function ToPrecision(val, precision) {
  return +(val).toPrecision(precision);
}

var Controllers = {
  ANALOG: {
    initialize: {
      value: function(opts, dataHandler) {
        var pins = opts.pins || [],
          sensitivity, resolution,
          state = priv.get(this),
          dataPoints = {};

        if (opts.sensitivity === undefined) {
          throw new Error("Expected a Sensitivity");
        }

        // 4.88mV / (0.167mV/dps * 2)
        // 0.67 = 4X
        // 0.167 = 1X
        sensitivity = opts.sensitivity;
        resolution = opts.resolution || 4.88;
        state.K = resolution / sensitivity;

        pins.forEach(function(pin, index) {
          this.io.pinMode(pin, this.io.MODES.ANALOG);
          this.io.analogRead(pin, function(data) {
            var axis = axes[index];
            dataPoints[axis] = data;
            dataHandler(dataPoints);
          }.bind(this));
        }, this);
      }
    },
    toNormal: {
      value: function(raw) {
        return raw >> 2;
      }
    },
    toDegreesPerSecond: {
      value: function(raw, rawCenter) {
        var normal = this.toNormal(raw);
        var center = this.toNormal(rawCenter);
        var state = priv.get(this);

        return ((normal - center) * state.K) | 0;
      }
    }
  },
  // http://www.invensense.com/mems/gyro/mpu6050.html
  // Default to the +- 250 which has a 131 LSB/dps
  MPU6050: {
    initialize: {
      value: function(opts, dataHandler) {
        var IMU = require("./imu");
        var state = priv.get(this),
          driver = IMU.Drivers.get(this.board, "MPU-6050", opts);

        state.sensitivity = opts.sensitivity || 131;

        driver.on("data", function(data) {
          dataHandler(data.gyro);
        });
      }
    },
    toNormal: {
      value: function(raw) {
        return (raw >> 11) + 127;
      }
    },
    toDegreesPerSecond: {
      value: function(raw, rawCenter) {
        var state = priv.get(this);

        return (raw - rawCenter) / state.sensitivity;
      }
    }
  },
  BNO055: {
    initialize: {
      value: function(opts, dataHandler) {
        var IMU = require("./imu");
        var state = priv.get(this),
          driver = IMU.Drivers.get(this.board, "BNO055", opts);

        // AF p.14, OUTPUT SIGNAL GYROSCOPE, set this to 16 as according to AF.51 the default for the unit register
        // is degrees. and there may be a bug in the Ada fruit code as it has the setting to radians disabled
        // but the sensitivity / scale set to 900 which is used for radian reps
        state.sensitivity = 16;

        driver.on("data", function(data) {
          dataHandler(data.gyro);
        });
      }
    },
    toNormal: {
      value: function(raw) {
        return raw;
      }
    },
    toDegreesPerSecond: {
      value: function(raw) {
        var state = priv.get(this);
        return raw / state.sensitivity;
      }
    }
  },
  L3GD20H: {
    //this is based primarily on the Polou boards.
    ADDRESSES: {
      //SA0 on polou boards is pulled high, 6a when SA0 is pulled low.
      value: [0x6B, 0x6A]
    },
    REGISTER: {
      value: {
        LOW_ODR: 0x39,
        CTRL_REG1: 0x20,
        CTRL_REG4: 0x23,

        OUT_X_L: 0x28,
        OUT_X_H: 0x29,
        OUT_Y_L: 0x2A,
        OUT_Y_H: 0x2B,
        OUT_Z_L: 0x2C,
        OUT_Z_H: 0x2D,
      }
    },
    initialize: {
      value: function (opts, dataHandler) {

        var io = this.board.io;
        var address = opts.address || this.ADDRESSES[0];
        var state = priv.get(this);

        io.i2cConfig(opts);

        // initialise as per Pololu examples.
        // PO. = https://www.pololu.com/file/0J731/L3GD20H.pdf

        // disable low ODR mode
        // PO. p48 7.24
        //
        // LOW_ODR
        // 7. -
        // 6. -
        // 5. INT2 pin data ready, DRDY_HL 0 = active high, active low
        // 4. 0 - must be zero for correct operation
        // 3. disable i2c 0 = on, 1 = spi only
        // 2. sofware reset 0 = normal, 1 = reset
        // 1. 0 - must be 0 for correct operation
        // 0. low speed odr 0 = disable, 1 = enable
        io.i2cWrite(address, this.REGISTER.LOW_ODR, 0x00);

        // full scale ±250dps
        // PO. p.39 7.5
        //
        // CTRL_REG4
        // 7. block data update: 0 = continuous, 1 = MSB/LSB read
        // 6. Endianess: 0 = LSB lower address, 1 = MSB lower address
        // 5. fs1 Full scale resolution
        // 4. fs0 00 = 245dps, 01 = 500dps, 1x = 2000 dps
        // 3. IMPen / Level sensitive latch 0 = disabled, 1 = enabled
        // 2. st2 self test
        // 1. st1 00 = normal, 01 = self test (+), 10 = unused, 11 = self test (-)
        // 0. SPI mode 0 = 4 wire, 1 = 3 wire
        io.i2cWrite(address, this.REGISTER.CTRL_REG4, 0x00);

        // PO. p.10 2.1 Mechanical characteristics - sensitivity in mdps
        state.sensitivity = 8.75 / 1000;

          //set bandwidth, frequency etc..
        // PO. p.36 7.2
        //
        // CTRL_REG1
        // 7. DR1
        // 6. DR0 - output data rate - see table 21, pg 37
        // 5. BW1
        // 4. BW0 - output bandwidth - see table 21, pg 37
        // 3. PD - Power mode 0 = Power down 1 = Normal mode. / Sleep is  1000 on bits 3-0
        // 2. Zen - Z axis enable
        // 1. Yen - Y axis enable
        // 0. Xen - Z axis enable
        // 0b01101111  (200hz ODR, 50hz BW - Pololu driver) all axis on
        io.i2cWrite(address, this.REGISTER.CTRL_REG1, 0x6f);


        //lets get the reading going...
        // PO. p.28 5.1.1 i2c operation
        // the msb is asserted to get the gyro to do subaddress updating
        io.i2cRead(address, this.REGISTER.OUT_X_L | (1 << 7), 6, function (data){
          dataHandler.call(this, {
            x: int16(data[1], data[0]),
            y: int16(data[3], data[2]),
            z: int16(data[5], data[4])
          });
        }.bind(this));

      }
    },
    //toNormal: {
    //  value: function(raw) {
    //    return raw;
    //  }
    //},
    toDegreesPerSecond: {
      value: function(raw) {
        var state = priv.get(this);
        return raw * state.sensitivity;
      }
    }
  }
};

// Otherwise known as...
Controllers["MPU-6050"] = Controllers.MPU6050;

function Gyro(opts) {
  if (!(this instanceof Gyro)) {
    return new Gyro(opts);
  }

  var controller = null;
  var isCalibrated = false;
  var sampleSize = 100;

  var state = {
    x: {
      angle: 0,
      value: 0,
      previous: 0,
      calibration: [],
      stash: [0, 0, 0, 0, 0],
      center: 0,
      hasValue: false
    },
    y: {
      angle: 0,
      value: 0,
      previous: 0,
      calibration: [],
      stash: [0, 0, 0, 0, 0],
      center: 0,
      hasValue: false
    },
    z: {
      angle: 0,
      value: 0,
      previous: 0,
      calibration: [],
      stash: [0, 0, 0, 0, 0],
      center: 0,
      hasValue: false
    }
  };

  Board.Component.call(
    this, opts = Board.Options(opts)
  );

  if (opts.controller && typeof opts.controller === "string") {
    controller = Controllers[opts.controller.toUpperCase()];
  } else {
    controller = opts.controller;
  }

  if (controller == null) {
    controller = Controllers["ANALOG"];
  }

  Board.Controller.call(this, controller, opts);

  if (!this.toNormal) {
    this.toNormal = opts.toNormal || function(raw) { return raw; };
  }

  if (!this.toDegreesPerSecond) {
    this.toDegreesPerSecond = opts.toDegreesPerSecond || function(raw) { return raw; };
  }

  priv.set(this, state);

  if (typeof this.initialize === "function") {
    this.initialize(opts, function(data) {
      var isChange = false;

      Object.keys(data).forEach(function(axis) {
        var value = data[axis];
        var sensor = state[axis];

        sensor.previous = sensor.value;
        sensor.stash.shift();
        sensor.stash.push(value);
        sensor.hasValue = true;
        sensor.value = (sum(sensor.stash) / 5) | 0;

        if (!isCalibrated &&
          (state.x.calibration.length === sampleSize &&
            state.y.calibration.length === sampleSize &&
            (this.z === undefined || state.z.calibration.length === sampleSize))) {

          isCalibrated = true;
          state.x.center = (sum(state.x.calibration) / sampleSize) | 0;
          state.y.center = (sum(state.y.calibration) / sampleSize) | 0;
          state.z.center = (sum(state.z.calibration) / sampleSize) | 0;

          state.x.calibration.length = 0;
          state.y.calibration.length = 0;
          state.z.calibration.length = 0;
        } else {
          if (sensor.calibration.length < sampleSize) {
            sensor.calibration.push(value);
          }
        }

        if (sensor.previous !== sensor.value) {
          isChange = true;
        }
      }, this);

      if (isCalibrated) {

        state.x.angle += this.rate.x / 100;
        state.y.angle += this.rate.y / 100;
        state.z.angle += this.rate.z / 100;

        this.emit("data", {
          x: this.x,
          y: this.y,
          z: this.z
        });

        if (isChange) {
          this.emit("change", {
            x: this.x,
            y: this.y,
            z: this.z
          });
        }
      }
    }.bind(this));
  }

  Object.defineProperties(this, {
    isCalibrated: {
      get: function() {
        return isCalibrated;
      },
      set: function(value) {
        if (typeof value === "boolean") {
          isCalibrated = value;
        }
      }
    },
    pitch: {
      get: function() {
        return {
          rate: ToPrecision(this.rate.y, 2),
          angle: ToPrecision(state.y.angle, 2)
        };
      }
    },
    roll: {
      get: function() {
        return {
          rate: ToPrecision(this.rate.x, 2),
          angle: ToPrecision(state.x.angle, 2)
        };
      }
    },
    yaw: {
      get: function() {
        return {
          rate: this.z !== undefined ? ToPrecision(this.rate.z, 2) : 0,
          angle: this.z !== undefined ? ToPrecision(state.z.angle, 2) : 0
        };
      }
    },
    x: {
      get: function() {
        return ToPrecision(this.toNormal(state.x.value), 4);
      }
    },
    y: {
      get: function() {
        return ToPrecision(this.toNormal(state.y.value), 4);
      }
    },
    z: {
      get: function() {
        return state.z.hasValue ? ToPrecision(this.toNormal(state.z.value), 4) : undefined;
      }
    },
    rate: {
      get: function() {
        var x = this.toDegreesPerSecond(state.x.value, state.x.center);
        var y = this.toDegreesPerSecond(state.y.value, state.y.center);
        var z = state.z.hasValue ?
          this.toDegreesPerSecond(state.z.value, state.z.center) : 0;

        return {
          x: ToPrecision(x, 2),
          y: ToPrecision(y, 2),
          z: ToPrecision(z, 2)
        };
      }
    }
  });
}

Object.defineProperties(Gyro, {
  TK_4X: {
    value: 0.67
  },
  TK_1X: {
    value: 0.167
  }
});


util.inherits(Gyro, events.EventEmitter);

Gyro.prototype.recalibrate = function() {
  this.isCalibrated = false;
};

module.exports = Gyro;
